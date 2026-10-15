/* store.js — settings, progress (SRS + quiz + streak), PDF storage, sync to GAS */
(function () {
  const SET_KEY = "ss.settings.v1";
  const PROG_KEY = "ss.progress.v1";
  const CHAT_KEY = "ss.chat.v1";

  const DEFAULT_SETTINGS = {
    bab: 1,
    provider: "gemini",          // "claude" | "gemini"
    workerUrl: "https://shokyuu-sensei.prihatinpurwadi2.workers.dev",
    gasUrl: "",                  // https://script.google.com/macros/s/.../exec
    token: "",                   // token akses pribadi (sama di Worker & GAS)
    furigana: true,
    romaji: false,
    autoSpeak: false,
    voice: "",
    rate: 0.9,
    newPerDay: 15,
    theme: "auto"
  };

  function load(key, fallback) {
    try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; }
    catch (e) { return fallback; }
  }
  function save(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* storage penuh / diblokir */ }
  }

  const settings = Object.assign({}, DEFAULT_SETTINGS, load(SET_KEY, {}));
  const progress = Object.assign({ srs: {}, quiz: {}, days: [], seen: [], updated: 0, newToday: { d: "", n: 0 } }, load(PROG_KEY, {}));

  const today = () => {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  };

  function touch() {
    const t = today();
    if (!progress.days.includes(t)) progress.days.push(t);
    if (progress.days.length > 400) progress.days = progress.days.slice(-400);
    progress.updated = Date.now();
    save(PROG_KEY, progress);
    Store.scheduleSync();
  }

  /* ---------- SRS (SM-2 sederhana) ---------- */
  // grade: 0 Lupa, 1 Susah, 2 Bisa, 3 Mudah
  function review(id, grade) {
    const now = Date.now();
    const c = progress.srs[id] || { ef: 2.5, iv: 0, reps: 0, due: now, last: 0 };
    const isNew = !progress.srs[id];
    if (grade === 0) { c.reps = 0; c.iv = 0; c.due = now + 60 * 1000; }
    else {
      const q = [0, 3, 4, 5][grade];
      c.ef = Math.max(1.3, c.ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
      c.reps += 1;
      if (c.reps === 1) c.iv = grade === 3 ? 3 : 1;
      else if (c.reps === 2) c.iv = grade === 1 ? 3 : 6;
      else c.iv = Math.round(c.iv * c.ef * (grade === 1 ? 0.8 : grade === 3 ? 1.3 : 1));
      c.due = now + c.iv * 86400000;
    }
    c.last = now;
    progress.srs[id] = c;
    if (isNew) {
      if (progress.newToday.d !== today()) progress.newToday = { d: today(), n: 0 };
      progress.newToday.n += 1;
    }
    touch();
  }
  function newLeftToday() {
    if (progress.newToday.d !== today()) return settings.newPerDay;
    return Math.max(0, settings.newPerDay - progress.newToday.n);
  }
  function mastered() {
    return Object.values(progress.srs).filter(c => c.iv >= 6).length;
  }

  function saveQuiz(bab, score, total) {
    const q = progress.quiz[bab] || { best: 0, last: 0, n: 0 };
    const pct = Math.round(score / total * 100);
    q.best = Math.max(q.best, pct); q.last = pct; q.n += 1; q.at = Date.now();
    progress.quiz[bab] = q;
    touch();
  }
  function markSeen(bab) {
    if (!progress.seen.includes(bab)) { progress.seen.push(bab); }
    touch();
  }

  /* ---------- chat history (lokal) ---------- */
  function loadChat() { return load(CHAT_KEY, []); }
  function saveChat(list) { save(CHAT_KEY, list.slice(-60)); }

  /* ---------- IndexedDB untuk PDF buku ---------- */
  function idb() {
    return new Promise((res, rej) => {
      const r = indexedDB.open("shokyuu-sensei", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("files");
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  async function putFile(name, blob) {
    const db = await idb();
    return new Promise((res, rej) => {
      const tx = db.transaction("files", "readwrite");
      tx.objectStore("files").put(blob, name);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  }
  async function getFile(name) {
    try {
      const db = await idb();
      return await new Promise((res, rej) => {
        const r = db.transaction("files").objectStore("files").get(name);
        r.onsuccess = () => res(r.result || null); r.onerror = () => rej(r.error);
      });
    } catch (e) { return null; }
  }

  /* ---------- sinkron ke Google Sheets lewat GAS ---------- */
  async function gas(action, payload) {
    if (!settings.gasUrl) throw new Error("URL GAS belum diisi di Setting.");
    const res = await fetch(settings.gasUrl, {
      method: "POST",
      body: JSON.stringify(Object.assign({ action, token: settings.token }, payload || {}))
      // tanpa header custom → dikirim sebagai text/plain, tidak kena preflight CORS
    });
    const j = await res.json();
    if (!j.ok) throw new Error(j.error || "GAS menolak permintaan.");
    return j;
  }
  function merge(remote) {
    if (!remote) return;
    for (const [id, c] of Object.entries(remote.srs || {})) {
      const l = progress.srs[id];
      if (!l || (c.last || 0) > (l.last || 0)) progress.srs[id] = c;
    }
    for (const [b, q] of Object.entries(remote.quiz || {})) {
      const l = progress.quiz[b];
      if (!l) progress.quiz[b] = q;
      else { l.best = Math.max(l.best, q.best); if ((q.at || 0) > (l.at || 0)) { l.last = q.last; l.at = q.at; } l.n = Math.max(l.n, q.n); }
    }
    progress.days = Array.from(new Set([...(progress.days || []), ...(remote.days || [])])).sort();
    progress.seen = Array.from(new Set([...(progress.seen || []), ...(remote.seen || [])]));
  }
  let syncTimer = null, syncing = false;
  async function sync() {
    if (!settings.gasUrl || !navigator.onLine || syncing) return false;
    syncing = true;
    try {
      const got = await gas("get");
      merge(got.data);
      progress.updated = Date.now();
      save(PROG_KEY, progress);
      await gas("put", { data: progress });
      localStorage.setItem("ss.lastSync", String(Date.now()));
      return true;
    } finally { syncing = false; }
  }
  function scheduleSync() {
    if (!settings.gasUrl) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => sync().catch(() => {}), 8000);
  }
  function logChat(role, text, mode) {
    if (!settings.gasUrl || !navigator.onLine) return;
    gas("log", { row: { t: new Date().toISOString(), bab: settings.bab, mode, role, text: text.slice(0, 4000) } }).catch(() => {});
  }

  const Store = {
    settings, progress, today,
    saveSettings() { save(SET_KEY, settings); },
    review, newLeftToday, mastered, saveQuiz, markSeen,
    loadChat, saveChat,
    putFile, getFile,
    sync, scheduleSync, logChat, gas,
    resetProgress() {
      Object.assign(progress, { srs: {}, quiz: {}, days: [], seen: [], updated: Date.now(), newToday: { d: "", n: 0 } });
      save(PROG_KEY, progress);
    }
  };
  window.Store = Store;
})();
