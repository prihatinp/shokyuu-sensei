/* speech.js — suara Jepang (TTS) dan mikrofon (STT) via Web Speech API */
(function () {
  const synth = window.speechSynthesis;
  let voices = [];
  const PREFERRED = [/Nanami/i, /Keita/i, /Google 日本語/i, /Kyoko/i, /Otoya/i, /Haruka/i, /Ayumi/i, /Ichiro/i, /Sayaka/i];

  function loadVoices() {
    if (!synth) return [];
    voices = synth.getVoices().filter(v => /^ja(-|_|$)/i.test(v.lang));
    return voices;
  }
  if (synth) {
    loadVoices();
    synth.onvoiceschanged = loadVoices;
  }

  function pickVoice() {
    const s = window.Store.settings;
    if (s.voice) { const v = voices.find(v => v.name === s.voice); if (v) return v; }
    for (const re of PREFERRED) { const v = voices.find(v => re.test(v.name)); if (v) return v; }
    return voices[0] || null;
  }

  // Ambil hanya bagian berbahasa Jepang dari teks (buang ruby《》, romaji, bahasa Indonesia)
  function japaneseOnly(text) {
    const JP = /[぀-ヿ㐀-鿿ｦ-ﾟ]/;
    return text
      .replace(/《[^》]*》/g, "")
      .replace(/\*\*/g, "")
      .split(/\n+/)
      .map(line => {
        // potong bagian setelah tanda kurung terjemahan atau "—"
        const parts = line.split(/(?:\s—\s|\s-\s|\(|（|=|:)/);
        return parts.filter(p => JP.test(p)).join(" ");
      })
      .filter(l => JP.test(l))
      .join("。");
  }

  let current = null;
  function speak(text, opts = {}) {
    if (!synth) { window.App && App.toast("Browser ini tidak punya fitur suara."); return; }
    const say = opts.raw ? text : japaneseOnly(text);
    if (!say) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(say);
    u.lang = "ja-JP";
    const v = pickVoice(); if (v) u.voice = v;
    u.rate = window.Store.settings.rate || 0.9;
    current = u;
    synth.speak(u);
  }
  function stop() { if (synth) synth.cancel(); }

  /* ---------- mikrofon ---------- */
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  function listen({ onPartial, onFinal, onEnd, onError }) {
    if (!Rec) { onError && onError("Mikrofon suara tidak didukung di browser ini. Pakai Chrome atau Edge."); return null; }
    const r = new Rec();
    r.lang = "ja-JP";
    r.interimResults = true;
    r.continuous = false;
    r.onresult = e => {
      let fin = "", part = "";
      for (const res of e.results) (res.isFinal ? (fin += res[0].transcript) : (part += res[0].transcript));
      if (part && onPartial) onPartial(part);
      if (fin && onFinal) onFinal(fin);
    };
    r.onerror = e => onError && onError(e.error === "not-allowed" ? "Izin mikrofon ditolak. Aktifkan di pengaturan browser." : "Mikrofon error: " + e.error);
    r.onend = () => onEnd && onEnd();
    r.start();
    return r;
  }

  window.Speech = {
    speak, stop, listen, japaneseOnly,
    voices: () => loadVoices(),
    canListen: !!Rec,
    canSpeak: !!synth
  };
})();
