import { FRAME_BYTES, FRAME_SAMPLES, MAX_FRAME_BYTES, TARGET_SAMPLE_RATE } from './config.js';

// Clean-room PCM conversion for meeting captions.
//
// The offscreen document asks Chrome for a 16 kHz AudioContext, so in normal operation the samples already arrive at
// the target rate. Chrome may ignore that request on some platforms, so a streaming windowed-sinc resampler is kept
// as a fallback. This is an independent implementation, not copied from the SignBridge website.

const HALF_TAPS = 12;
const TAPS = HALF_TAPS * 2 + 1;
const PHASES = 64;
const CUTOFF_FRACTION = 0.45;

const kernelCache = new Map();

function buildKernel(inputRate, outputRate) {
  const cacheKey = `${inputRate}:${outputRate}`;
  const cached = kernelCache.get(cacheKey);
  if (cached) return cached;

  const cutoff = (CUTOFF_FRACTION * Math.min(inputRate, outputRate)) / inputRate;
  const table = new Float32Array(PHASES * TAPS);
  for (let phase = 0; phase < PHASES; phase += 1) {
    const fraction = phase / PHASES;
    let total = 0;
    for (let tap = 0; tap < TAPS; tap += 1) {
      const distance = tap - HALF_TAPS - fraction;
      const x = 2 * cutoff * distance;
      const sinc = Math.abs(x) < 1e-9 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
      const window = Math.abs(distance) <= HALF_TAPS
        ? 0.42 + 0.5 * Math.cos((Math.PI * distance) / HALF_TAPS) + 0.08 * Math.cos((2 * Math.PI * distance) / HALF_TAPS)
        : 0;
      const value = 2 * cutoff * sinc * window;
      table[phase * TAPS + tap] = value;
      total += value;
    }
    // Normalise each phase so the filter does not change the speech level.
    for (let tap = 0; tap < TAPS; tap += 1) table[phase * TAPS + tap] /= total;
  }
  kernelCache.set(cacheKey, table);
  return table;
}

function positiveInteger(value, name) {
  if (!Number.isInteger(value) || value <= 0) throw new RangeError(`${name} must be a positive integer.`);
  return value;
}

export class StreamingResampler {
  constructor(inputRate, outputRate = TARGET_SAMPLE_RATE) {
    positiveInteger(inputRate, 'inputRate');
    positiveInteger(outputRate, 'outputRate');
    this.inputRate = inputRate;
    this.outputRate = outputRate;
    this.passthrough = inputRate === outputRate;
    this.kernel = this.passthrough ? null : buildKernel(inputRate, outputRate);
    this.received = 0;
    this.nextOutput = 0;
    this.history = new Float32Array(0);
    this.historyStart = 0;
  }

  process(samples) {
    if (this.passthrough) return samples.slice();
    if (!samples || samples.length === 0) return new Float32Array(0);
    this.received += samples.length;
    const merged = new Float32Array(this.history.length + samples.length);
    merged.set(this.history, 0);
    merged.set(samples, this.history.length);
    this.history = merged;
    return this.drain();
  }

  flush() {
    if (this.passthrough) return new Float32Array(0);
    const padding = new Float32Array(HALF_TAPS + 1);
    this.received += padding.length;
    const merged = new Float32Array(this.history.length + padding.length);
    merged.set(this.history, 0);
    merged.set(padding, this.history.length);
    this.history = merged;
    return this.drain();
  }

  drain() {
    const output = [];
    for (;;) {
      const position = (this.nextOutput * this.inputRate) / this.outputRate;
      const base = Math.floor(position);
      if (base + HALF_TAPS >= this.received) break;
      const fraction = position - base;
      const phase = Math.min(PHASES - 1, Math.floor(fraction * PHASES));
      const kernelOffset = phase * TAPS;
      let sum = 0;
      for (let tap = 0; tap < TAPS; tap += 1) {
        const absolute = base + tap - HALF_TAPS;
        const index = absolute - this.historyStart;
        if (index >= 0 && index < this.history.length) {
          sum += this.kernel[kernelOffset + tap] * this.history[index];
        }
      }
      output.push(sum);
      this.nextOutput += 1;
    }

    const keepFrom = Math.floor((this.nextOutput * this.inputRate) / this.outputRate) - HALF_TAPS;
    const drop = Math.min(keepFrom - this.historyStart, this.history.length);
    if (drop > 0) {
      this.history = this.history.slice(drop);
      this.historyStart += drop;
    }
    return output.length ? Float32Array.from(output) : new Float32Array(0);
  }
}

export function clampSample(value) {
  if (!Number.isFinite(value)) return 0;
  if (value > 1) return 1;
  if (value < -1) return -1;
  return value;
}

export function floatToInt16(samples, out = new Int16Array(samples.length)) {
  for (let index = 0; index < samples.length; index += 1) {
    const value = clampSample(samples[index]);
    out[index] = value < 0 ? Math.round(value * 32768) : Math.round(value * 32767);
  }
  return out;
}

export function int16ToLittleEndianBytes(samples) {
  const buffer = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buffer);
  for (let index = 0; index < samples.length; index += 1) {
    view.setInt16(index * 2, samples[index], true);
  }
  return buffer;
}

export class FrameAssembler {
  constructor(frameSamples = FRAME_SAMPLES) {
    this.frameSamples = frameSamples;
    this.current = new Int16Array(frameSamples);
    this.filled = 0;
  }

  push(samples) {
    const frames = [];
    let offset = 0;
    while (offset < samples.length) {
      const count = Math.min(this.frameSamples - this.filled, samples.length - offset);
      this.current.set(samples.subarray(offset, offset + count), this.filled);
      this.filled += count;
      offset += count;
      if (this.filled === this.frameSamples) {
        frames.push(int16ToLittleEndianBytes(this.current));
        this.filled = 0;
      }
    }
    return frames;
  }

  flush() {
    if (this.filled === 0) return [];
    const frame = int16ToLittleEndianBytes(this.current.subarray(0, this.filled));
    this.filled = 0;
    return [frame];
  }
}

export class PcmEncoder {
  constructor(inputRate, outputRate = TARGET_SAMPLE_RATE) {
    this.resampler = new StreamingResampler(inputRate, outputRate);
    this.frames = new FrameAssembler();
  }

  push(samples) {
    const resampled = this.resampler.process(samples);
    const frames = this.frames.push(floatToInt16(resampled));
    for (const frame of frames) {
      if (frame.byteLength > MAX_FRAME_BYTES) throw new RangeError('PCM frame exceeded the backend limit.');
    }
    return frames;
  }

  flush() {
    const resampled = this.resampler.flush();
    const frames = this.frames.push(floatToInt16(resampled));
    return [...frames, ...this.frames.flush()];
  }
}

export const PCM_LIMITS = Object.freeze({ frameSamples: FRAME_SAMPLES, frameBytes: FRAME_BYTES, maxFrameBytes: MAX_FRAME_BYTES });
