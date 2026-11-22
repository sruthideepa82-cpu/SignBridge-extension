// AudioWorklet for meeting captions. It batches samples on the audio thread and supports a flush request when the
// user stops capture. Clean-room implementation, independent of the SignBridge website.
const BATCH_SIZE = 2048;

class CaptionCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.chunks = [];
    this.buffered = 0;
    this.port.onmessage = (event) => {
      if (event.data === 'flush') {
        this.post();
        this.port.postMessage({ type: 'flushed' });
      }
    };
  }

  post() {
    if (this.buffered === 0) return;
    const batch = new Float32Array(this.buffered);
    let offset = 0;
    for (const chunk of this.chunks) {
      batch.set(chunk, offset);
      offset += chunk.length;
    }
    this.chunks = [];
    this.buffered = 0;
    this.port.postMessage(batch, [batch.buffer]);
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel && channel.length) {
      this.chunks.push(channel.slice());
      this.buffered += channel.length;
      if (this.buffered >= BATCH_SIZE) this.post();
    }
    return true;
  }
}

registerProcessor('signbridge-caption-capture', CaptionCaptureProcessor);
