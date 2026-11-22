import { TARGET_SAMPLE_RATE } from '../lib/meeting/config.js';
import { CAPTURE_ERROR, captureErrorForMediaError } from '../lib/meeting/errors.js';
import { PcmEncoder } from '../lib/meeting/pcm.js';

export const CAPTURE_STATE = Object.freeze({
  IDLE: 'idle',
  STARTING: 'starting',
  CAPTURING: 'capturing',
  STOPPING: 'stopping',
  STOPPED: 'stopped',
  ERROR: 'error',
});

const FLUSH_TIMEOUT_MS = 250;

// Owns one tab-capture stream in the offscreen document. It never falls back to the microphone.
export class TabAudioCapture {
  constructor({ workletUrl, onFrame = () => {}, onState = () => {}, onError = () => {} }) {
    this.workletUrl = workletUrl;
    this.onFrame = onFrame;
    this.onState = onState;
    this.onError = onError;
    this.state = CAPTURE_STATE.IDLE;
    this.stream = null;
    this.context = null;
    this.source = null;
    this.node = null;
    this.mute = null;
    this.encoder = null;
    this.flushResolve = null;
    this.onTrackEnded = () => this.fail(CAPTURE_ERROR.TRACK_ENDED);
  }

  async start(streamId) {
    if (this.state === CAPTURE_STATE.STARTING || this.state === CAPTURE_STATE.CAPTURING) return false;
    if (!streamId) {
      this.fail(CAPTURE_ERROR.CAPTURE_FAILED);
      return false;
    }
    this.setState(CAPTURE_STATE.STARTING);

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          mandatory: {
            chromeMediaSource: 'tab',
            chromeMediaSourceId: streamId,
          },
        },
        video: false,
      });
    } catch (error) {
      this.fail(captureErrorForMediaError(error));
      return false;
    }

    const track = this.stream.getAudioTracks()[0];
    if (!track) {
      this.fail(CAPTURE_ERROR.NO_DEVICE);
      return false;
    }
    track.addEventListener('ended', this.onTrackEnded);

    try {
      this.context = createAudioContext();
    } catch {
      this.fail(CAPTURE_ERROR.CONTEXT_FAILED);
      return false;
    }

    try {
      if (this.context.state === 'suspended') await this.context.resume();
      await this.context.audioWorklet.addModule(this.workletUrl);
    } catch {
      this.fail(CAPTURE_ERROR.WORKLET_FAILED);
      return false;
    }

    try {
      const context = this.context;
      this.source = context.createMediaStreamSource(this.stream);
      // Restore playback: tab capture otherwise mutes the tab for the user.
      this.source.connect(context.destination);

      this.node = new AudioWorkletNode(context, 'signbridge-caption-capture', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        channelCount: 1,
        channelCountMode: 'explicit',
        channelInterpretation: 'speakers',
      });
      this.mute = context.createGain();
      this.mute.gain.value = 0;
      this.source.connect(this.node);
      this.node.connect(this.mute);
      this.mute.connect(context.destination);

      this.encoder = new PcmEncoder(context.sampleRate, TARGET_SAMPLE_RATE);
      this.node.port.onmessage = (event) => this.handleWorkletMessage(event.data);
      this.setState(CAPTURE_STATE.CAPTURING);
      return true;
    } catch {
      this.fail(CAPTURE_ERROR.CONTEXT_FAILED);
      return false;
    }
  }

  handleWorkletMessage(data) {
    if (data instanceof Float32Array) {
      if (!this.encoder) return;
      for (const frame of this.encoder.push(data)) this.onFrame(frame);
      return;
    }
    if (data?.type === 'flushed') {
      this.flushResolve?.();
    }
  }

  // Stops the tab track first, then flushes only the samples already buffered. No new samples are produced.
  async stop() {
    if (this.state !== CAPTURE_STATE.CAPTURING && this.state !== CAPTURE_STATE.STARTING) {
      this.release();
      this.setState(CAPTURE_STATE.STOPPED);
      return;
    }
    this.setState(CAPTURE_STATE.STOPPING);
    this.stopTracks();

    if (this.node && this.encoder) {
      const flushed = new Promise((resolve) => { this.flushResolve = resolve; });
      try { this.node.port.postMessage('flush'); } catch {}
      await Promise.race([flushed, new Promise((resolve) => setTimeout(resolve, FLUSH_TIMEOUT_MS))]);
      this.flushResolve = null;
      for (const frame of this.encoder.flush()) this.onFrame(frame);
    }

    this.release();
    this.setState(CAPTURE_STATE.STOPPED);
  }

  dispose() {
    this.release();
    this.setState(CAPTURE_STATE.STOPPED);
  }

  fail(code) {
    this.release();
    this.setState(CAPTURE_STATE.ERROR);
    this.onError(code);
  }

  stopTracks() {
    if (!this.stream) return;
    for (const track of this.stream.getTracks()) {
      track.removeEventListener?.('ended', this.onTrackEnded);
      track.stop();
    }
    this.stream = null;
  }

  release() {
    this.stopTracks();
    if (this.node) {
      this.node.port.onmessage = null;
      try { this.node.disconnect(); } catch {}
      this.node = null;
    }
    try { this.source?.disconnect(); } catch {}
    this.source = null;
    try { this.mute?.disconnect(); } catch {}
    this.mute = null;
    if (this.context) {
      const context = this.context;
      this.context = null;
      try { context.close?.()?.catch?.(() => {}); } catch {}
    }
    this.encoder = null;
    this.flushResolve = null;
  }

  setState(state) {
    if (this.state === state) return;
    this.state = state;
    this.onState(state);
  }
}

function createAudioContext() {
  const Context = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (typeof Context !== 'function') throw new Error('AudioContext is unavailable.');
  try {
    return new Context({ sampleRate: TARGET_SAMPLE_RATE, latencyHint: 'interactive' });
  } catch {
    return new Context();
  }
}
