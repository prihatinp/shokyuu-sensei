/* app.js — router dan semua tampilan Shokyuu Sensei */
(function () {
  const S = window.Store.settings;
  const view = document.getElementById("view");
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = t => String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  let INDEX = null;
  const BAB = {};               // cache data bab
  const state = { tab: "materi", materiTab: "kotoba", kat: "semua", deck: "aktif", chatMode: "kaiwa" };

  /* ---------- util ---------- */
  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 2600);
  }
  function applyTheme() {
    if (S.theme === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", S.theme);
  }
  function netStatus() {
    const n = $("#netStatus");
    n.classList.toggle("off", !navigator.onLine);
    n.textContent = navigator.onLine ? "Online" : "Offline";
  }
  async function loadIndex() {
    const r = await fetch("data/index.json"); INDEX = await r.json();
  }
  async function getBab(n) {
    if (BAB[n]) return BAB[n];
    const meta = INDEX.bab.find(b => b.bab === n);
    if (!meta || !meta.file) return null;
    const r = await fetch(meta.file); BAB[n] = await r.json();
    return BAB[n];
  }
  async function loadedUpTo(n) {
    const out = [];
    for (const b of INDEX.bab) { if (b.bab <= n && b.file) out.push(await getBab(b.bab)); }
    return out;
  }
  const available = () => INDEX.bab.filter(b => b.file);
  function speakBtn(text, label = "Dengarkan") {
    return `<button class="icon-btn" data-say="${esc(text)}" aria-label="${label}" title="${label}">🔊</button>`;
  }
  function wordDisplay(k) { return k.kanji || k.jp; }
  function cardId(bab, type, key) { return `b${bab}:${type}:${key}`; }

  function fillBabSelect() {
    const sel = $("#babSelect");
    sel.innerHTML = INDEX.bab.map(b =>
      `<option value="${b.bab}" ${b.file ? "" : "disabled"} ${b.bab === S.bab ? "selected" : ""}>Bab ${b.bab} · ${b.judul}${b.file ? "" : " (segera)"}</option>`
    ).join("");
    sel.onchange = () => { S.bab = +sel.value; Store.saveSettings(); route(); };
  }

  // tombol 🔊 di mana pun
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-say]");
    if (b) { e.stopPropagation(); Speech.speak(b.dataset.say, { raw: true }); }
  });

  /* =========================================================
     MATERI
     ========================================================= */
  async function viewMateri() {
    const d = await getBab(S.bab);
    Store.markSeen(S.bab);
    const kats = ["semua", ...Array.from(new Set(d.kotoba.map(k => k.kat)))];
    view.innerHTML = `
      <div class="bab-head">
        <div>
          <div class="bab-num">Bab ${d.bab} · halaman ${d.halaman_buku[0]}–${d.halaman_buku[1]}</div>
          <h1>${esc(d.judul)}</h1>
        </div>
        <div class="bab-actions">
          <button class="btn" id="openBook">Buka halaman buku</button>
          <a class="btn primary" href="#/sensei" id="practice">Latihan dengan Sensei</a>
        </div>
      </div>
      <p class="lede">${esc(d.judul_id)}. ${esc(d.tema)}</p>
      <div class="seg" role="group" aria-label="Bagian materi">
        ${["kotoba", "kanji", "bunpo"].map(t => `<button data-mt="${t}" aria-pressed="${state.materiTab === t}">${{ kotoba: "Kosakata", kanji: "Kanji", bunpo: "Bunpo" }[t]} <span class="muted small">${t === "kotoba" ? d.kotoba.length : t === "kanji" ? d.kanji.length : d.bunpo.length}</span></button>`).join("")}
      </div>
      <div id="mt" style="margin-top:18px"></div>`;
    $$("[data-mt]").forEach(b => b.onclick = () => { state.materiTab = b.dataset.mt; viewMateri(); });
    $("#openBook").onclick = () => openBook(d);

    const mt = $("#mt");
    if (state.materiTab === "kotoba") {
      mt.innerHTML = `
        <div class="filter-row" role="group" aria-label="Filter kategori">
          ${kats.map(k => `<button class="chip" data-kat="${esc(k)}" aria-pressed="${state.kat === k}">${esc(k)}</button>`).join("")}
        </div>
        <ul class="kotoba-list">
          ${d.kotoba.filter(k => state.kat === "semua" || k.kat === state.kat).map(k => `
            <li class="sheet">
              <div>
                <div class="kotoba-word jp">${esc(wordDisplay(k))}</div>
                ${k.kanji ? `<div class="kotoba-read jp">${esc(k.jp)}</div>` : ""}
                <div class="kotoba-arti">${esc(k.arti)}</div>
              </div>
              ${speakBtn(k.jp.replace(/〜/g, ""))}
            </li>`).join("")}
        </ul>`;
      $$("[data-kat]").forEach(b => b.onclick = () => { state.kat = b.dataset.kat; viewMateri(); });
      if (!kats.includes(state.kat)) { state.kat = "semua"; }
    } else if (state.materiTab === "kanji") {
      mt.innerHTML = `<div class="kanji-grid">${d.kanji.map(k => `
        <div class="sheet kanji-card">
          <div class="masu"><span>${esc(k.k)}</span></div>
          <div>
            <h3>${esc(k.arti)}</h3>
            <div class="read-row"><b>On</b><span class="jp">${esc(k.on.join("、") || "—")}</span></div>
            <div class="read-row"><b>Kun</b><span class="jp">${esc(k.kun.join("、") || "—")}</span></div>
            <div class="kanji-ex">${k.contoh.map(c => `<div><span class="jp">${esc(c[0])}</span> <span class="muted">${esc(c[1])}</span> — ${esc(c[2])}</div>`).join("")}</div>
          </div>
        </div>`).join("")}</div>`;
    } else {
      mt.innerHTML = d.bunpo.map((b, i) => `
        <article class="sheet bunpo">
          <div class="bunpo-pola">${esc(b.pola)}</div>
          <div class="bunpo-arti">${esc(b.arti)}</div>
          <p>${esc(b.jelaskan)}</p>
          <ul class="ex">${b.contoh.map(c => `<li><div><div class="jp">${esc(c[0])}</div><div class="id">${esc(c[1])}</div></div>${speakBtn(c[0])}</li>`).join("")}</ul>
          <button class="btn ghost ask" data-ask="${i}">Tanya Sensei tentang pola ini</button>
        </article>`).join("");
      $$("[data-ask]").forEach(btn => btn.onclick = () => {
        const b = d.bunpo[+btn.dataset.ask];
        state.chatMode = "bunpo";
        state.pendingAsk = `Tolong jelaskan pola 「${b.pola}」 (${b.arti}) dengan contoh lain, lalu beri saya satu soal latihan.`;
        location.hash = "#/sensei";
      });
    }
  }

  /* ---------- PDF buku (disimpan lokal) ---------- */
  async function loadPdfJs() {
    if (window.pdfjsLib) return window.pdfjsLib;
    await new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
      s.onload = res; s.onerror = () => rej(new Error("Gagal memuat pembaca PDF. Cek koneksi, lalu coba lagi."));
      document.head.appendChild(s);
    });
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    return window.pdfjsLib;
  }
  async function openBook(d) {
    const blob = await Store.getFile("buku.pdf");
    if (!blob) {
      toast("PDF buku belum dimuat. Pilih file PDF-nya di Setting.");
      location.hash = "#/setting";
      return;
    }
    const dlg = document.createElement("dialog");
    dlg.className = "pdf-dialog";
    const first = d.halaman_buku[0], last = d.halaman_buku[1];
    let page = first;
    dlg.innerHTML = `
      <div class="pdf-head">
        <span class="muted" id="pgLbl"></span>
        <button class="btn" id="pgPrev">Sebelumnya</button>
        <button class="btn" id="pgNext">Berikutnya</button>
        <button class="btn primary" id="pgClose">Tutup</button>
      </div>
      <div class="pdf-body"><canvas id="pgCanvas"></canvas></div>`;
    document.body.appendChild(dlg);
    dlg.showModal();
    dlg.addEventListener("close", () => dlg.remove());
    $("#pgClose", dlg).onclick = () => dlg.close();
    let pdf;
    try {
      const lib = await loadPdfJs();
      pdf = await lib.getDocument({ data: await blob.arrayBuffer() }).promise;
    } catch (e) { $(".pdf-body", dlg).textContent = e.message; return; }
    const off = INDEX.pdf_offset || 0;
    async function draw() {
      $("#pgLbl", dlg).textContent = `Bab ${d.bab} · halaman buku ${page}`;
      $("#pgPrev", dlg).disabled = page <= first;
      $("#pgNext", dlg).disabled = page >= last;
      const p = await pdf.getPage(page + off);
      const vp = p.getViewport({ scale: 1.6 });
      const c = $("#pgCanvas", dlg);
      c.width = vp.width; c.height = vp.height;
      await p.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
    }
    $("#pgPrev", dlg).onclick = () => { page--; draw(); };
    $("#pgNext", dlg).onclick = () => { page++; draw(); };
    draw();
  }

  /* =========================================================
     KARTU (flashcard + SRS)
     ========================================================= */
  async function buildDeck() {
    const babs = state.deck === "aktif" ? [await getBab(S.bab)] : await loadedUpTo(S.bab);
    const cards = [];
    for (const d of babs) {
      d.kotoba.forEach(k => cards.push({ id: cardId(d.bab, "k", k.jp), front: wordDisplay(k), read: k.kanji ? k.jp : "", arti: k.arti, kat: k.kat, say: k.jp.replace(/〜/g, ""), bab: d.bab }));
      d.kanji.forEach(k => cards.push({ id: cardId(d.bab, "z", k.k), front: k.k, kanji: true, read: [...k.on, ...k.kun].join("、"), arti: k.arti, kat: "kanji", say: k.contoh[0] ? k.contoh[0][1] : "", bab: d.bab }));
    }
    const now = Date.now(), P = Store.progress.srs;
    const due = cards.filter(c => P[c.id] && P[c.id].due <= now).sort((a, b) => P[a.id].due - P[b.id].due);
    const fresh = cards.filter(c => !P[c.id]).slice(0, Store.newLeftToday());
    return { all: cards, queue: [...due, ...fresh], due: due.length, fresh: fresh.length };
  }

  async function viewKartu() {
    const deck = await buildDeck();
    const head = `
      <h1>Kartu hafalan</h1>
      <p class="lede">Kartu yang mulai lupa akan muncul lagi otomatis. Ketuk kartu untuk melihat jawabannya.</p>
      <div class="deck-bar">
        <div class="seg" role="group" aria-label="Pilih dek">
          <button data-deck="aktif" aria-pressed="${state.deck === "aktif"}">Bab ${S.bab} saja</button>
          <button data-deck="semua" aria-pressed="${state.deck === "semua"}">Bab 1–${S.bab}</button>
        </div>
        <span class="deck-count" id="deckCount"></span>
      </div>`;
    const setCount = (q) => { $("#deckCount").textContent = q.length ? `${q.length} kartu tersisa hari ini (${deck.due} ulangan, ${deck.fresh} baru)` : ""; };
    if (!deck.queue.length) {
      view.innerHTML = head + `
        <div class="sheet empty">
          <div class="masu"><span>済</span></div>
          <h3>Kartu hari ini sudah selesai</h3>
          <p class="muted">Kartu berikutnya muncul sesuai jadwal. Sambil menunggu, coba kuis atau ngobrol dengan Sensei.</p>
          <a class="btn primary" href="#/sensei">Ngobrol dengan Sensei</a>
        </div>`;
      bindDeck(); setCount([]);
      return;
    }
    let q = deck.queue.slice();
    view.innerHTML = head + `<div id="cardArea"></div>`;
    bindDeck(); setCount(q);

    function show() {
      if (!q.length) { viewKartu(); return; }
      const c = q[0];
      $("#cardArea").innerHTML = `
        <div class="sheet flash" id="flash" tabindex="0" role="button" aria-label="Kartu. Tekan spasi untuk membalik.">
          ${c.kanji ? `<div class="masu"><span>${esc(c.front)}</span></div>` : `<div class="flash-word jp">${esc(c.front)}</div>`}
          <div class="flash-hint">Bab ${c.bab} · ${esc(c.kat)} · ketuk untuk membalik</div>
          <div class="flash-back">
            ${c.read ? `<div class="flash-read">${esc(c.read)}</div>` : ""}
            <div class="flash-arti">${esc(c.arti)}</div>
            ${c.say ? `<div style="margin-top:8px">${speakBtn(c.say)}</div>` : ""}
          </div>
        </div>
        <div class="grade" id="grade" hidden>
          <button class="g0" data-g="0">Lupa<small>1 menit</small></button>
          <button class="g1" data-g="1">Susah<small>ulang segera</small></button>
          <button class="g2" data-g="2">Bisa<small>beberapa hari</small></button>
          <button class="g3" data-g="3">Mudah<small>lebih lama</small></button>
        </div>`;
      const f = $("#flash");
      const flip = () => { f.classList.add("open"); $("#grade").hidden = false; if (c.say) Speech.speak(c.say, { raw: true }); };
      f.onclick = flip;
      f.onkeydown = e => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); flip(); } };
      f.focus();
      $$("#grade button").forEach(b => b.onclick = () => {
        const g = +b.dataset.g;
        Store.review(c.id, g);
        q.shift();
        if (g === 0) q.splice(Math.min(3, q.length), 0, c); // muncul lagi sebentar lagi
        setCount(q); show();
      });
    }
    show();
  }
  function bindDeck() {
    $$("[data-deck]").forEach(b => b.onclick = () => { state.deck = b.dataset.deck; viewKartu(); });
  }
  document.addEventListener("keydown", e => {
    if (state.tab !== "kartu") return;
    const g = { "1": 0, "2": 1, "3": 2, "4": 3 }[e.key];
    const btn = g !== undefined && $(`#grade:not([hidden]) [data-g="${g}"]`);
    if (btn) btn.click();
  });

  /* =========================================================
     KUIS
     ========================================================= */
  const PARTIKEL = ["は", "が", "を", "に", "で", "の", "も", "と", "か", "へ"];
  function makeQuiz(d, pool) {
    const qs = [];
    const words = d.kotoba.filter(k => !/〜/.test(k.jp));
    const allWords = pool.flatMap(b => b.kotoba).filter(k => !/〜/.test(k.jp));
    const pickOthers = (correct, list, n, key) => shuffle(Array.from(new Set(list.map(key).filter(v => v !== key(correct))))).slice(0, n);

    shuffle(words).slice(0, 4).forEach(k => {
      const same = allWords.filter(w => w.kat === k.kat);
      const others = pickOthers(k, same.length > 4 ? same : allWords, 3, w => w.arti);
      qs.push({ type: "Apa artinya?", prompt: wordDisplay(k), sub: k.kanji ? k.jp : "", say: k.jp, answer: k.arti, opts: shuffle([k.arti, ...others]), jpOpts: false });
    });
    shuffle(words).slice(0, 3).forEach(k => {
      const others = pickOthers(k, allWords, 3, w => wordDisplay(w));
      qs.push({ type: "Bahasa Jepangnya?", prompt: k.arti, sub: "", say: k.jp, answer: wordDisplay(k), opts: shuffle([wordDisplay(k), ...others]), jpOpts: true, small: true });
    });
    const kanjiWords = pool.flatMap(b => b.kanji.flatMap(k => k.contoh));
    shuffle(d.kanji.flatMap(k => k.contoh)).slice(0, 2).forEach(c => {
      const others = shuffle(Array.from(new Set(kanjiWords.map(x => x[1]).filter(r => r !== c[1])))).slice(0, 3);
      qs.push({ type: "Cara bacanya?", prompt: c[0], sub: c[2], say: c[1], answer: c[1], opts: shuffle([c[1], ...others]), jpOpts: true });
    });
    shuffle(d.partikel || []).slice(0, 3).forEach(p => {
      let others;
      if (p.jawab.includes("/")) {
        const parts = p.jawab.split("/").map(s => s.trim());
        others = shuffle(PARTIKEL.flatMap(a => PARTIKEL.map(b => `${a} / ${b}`)).filter(x => x !== `${parts[0]} / ${parts[1]}`)).slice(0, 3);
      } else if (p.jawab.length > 1) {
        others = shuffle(["です", "でした", "そして", "でも", "ですか", "では"].filter(x => x !== p.jawab)).slice(0, 3);
      } else {
        others = shuffle(PARTIKEL.filter(x => x !== p.jawab)).slice(0, 3);
      }
      qs.push({ type: "Isi bagian yang kosong", prompt: p.soal, sub: p.arti, say: p.soal.replace(/＿+/, p.jawab.split("/")[0].trim()), answer: p.jawab, opts: shuffle([p.jawab, ...others]), jpOpts: true, small: true });
    });
    return shuffle(qs).slice(0, 10);
  }

  async function viewKuis() {
    const d = await getBab(S.bab);
    const pool = await loadedUpTo(S.bab);
    const qs = makeQuiz(d, pool);
    let i = 0, score = 0;
    view.innerHTML = `
      <h1>Kuis Bab ${d.bab}</h1>
      <p class="lede">${qs.length} soal acak dari kosakata, kanji, dan partikel bab ini. Soalnya berbeda setiap kali dibuka.</p>
      <div class="quiz-top"><div class="progress-track"><div class="progress-fill" id="qFill"></div></div><span class="small muted" id="qNum"></span></div>
      <div id="qArea"></div>`;
    function show() {
      $("#qFill").style.width = (i / qs.length * 100) + "%";
      $("#qNum").textContent = `${Math.min(i + 1, qs.length)} / ${qs.length}`;
      if (i >= qs.length) return finish();
      const q = qs[i];
      $("#qArea").innerHTML = `
        <div class="sheet q">
          <div class="hanko" id="hanko" aria-hidden="true">正</div>
          <div class="q-type">${esc(q.type)}</div>
          <div class="q-prompt ${q.small ? "" : "jp"} ${/[぀-鿿]/.test(q.prompt) ? "jp" : ""}">${esc(q.prompt)}</div>
          <div class="q-sub">${esc(q.sub)}</div>
          <div class="opts">${q.opts.map((o, k) => `<button class="opt ${q.jpOpts ? "jp" : ""}" data-o="${k}">${esc(o)}</button>`).join("")}</div>
          <div class="q-foot" id="qFoot"></div>
        </div>`;
      $$(".opt").forEach(b => b.onclick = () => {
        const pick = q.opts[+b.dataset.o];
        const ok = pick === q.answer;
        $$(".opt").forEach(x => { x.disabled = true; if (q.opts[+x.dataset.o] === q.answer) x.classList.add("right"); });
        if (!ok) b.classList.add("wrong"); else { score++; $("#hanko").classList.add("on"); }
        if (q.say) Speech.speak(q.say, { raw: true });
        $("#qFoot").innerHTML = `<button class="btn primary" id="qNext">${i + 1 < qs.length ? "Soal berikutnya" : "Lihat hasil"}</button>`;
        $("#qNext").onclick = () => { i++; show(); };
        $("#qNext").focus();
      });
    }
    function finish() {
      Store.saveQuiz(d.bab, score, qs.length);
      const pct = Math.round(score / qs.length * 100);
      const mark = pct >= 90 ? "優" : pct >= 70 ? "良" : pct >= 50 ? "可" : "再";
      const note = { "優": "Sangat bagus. Siap lanjut ke bab berikutnya.", "良": "Bagus. Ulangi kartu yang masih lupa.", "可": "Lumayan. Coba baca lagi bagian bunpo-nya.", "再": "Belum lancar. Ulangi materi dulu, lalu coba lagi." }[mark];
      $("#qArea").innerHTML = `
        <div class="sheet result">
          <div class="hanko" aria-hidden="true">${mark}</div>
          <div class="score">${score}<span class="muted" style="font-size:28px"> / ${qs.length}</span></div>
          <p>${note}</p>
          <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
            <button class="btn primary" id="again">Kuis lagi</button>
            <a class="btn" href="#/kartu">Ulangi kartu</a>
            <a class="btn" href="#/sensei">Latihan dengan Sensei</a>
          </div>
        </div>`;
      $("#again").onclick = viewKuis;
    }
    show();
  }

  /* =========================================================
     SENSEI (chat streaming + suara)
     ========================================================= */
  let chat = Store.loadChat();
  let aborter = null;
  async function viewSensei() {
    const d = await getBab(S.bab);
    view.innerHTML = `
      <div class="chat-wrap ${S.furigana ? "" : "hide-furi"}" id="chatWrap">
        <div class="mode-row">
          <div class="seg" role="group" aria-label="Mode latihan">
            ${Object.entries(Sensei.MODES).map(([k, m]) => `<button data-mode="${k}" aria-pressed="${state.chatMode === k}">${m.label}</button>`).join("")}
          </div>
          <button class="btn ghost small" id="newChat">Obrolan baru</button>
        </div>
        <div class="chat-log" id="log" aria-live="polite"></div>
        <form class="composer" id="composer">
          <button type="button" class="mic" id="mic" aria-label="Bicara dalam bahasa Jepang" title="Bicara (bahasa Jepang)">🎤</button>
          <label class="sr" for="input">Pesan untuk Sensei</label>
          <textarea id="input" rows="1" placeholder="Tulis dalam bahasa Jepang atau Indonesia…"></textarea>
          <button class="btn primary send" id="send">Kirim</button>
        </form>
      </div>`;
    const log = $("#log"), input = $("#input");

    function starters() {
      const st = {
        kaiwa: ["こんにちは。", "Ayo ngobrol tentang tema Bab " + d.bab, "じこしょうかいを します。"],
        roleplay: ["Ayo mulai roleplay.", "Roleplay di kantor pabrik", "Roleplay di kantin"],
        bunpo: ["Apa beda は dan が?", "Kapan pakai に untuk waktu?", "Jelaskan これ・それ・あれ"],
        koreksi: ["わたしは がくせいです。", "きのう テニスを します。", "Koreksi kalimat saya ya"]
      }[state.chatMode];
      return `<div class="msg ai"><div class="who">Sensei · ${esc(Sensei.MODES[state.chatMode].label)} · Bab ${d.bab}</div>
        <div class="body">${Sensei.render(
          state.chatMode === "koreksi" ? "どうぞ。\nTulis kalimat Jepang, nanti saya koreksi." :
          state.chatMode === "bunpo" ? "しつもんを どうぞ。\nMau tanya tata bahasa apa?" :
          state.chatMode === "roleplay" ? "ロールプレイを しましょう。\nSaya akan buat situasi baru dari tema Bab " + d.bab + "." :
          "こんにちは。\nAyo ngobrol! Boleh campur bahasa Indonesia kalau buntu."
        )}</div>
        <div class="starter">${st.map(s => `<button type="button" data-start="${esc(s)}">${esc(s)}</button>`).join("")}</div></div>`;
    }
    function renderLog() {
      log.innerHTML = starters() + chat.map((m, idx) => msgHtml(m, idx)).join("");
      $$("[data-start]", log).forEach(b => b.onclick = () => send(b.dataset.start));
      bindMsgTools();
      log.scrollTop = log.scrollHeight;
    }
    function msgHtml(m, idx) {
      if (m.role === "user") return `<div class="msg user">${esc(m.content)}</div>`;
      return `<div class="msg ai" data-idx="${idx}"><div class="who">Sensei</div><div class="body">${Sensei.render(m.content)}</div>
        <div class="tools"><button class="icon-btn" data-speakmsg="${idx}" aria-label="Dengarkan jawaban" title="Dengarkan">🔊</button></div></div>`;
    }
    function bindMsgTools() {
      $$("[data-speakmsg]", log).forEach(b => b.onclick = () => Speech.speak(chat[+b.dataset.speakmsg].content));
    }

    async function send(text) {
      text = (text || "").trim();
      if (!text) return;
      if (aborter) aborter.abort();
      chat.push({ role: "user", content: text });
      input.value = ""; autosize();
      Store.logChat("user", text, state.chatMode);
      const loaded = await loadedUpTo(S.bab);
      renderLog();
      const el = document.createElement("div");
      el.className = "msg ai";
      el.innerHTML = `<div class="who">Sensei</div><div class="body"><span class="typing"><i></i><i></i><i></i></span></div>`;
      log.appendChild(el); log.scrollTop = log.scrollHeight;
      const body = $(".body", el);
      aborter = new AbortController();
      $("#send").disabled = true;
      try {
        const history = chat.filter(m => m.content && m.content.trim());
        const full = await Sensei.ask({
          mode: state.chatMode, active: d, loaded, history, signal: aborter.signal,
          onDelta: (_, all) => { body.innerHTML = Sensei.render(all); log.scrollTop = log.scrollHeight; }
        });
        chat.push({ role: "assistant", content: full });
        Store.saveChat(chat);
        Store.logChat("assistant", full, state.chatMode);
        renderLog();
        if (S.autoSpeak) Speech.speak(full);
        window.Store.progress.updated = Date.now();
      } catch (e) {
        if (e.name === "AbortError") return;
        chat.pop(); // buang pesan user yang gagal supaya riwayat tetap rapi
        Store.saveChat(chat);
        renderLog();
        const err = document.createElement("div");
        err.className = "msg err";
        err.textContent = (navigator.onLine ? e.message : "Sedang offline. Chat Sensei butuh internet; kartu dan kuis tetap bisa dipakai.");
        log.appendChild(err);
        input.value = text; autosize();
      } finally { $("#send").disabled = false; aborter = null; }
    }

    function autosize() { input.style.height = "auto"; input.style.height = Math.min(140, input.scrollHeight) + "px"; }
    input.addEventListener("input", autosize);
    input.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(input.value); } });
    $("#composer").onsubmit = e => { e.preventDefault(); send(input.value); };
    $$("[data-mode]").forEach(b => b.onclick = () => { state.chatMode = b.dataset.mode; viewSensei(); });
    $("#newChat").onclick = () => { if (aborter) aborter.abort(); chat = []; Store.saveChat(chat); Speech.stop(); renderLog(); };

    let rec = null;
    $("#mic").onclick = () => {
      const mic = $("#mic");
      if (rec) { rec.stop(); return; }
      Speech.stop();
      rec = Speech.listen({
        onPartial: t => { input.value = t; autosize(); },
        onFinal: t => { input.value = t; autosize(); send(t); },
        onEnd: () => { rec = null; mic.classList.remove("rec"); },
        onError: m => { toast(m); }
      });
      if (rec) mic.classList.add("rec");
    };
    if (!Speech.canListen) $("#mic").title = "Mikrofon tidak didukung di browser ini";

    renderLog();
    if (state.pendingAsk) { const t = state.pendingAsk; state.pendingAsk = null; send(t); }
    else input.focus({ preventScroll: true });
  }

  /* =========================================================
     PROGRES
     ========================================================= */
  async function viewProgres() {
    const P = Store.progress;
    const days = new Set(P.days);
    let streak = 0;
    for (let d = new Date(); ; d.setDate(d.getDate() - 1)) {
      const k = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
      if (days.has(k)) streak++; else if (streak || k !== Store.today()) break;
    }
    const last28 = [];
    for (let k = 27; k >= 0; k--) { const d = new Date(); d.setDate(d.getDate() - k); last28.push(d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0")); }
    const learned = Object.keys(P.srs).length;
    const lastSync = +localStorage.getItem("ss.lastSync") || 0;
    view.innerHTML = `
      <h1>Progres</h1>
      <p class="lede">Tersimpan di perangkat ini${S.gasUrl ? " dan disinkronkan ke Google Sheets" : ""}.</p>
      <div class="stats">
        <div class="sheet stat"><b>${streak}</b><span>hari berturut-turut</span></div>
        <div class="sheet stat"><b>${learned}</b><span>kartu sudah dipelajari</span></div>
        <div class="sheet stat"><b>${Store.mastered()}</b><span>kartu dikuasai (≥ 6 hari)</span></div>
        <div class="sheet stat"><b>${P.days.length}</b><span>hari belajar total</span></div>
      </div>
      <div class="small muted">28 hari terakhir</div>
      <div class="streak" aria-label="Aktivitas 28 hari terakhir">${last28.map(k => `<i class="${days.has(k) ? "on" : ""}" title="${k}"></i>`).join("")}</div>
      <h2>Per bab</h2>
      <ul class="bab-prog">
        ${available().map(b => {
          const q = P.quiz[b.bab];
          return `<li><span>Bab ${b.bab}</span><span class="jp">${esc(b.judul)}</span><span>${q ? `kuis ${q.best}%` : `<span class="muted">belum kuis</span>`}</span></li>`;
        }).join("")}
      </ul>
      <h2>Sinkronisasi</h2>
      <p class="small muted">${S.gasUrl ? (lastSync ? "Terakhir sinkron: " + new Date(lastSync).toLocaleString("id-ID") : "Belum pernah sinkron.") : "Isi URL GAS di Setting supaya progres sama di HP dan laptop."}</p>
      <button class="btn" id="syncNow" ${S.gasUrl ? "" : "disabled"}>Sinkronkan sekarang</button>`;
    const btn = $("#syncNow");
    btn.onclick = async () => {
      btn.disabled = true; btn.textContent = "Menyinkronkan…";
      try { await Store.sync(); toast("Progres tersinkron."); viewProgres(); }
      catch (e) { toast(e.message); btn.disabled = false; btn.textContent = "Sinkronkan sekarang"; }
    };
  }

  /* =========================================================
     SETTING
     ========================================================= */
  async function viewSetting() {
    const voices = Speech.voices();
    const pdf = await Store.getFile("buku.pdf");
    view.innerHTML = `
      <h1>Setting</h1>
      <p class="lede">Semua isian disimpan di perangkat ini saja, tidak ikut ke GitHub.</p>
      <form class="form" id="setForm" autocomplete="off">
        <fieldset>
          <legend>Sensei (AI)</legend>
          <div class="field">
            <span class="lbl">Otak AI</span>
            <div class="seg" role="group" aria-label="Penyedia AI">
              <button type="button" data-prov="claude" aria-pressed="${S.provider === "claude"}">Claude</button>
              <button type="button" data-prov="gemini" aria-pressed="${S.provider === "gemini"}">Gemini</button>
            </div>
            <p class="help">Claude: bahasa Jepang paling natural. Gemini: ada kuota gratis. API key keduanya disimpan di Worker.</p>
          </div>
          <div class="field">
            <label for="workerUrl">URL Cloudflare Worker</label>
            <input type="url" id="workerUrl" placeholder="https://shokyuu-sensei.namaakun.workers.dev" value="${esc(S.workerUrl)}">
          </div>
          <div class="field">
            <label for="token">Token akses</label>
            <input type="password" id="token" placeholder="sama dengan ACCESS_TOKEN di Worker" value="${esc(S.token)}">
            <p class="help">Kosongkan URL Worker untuk mencoba mode demo.</p>
          </div>
          <button type="button" class="btn" id="testAi">Tes koneksi Sensei</button>
        </fieldset>

        <fieldset>
          <legend>Tampilan jawaban</legend>
          <label class="check"><input type="checkbox" id="furigana" ${S.furigana ? "checked" : ""}> Tampilkan furigana di atas kanji</label>
          <label class="check"><input type="checkbox" id="romaji" ${S.romaji ? "checked" : ""}> Tambahkan romaji</label>
          <div class="field">
            <label for="theme">Tema</label>
            <select id="theme">
              <option value="auto" ${S.theme === "auto" ? "selected" : ""}>Ikuti perangkat</option>
              <option value="light" ${S.theme === "light" ? "selected" : ""}>Terang</option>
              <option value="dark" ${S.theme === "dark" ? "selected" : ""}>Gelap</option>
            </select>
          </div>
        </fieldset>

        <fieldset>
          <legend>Suara</legend>
          <label class="check"><input type="checkbox" id="autoSpeak" ${S.autoSpeak ? "checked" : ""}> Bacakan jawaban Sensei otomatis</label>
          <div class="field">
            <label for="voice">Suara Jepang</label>
            <select id="voice">
              <option value="">Otomatis (pilih yang terbaik)</option>
              ${voices.map(v => `<option ${S.voice === v.name ? "selected" : ""}>${esc(v.name)}</option>`).join("")}
            </select>
            <p class="help">${voices.length ? voices.length + " suara Jepang tersedia." : "Belum ada suara Jepang. Di Windows: Settings → Time & language → Speech → tambah Japanese. Di Edge sudah ada suara online Nanami."}</p>
          </div>
          <div class="field">
            <label for="rate">Kecepatan bicara: <span id="rateVal">${S.rate}</span></label>
            <input type="range" id="rate" min="0.5" max="1.3" step="0.05" value="${S.rate}" style="width:100%">
          </div>
          <button type="button" class="btn" id="testVoice">Tes suara</button>
        </fieldset>

        <fieldset>
          <legend>Belajar</legend>
          <div class="field">
            <label for="newPerDay">Kartu baru per hari</label>
            <select id="newPerDay">${[5, 10, 15, 20, 30].map(n => `<option ${S.newPerDay === n ? "selected" : ""}>${n}</option>`).join("")}</select>
          </div>
          <div class="field">
            <label for="pdfFile">PDF buku 初級日本語</label>
            <input type="file" id="pdfFile" accept="application/pdf">
            <p class="help">${pdf ? "PDF sudah tersimpan di perangkat ini (" + (pdf.size / 1048576).toFixed(1) + " MB)." : "Belum ada. PDF hanya disimpan di perangkat ini, tidak di-upload ke mana pun."}</p>
          </div>
        </fieldset>

        <fieldset>
          <legend>Sinkron progres (Google Sheets)</legend>
          <div class="field">
            <label for="gasUrl">URL Web App GAS</label>
            <input type="url" id="gasUrl" placeholder="https://script.google.com/macros/s/…/exec" value="${esc(S.gasUrl)}">
            <p class="help">Token akses yang sama dipakai untuk GAS.</p>
          </div>
          <button type="button" class="btn" id="testGas">Tes koneksi GAS</button>
        </fieldset>

        <fieldset>
          <legend>Pasang di HP / perangkat lain</legend>
          <p class="help" style="margin:0">Buat link setup berisi URL Worker, URL GAS, dan token. Scan QR-nya dari HP, maka setting langsung terisi. Jangan bagikan link ini ke orang lain.</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button type="button" class="btn primary" id="makeLink">Buat link &amp; QR</button>
          </div>
          <div id="linkBox" hidden style="display:grid;gap:10px;justify-items:start">
            <div id="qr" style="background:#fff;padding:10px;border-radius:8px"></div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button type="button" class="btn" id="copyLink">Salin link</button>
              <button type="button" class="btn" id="shareLink">Kirim (WhatsApp, dll.)</button>
            </div>
          </div>
        </fieldset>

        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn primary">Simpan setting</button>
          <button type="button" class="btn ghost" id="resetProg">Hapus semua progres</button>
        </div>
      </form>`;
    $$("[data-prov]").forEach(b => b.onclick = () => { $$("[data-prov]").forEach(x => x.setAttribute("aria-pressed", x === b)); });
    $("#rate").oninput = e => $("#rateVal").textContent = e.target.value;
    function collect() {
      S.provider = $("[data-prov][aria-pressed=true]").dataset.prov;
      S.workerUrl = $("#workerUrl").value.trim();
      S.token = $("#token").value.trim();
      S.gasUrl = $("#gasUrl").value.trim();
      S.furigana = $("#furigana").checked;
      S.romaji = $("#romaji").checked;
      S.autoSpeak = $("#autoSpeak").checked;
      S.voice = $("#voice").value;
      S.rate = +$("#rate").value;
      S.newPerDay = +$("#newPerDay").value;
      S.theme = $("#theme").value;
      Store.saveSettings(); applyTheme();
    }
    $("#setForm").onsubmit = e => { e.preventDefault(); collect(); toast("Setting tersimpan."); };
    $("#testVoice").onclick = () => { collect(); Speech.speak("こんにちは。わたしは しょきゅう せんせいです。どうぞ よろしく。", { raw: true }); };
    $("#testAi").onclick = async () => {
      collect();
      if (!S.workerUrl) { toast("Isi URL Worker dulu."); return; }
      const b = $("#testAi"); b.disabled = true; b.textContent = "Mengetes…";
      const t0 = performance.now(); let first = 0;
      try {
        const d = await getBab(S.bab);
        await Sensei.ask({ mode: "kaiwa", active: d, loaded: [d], history: [{ role: "user", content: "こんにちは。Jawab satu kalimat saja." }], onDelta: () => { if (!first) first = performance.now(); } });
        toast(`Sensei terhubung (${S.provider}). Kata pertama ${Math.round(first - t0)} ms.`);
      } catch (e) { toast(e.message); }
      b.disabled = false; b.textContent = "Tes koneksi Sensei";
    };
    $("#makeLink").onclick = async () => {
      collect();
      if (!S.workerUrl || !S.token) { toast("Isi URL Worker dan token dulu."); return; }
      const link = setupLink();
      const box = $("#linkBox"); box.hidden = false; box.style.display = "grid";
      const qr = $("#qr"); qr.innerHTML = "";
      try {
        await loadScript("js/qrcode.js");
        const q = window.qrcode(0, "L"); q.addData(link); q.make();
        qr.innerHTML = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
        const svg = qr.querySelector("svg"); svg.style.width = "220px"; svg.style.height = "220px";
      } catch (e) { qr.textContent = "QR tidak bisa dibuat (offline?). Pakai tombol Salin link."; }
      $("#copyLink").onclick = async () => {
        try { await navigator.clipboard.writeText(link); toast("Link setup disalin."); }
        catch (e) { prompt("Salin link ini:", link); }
      };
      $("#shareLink").onclick = async () => {
        if (navigator.share) { try { await navigator.share({ title: "Setup Shokyuu Sensei", url: link }); } catch (e) {} }
        else { try { await navigator.clipboard.writeText(link); toast("Link disalin. Tempel di chat ke diri sendiri."); } catch (e) { prompt("Salin link ini:", link); } }
      };
    };
    $("#testGas").onclick = async () => {
      collect();
      try { await Store.gas("ping"); toast("GAS terhubung."); } catch (e) { toast(e.message); }
    };
    $("#pdfFile").onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      try { await Store.putFile("buku.pdf", f); toast("PDF buku tersimpan di perangkat ini."); viewSetting(); }
      catch (err) { toast("Gagal menyimpan PDF: " + err.message); }
    };
    $("#resetProg").onclick = () => {
      if (confirm("Hapus semua progres kartu, kuis, dan riwayat belajar di perangkat ini?")) { Store.resetProgress(); toast("Progres dihapus."); }
    };
  }

  /* =========================================================
     ROUTER
     ========================================================= */
  const ROUTES = { materi: viewMateri, kartu: viewKartu, kuis: viewKuis, sensei: viewSensei, progres: viewProgres, setting: viewSetting };
  async function route() {
    const tab = (location.hash.replace(/^#\//, "") || "materi").split("?")[0];
    state.tab = ROUTES[tab] ? tab : "materi";
    $$("[data-tab]").forEach(a => {
      if (a.dataset.tab === state.tab) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    if (state.tab !== "sensei") Speech.stop();
    try { await ROUTES[state.tab](); }
    catch (e) { view.innerHTML = `<div class="sheet empty"><h3>Halaman gagal dimuat</h3><p class="muted">${esc(e.message)}</p></div>`; console.error(e); }
    view.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }

  /* ---------- link setup antar-perangkat ---------- */
  function setupLink() {
    const data = { w: S.workerUrl, g: S.gasUrl, t: S.token, p: S.provider };
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(data)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    return location.origin + location.pathname + "#/setup?d=" + b64;
  }
  function loadScript(src) {
    return new Promise((res, rej) => {
      if (document.querySelector(`script[src="${src}"]`)) return res();
      const el = document.createElement("script"); el.src = src; el.onload = res; el.onerror = () => rej(new Error("gagal memuat"));
      document.head.appendChild(el);
    });
  }
  // Kalau dibuka lewat link setup: simpan setting, lalu hapus token dari address bar
  function applySetupFromHash() {
    const m = location.hash.match(/^#\/setup\?d=([A-Za-z0-9_-]+)/);
    if (!m) return false;
    try {
      let b = m[1].replace(/-/g, "+").replace(/_/g, "/"); while (b.length % 4) b += "=";
      const d = JSON.parse(decodeURIComponent(escape(atob(b))));
      if (d.w) S.workerUrl = d.w;
      if (d.g) S.gasUrl = d.g;
      if (d.t) S.token = d.t;
      if (d.p) S.provider = d.p;
      Store.saveSettings();
      history.replaceState(null, "", location.pathname + "#/materi");
      setTimeout(() => toast("Setting otomatis terpasang. Sensei siap dipakai."), 300);
      if (S.gasUrl) Store.sync().catch(() => {});
    } catch (e) {
      history.replaceState(null, "", location.pathname + "#/setting");
      setTimeout(() => toast("Link setup rusak. Buat ulang dari laptop."), 300);
    }
    return true;
  }

  async function init() {
    applySetupFromHash();
    applyTheme(); netStatus();
    addEventListener("online", () => { netStatus(); Store.scheduleSync(); });
    addEventListener("offline", netStatus);
    await loadIndex();
    if (!available().some(b => b.bab === S.bab)) { S.bab = available()[0].bab; Store.saveSettings(); }
    fillBabSelect();
    addEventListener("hashchange", () => { if (applySetupFromHash()) return; route(); });
    await route();
    if (S.gasUrl) Store.sync().catch(() => {});
    if ("serviceWorker" in navigator && location.protocol !== "file:") {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  }

  window.App = { toast };
  init();
})();
