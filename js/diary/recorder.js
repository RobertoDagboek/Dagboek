// Voice note recording. Picks a container the browser can actually produce
// AND the OpenAI audio endpoint accepts (webm/opus on Chrome + Android,
// mp4/aac on iOS Safari).

const CANDIDATES = [
  { mime: 'audio/webm;codecs=opus', ext: 'webm' },
  { mime: 'audio/webm', ext: 'webm' },
  { mime: 'audio/mp4', ext: 'm4a' },
  { mime: 'audio/ogg;codecs=opus', ext: 'ogg' },
];

function pickFormat() {
  for (const c of CANDIDATES) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(c.mime)) return c;
  }
  return { mime: '', ext: 'webm' }; // let the browser decide
}

export class Recorder {
  constructor({ onTick, onLevel } = {}) {
    this.onTick = onTick;
    this.onLevel = onLevel;
    this.recording = false;
  }

  async start() {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true, // helps a lot for quiet / far-from-phone speech
      },
    });
    this.stream = stream;

    const fmt = pickFormat();
    this.ext = fmt.ext;
    this.recorder = new MediaRecorder(stream, fmt.mime ? { mimeType: fmt.mime } : undefined);
    this.chunks = [];
    this.recorder.ondataavailable = e => { if (e.data.size) this.chunks.push(e.data); };

    this.startedAt = Date.now();
    this.recorder.start(1000);
    this.recording = true;

    this.#meter(stream);
    this.timer = setInterval(() => {
      const s = Math.floor((Date.now() - this.startedAt) / 1000);
      this.onTick?.(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, s);
    }, 250);
  }

  #meter(stream) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      this.audioCtx = ctx;
      const loop = () => {
        if (!this.recording) return;
        analyser.getByteTimeDomainData(buf);
        let peak = 0;
        for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
        this.onLevel?.(Math.min(1, peak / 70));
        this.raf = requestAnimationFrame(loop);
      };
      loop();
    } catch { /* level meter is cosmetic */ }
  }

  /** Resolves to { blob, ext, seconds } */
  stop() {
    return new Promise(resolve => {
      if (!this.recorder || this.recorder.state === 'inactive') return resolve(null);
      const seconds = Math.round((Date.now() - this.startedAt) / 1000);
      this.recorder.onstop = () => {
        const type = this.recorder.mimeType || 'audio/webm';
        const blob = new Blob(this.chunks, { type });
        this.#cleanup();
        resolve({ blob, ext: this.ext, seconds });
      };
      this.recorder.stop();
    });
  }

  cancel() {
    try { this.recorder?.stop(); } catch { /* already stopped */ }
    this.#cleanup();
  }

  #cleanup() {
    this.recording = false;
    clearInterval(this.timer);
    cancelAnimationFrame(this.raf);
    this.stream?.getTracks().forEach(t => t.stop());
    this.audioCtx?.close().catch(() => {});
    this.onLevel?.(0);
  }
}
