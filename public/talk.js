// Voice client: microphone → 16 kHz PCM → server, and 24 kHz PCM answers → speakers.
// Used by the builder page and by the embeddable widget.
(function () {
  // Runs in the audio thread: resamples the device rate (44.1/48 kHz) down to 16 kHz PCM, ~100 ms per chunk.
  const WORKLET = `class Mic extends AudioWorkletProcessor {
    constructor() { super(); this.ratio = sampleRate / 16000; this.pos = 0; this.out = []; }
    process(inputs) {
      const ch = inputs[0][0];
      if (ch) {
        while (this.pos < ch.length) {
          const i = Math.floor(this.pos), f = this.pos - i;
          const v = i + 1 < ch.length ? ch[i] * (1 - f) + ch[i + 1] * f : ch[i];
          this.out.push(v); this.pos += this.ratio;
        }
        this.pos -= ch.length;
      }
      if (this.out.length >= 1600) {
        const pcm = new Int16Array(this.out.length);
        for (let i = 0; i < this.out.length; i++) { const s = Math.max(-1, Math.min(1, this.out[i])); pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff; }
        this.port.postMessage(pcm.buffer, [pcm.buffer]); this.out = [];
      }
      return true;
    }
  }
  registerProcessor('mic', Mic);`;

  const b64 = (buf) => { let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = (str) => { const bin = atob(str); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; };

  /** Starts a conversation. Returns { stop() }. Events: onState(state), onText(who, text), onError(msg), onLevel(0..1). */
  async function startTalk({ server, agent, onState = () => {}, onText = () => {}, onError = () => {}, onLevel = () => {} }) {
    onState('connecting');
    // Create and resume both contexts inside the click, before any await (Safari otherwise starts them suspended).
    const micCtx = new AudioContext();
    const outCtx = new AudioContext();
    micCtx.resume(); outCtx.resume();
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (err) { micCtx.close(); outCtx.close(); throw err; }

    let node;
    try {
      await micCtx.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' })));
      node = new AudioWorkletNode(micCtx, 'mic');
      micCtx.createMediaStreamSource(stream).connect(node);
    } catch (err) {
      stream.getTracks().forEach((t) => t.stop()); micCtx.close(); outCtx.close();
      throw err;
    }

    const ws = new WebSocket(server.replace(/^http/, 'ws') + '/live?agent=' + encodeURIComponent(agent));
    let playing = []; let nextTime = 0; let stopped = false; let hadError = false; let mutedUntil = 0;

    // Half-duplex: the mic is not sent while the agent speaks, so it never hears itself.
    node.port.onmessage = (e) => {
      if (ws.readyState !== 1) return;
      if (playing.length || performance.now() < mutedUntil) { onLevel(0); return; }
      const pcm = new Int16Array(e.data); let peak = 0;
      for (let i = 0; i < pcm.length; i += 16) peak = Math.max(peak, Math.abs(pcm[i]) / 32768);
      onLevel(Math.min(1, peak * 3));
      ws.send(JSON.stringify({ type: 'audio', data: b64(e.data) }));
    };

    function play(data) {
      const pcm = new Int16Array(unb64(data));
      const f = new Float32Array(pcm.length); for (let i = 0; i < pcm.length; i++) f[i] = pcm[i] / 32768;
      const buf = outCtx.createBuffer(1, f.length, 24000); buf.copyToChannel(f, 0);
      const s = outCtx.createBufferSource(); s.buffer = buf; s.connect(outCtx.destination);
      nextTime = Math.max(nextTime, outCtx.currentTime + 0.05); s.start(nextTime); nextTime += buf.duration;
      playing.push(s);
      s.onended = () => {
        if (stopped) return;
        playing = playing.filter((x) => x !== s);
        if (!playing.length) { mutedUntil = performance.now() + 400; onState('listening'); }
      };
      onState('speaking');
    }
    function silence() { playing.forEach((s) => { try { s.stop(); } catch {} }); playing = []; nextTime = 0; }

    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.type === 'ready') onState('listening');
      else if (m.type === 'audio') play(m.data);
      else if (m.type === 'interrupted') { silence(); onState('listening'); }
      else if (m.type === 'you' || m.type === 'agent') onText(m.type, m.text);
      else if (m.type === 'error') { hadError = true; onError(m.message); }
    };
    ws.onclose = () => { if (!stopped) stop(); };
    ws.onerror = () => { hadError = true; onError('Connection to the voice server failed.'); };

    function stop() {
      if (stopped) return;
      stopped = true; silence();
      try { ws.close(); } catch {}
      stream.getTracks().forEach((t) => t.stop());
      micCtx.close(); outCtx.close();
      onState(hadError ? 'error' : 'ended');
    }
    return { stop };
  }
  window.WebsiteVoiceAgent = { startTalk };
})();
