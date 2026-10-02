// Embeddable voice button. Usage on any page:
// <script src="https://YOUR-SERVER/widget.js" data-agent="AGENT_ID"></script>
(function () {
  const me = document.currentScript;
  const agent = me.dataset.agent;
  const server = new URL(me.src).origin;
  const s = document.createElement('script'); s.src = server + '/talk.js';
  s.onload = () => {
    const btn = document.createElement('button');
    btn.textContent = '🎙 Talk to us';
    btn.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:99999;font:600 16px -apple-system,Helvetica,sans-serif;padding:14px 20px;border-radius:999px;border:2px solid #1f5fd1;background:#e7efff;color:#1f5fd1;box-shadow:0 8px 24px rgba(0,0,0,.15);cursor:pointer';
    let call = null;
    btn.onclick = async () => {
      if (call) { call.stop(); call = null; return; }
      try {
        call = await window.WebsiteVoiceAgent.startTalk({
          server, agent,
          onState: (st) => { btn.textContent = st === 'ended' ? '🎙 Talk to us' : st === 'speaking' ? '🔊 Speaking … tap to stop' : '🎙 Listening … tap to stop'; if (st === 'ended') call = null; },
          onError: (m) => { btn.textContent = '⚠ ' + m; },
        });
      } catch (e) { btn.textContent = '⚠ Microphone blocked'; call = null; }
    };
    document.body.appendChild(btn);
  };
  document.head.appendChild(s);
})();
