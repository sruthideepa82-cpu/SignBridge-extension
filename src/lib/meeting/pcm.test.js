import { describe, expect, it } from 'vitest';
import {
  FrameAssembler,
  PcmEncoder,
  StreamingResampler,
  floatToInt16,
  int16ToLittleEndianBytes,
} from './pcm.js';
import { FRAME_BYTES, FRAME_SAMPLES } from './config.js';

function sine(sampleRate, seconds, frequency = 440) {
  const samples = new Float32Array(Math.round(sampleRate * seconds));
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = 0.4 * Math.sin((2 * Math.PI * frequency * index) / sampleRate);
  }
  return samples;
}

describe('meeting PCM conversion', () => {
  it('passes 16 kHz samples through unchanged in length', () => {
    const resampler = new StreamingResampler(16000);
    const input = sine(16000, 0.5);
    const output = resampler.process(input);
    expect(output.length).toBe(input.length);
  });

  it('converts 48 kHz to about 16 kHz without unbounded growth', () => {
    const resampler = new StreamingResampler(48000);
    const input = sine(48000, 1);
    let total = 0;
    for (let offset = 0; offset < input.length; offset += 1024) {
      total += resampler.process(input.subarray(offset, offset + 1024)).length;
    }
    total += resampler.flush().length;
    expect(total).toBeGreaterThan(15850);
    expect(total).toBeLessThan(16080);
  });

  it('assembles exact 100 ms frames and flushes the tail', () => {
    const assembler = new FrameAssembler();
    const oneFrame = floatToInt16(new Float32Array(FRAME_SAMPLES));
    const frames = assembler.push(oneFrame);
    expect(frames).toHaveLength(1);
    expect(frames[0].byteLength).toBe(FRAME_BYTES);
    const tail = assembler.push(new Int16Array(10));
    expect(tail).toHaveLength(0);
    const flushed = assembler.flush();
    expect(flushed).toHaveLength(1);
    expect(flushed[0].byteLength).toBe(20);
  });

  it('encodes signed 16-bit little-endian samples', () => {
    const bytes = new Uint8Array(int16ToLittleEndianBytes(new Int16Array([-32768, 0, 32767])));
    expect([...bytes]).toEqual([0x00, 0x80, 0x00, 0x00, 0xff, 0x7f]);
  });

  it('clamps and normalises invalid samples', () => {
    const values = floatToInt16(new Float32Array([2, -2, Number.NaN, 0.5]));
    expect([...values]).toEqual([32767, -32768, 0, 16384]);
  });

  it('keeps every encoded frame under the backend byte limit', () => {
    const encoder = new PcmEncoder(48000);
    const input = sine(48000, 2);
    const frames = [];
    for (let offset = 0; offset < input.length; offset += 2048) {
      frames.push(...encoder.push(input.subarray(offset, offset + 2048)));
    }
    frames.push(...encoder.flush());
    expect(frames.length).toBeGreaterThanOrEqual(18);
    for (const frame of frames) expect(frame.byteLength).toBeLessThanOrEqual(32000);
  });

  it('rejects invalid sample rates', () => {
    expect(() => new StreamingResampler(0)).toThrow(RangeError);
    expect(() => new StreamingResampler(48000, -1)).toThrow(RangeError);
  });
});
