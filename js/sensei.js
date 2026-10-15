/* sensei.js — persona Sensei, prompt sesuai bab aktif, dan streaming lewat Cloudflare Worker */
(function () {
  const MODES = {
    kaiwa: {
      label: "Kaiwa bebas",
      task: "Ajak Pak Pri ngobrol santai dalam bahasa Jepang. Ajukan satu pertanyaan pendek di setiap giliran supaya dia terus bicara. Jaga obrolan tetap sederhana dan natural seperti percakapan sungguhan."
    },
    roleplay: {
      label: "Roleplay bab",
      task: "Buat situasi roleplay BARU (bukan dialog dari buku) yang memakai tema, kosakata, dan pola kalimat bab aktif. Di pesan pertama: jelaskan situasi dan peran masing-masing dalam 1–2 kalimat bahasa Indonesia, lalu mulai dengan kalimat pertamamu dalam bahasa Jepang. Setelah itu tetap dalam peran. Setelah sekitar 6 giliran, tutup roleplay dan beri evaluasi singkat."
    },
    bunpo: {
      label: "Tanya bunpo",
      task: "Jawab pertanyaan tata bahasa dengan jelas dalam bahasa Indonesia santai. Beri 2–3 contoh kalimat Jepang yang memakai kosakata sampai bab aktif. Akhiri dengan satu soal latihan kecil."
    },
    koreksi: {
      label: "Koreksi kalimat",
      task: "Pak Pri akan menulis kalimat Jepang. Untuk setiap kalimat: (1) kalau sudah benar, puji singkat dan beri versi yang lebih natural bila ada; (2) kalau salah, tulis versi yang benar, tunjukkan bagian yang salah, dan jelaskan alasannya dalam 1–2 kalimat bahasa Indonesia. Lalu minta kalimat berikutnya."
    }
  };

  function levelSummary(babData) {
    // Ringkas kosakata & pola sampai bab aktif agar Sensei menjaga level
    const words = [], patterns = [];
    for (const d of babData) {
      d.kotoba.forEach(k => words.push(k.kanji ? `${k.jp}(${k.kanji})` : k.jp));
      d.bunpo.forEach(b => patterns.push(`${b.pola} = ${b.arti}`));
    }
    return { words: words.join("、"), patterns: patterns.join("\n- ") };
  }

  function buildSystem(mode, active, loaded) {
    const s = window.Store.settings;
    const sum = levelSummary(loaded);
    return [
      "Kamu adalah Sensei: guru bahasa Jepang, penutur asli dari Tokyo, ramah, sabar, dan berpengalaman mengajar orang Indonesia.",
      "Muridmu: Pak Pri, orang Indonesia yang bekerja di perusahaan otomotif Jepang. Dia belajar dari buku 初級日本語 (Tokyo University of Foreign Studies).",
      "",
      `BAB AKTIF: Bab ${active.bab} — ${active.judul} (${active.judul_id}). Tema: ${active.tema}`,
      "",
      "ATURAN LEVEL:",
      "- Pakai HANYA kosakata dan pola kalimat sampai bab aktif (daftar di bawah), ditambah kata yang sangat umum.",
      "- Kalau terpaksa memakai kata di luar daftar, beri tanda ★ dan artinya dalam kurung.",
      "- Pakai bentuk sopan です/ます. Kalimat pendek, satu ide per kalimat, dan beri spasi antar-frasa seperti di buku.",
      "",
      "ATURAN FORMAT:",
      "- Tulis kalimat Jepang di baris sendiri. Penjelasan dan terjemahan dalam bahasa Indonesia santai di baris terpisah.",
      s.furigana
        ? "- Untuk SETIAP kanji, tulis bacaannya dengan format 漢字《かんじ》, misalnya 学生《がくせい》. Kata yang ditulis kana tidak perlu."
        : "- Tulis kanji biasa tanpa bacaan.",
      s.romaji ? "- Di bawah setiap kalimat Jepang, tambahkan romaji dalam kurung siku [ ]." : "",
      "- Jangan pakai tabel atau heading. Boleh **tebal** untuk bagian penting. Jawaban ringkas: biasanya 2–6 baris.",
      "- Jangan menyalin dialog dari buku; selalu buat kalimat dan situasi baru.",
      "- Kalau Pak Pri salah, koreksi dengan sopan: tulis versi benar, jelaskan singkat, lalu lanjutkan.",
      "- Kalau Pak Pri menulis dalam bahasa Indonesia, bantu dia mengatakannya dalam bahasa Jepang.",
      "",
      `TUGAS MODE "${MODES[mode].label}": ${MODES[mode].task}`,
      "",
      "KOSAKATA SAMPAI BAB AKTIF:",
      sum.words,
      "",
      "POLA KALIMAT SAMPAI BAB AKTIF:",
      "- " + sum.patterns
    ].filter(l => l !== "").join("\n");
  }

  // Kirim ke Worker dan baca jawaban streaming (teks biasa per potongan)
  async function ask({ mode, active, loaded, history, onDelta, signal }) {
    const s = window.Store.settings;
    if (!s.workerUrl) return demoReply(history, onDelta);
    // batas waktu: kalau 25 detik belum ada kata pertama, batalkan dengan pesan jelas
    const ctrl = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, 25000);
    if (signal) signal.addEventListener("abort", () => ctrl.abort());
    try {
    const res = await fetch(s.workerUrl.replace(/\/$/, "") + "/chat", {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", "X-Access-Token": s.token || "" },
      body: JSON.stringify({
        provider: s.provider,
        system: buildSystem(mode, active, loaded),
        messages: history.slice(-16).map(m => ({ role: m.role, content: m.content })),
        max_tokens: 700
      })
    });
    if (!res.ok || !res.body) {
      let msg = "Sensei tidak bisa dihubungi (" + res.status + ").";
      try { const j = await res.json(); if (j.error) msg = j.error; } catch (e) {}
      if (res.status === 401) msg = "Token akses salah. Samakan token di Setting dengan ACCESS_TOKEN di Worker.";
      throw new Error(msg);
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let full = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      clearTimeout(timer);
      const chunk = dec.decode(value, { stream: true });
      full += chunk;
      onDelta(chunk, full);
    }
    return full;
    } catch (e) {
      if (timedOut) throw new Error("Sensei tidak menjawab dalam 25 detik. Buka " + s.workerUrl.replace(/\/$/, "") + "/test?token=…&provider=" + s.provider + " untuk cek penyebabnya.");
      throw e;
    } finally { clearTimeout(timer); }
  }

  // Mode demo bila Worker belum di-setup: tetap bisa mencoba alur aplikasi
  async function demoReply(history, onDelta) {
    const last = (history[history.length - 1] || {}).content || "";
    const text = history.length <= 1 && !last
      ? "こんにちは。わたしは 先生《せんせい》です。\nHalo! Ini **mode demo**. Isi URL Worker dan token di Setting supaya Sensei bisa ngobrol sungguhan."
      : "いい ですね。\nIni **mode demo**, jadi jawaban saya belum pakai AI. Isi URL Worker dan token di menu Setting (設定), lalu coba lagi.";
    let full = "";
    for (const ch of text) {
      await new Promise(r => setTimeout(r, 12));
      full += ch; onDelta(ch, full);
    }
    return full;
  }

  // Render: 漢字《かんじ》 → <ruby>, **tebal**, baris Jepang diberi kelas khusus
  function render(text) {
    const esc = t => t.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const JP = /[぀-ヿ㐀-鿿]/;
    return text.split("\n").map(line => {
      let h = esc(line)
        .replace(/([㐀-鿿々〆ヶ]+)《([^》]+)》/g, "<ruby>$1<rt>$2</rt></ruby>")
        .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
      const jpCount = (line.match(/[぀-ヿ㐀-鿿]/g) || []).length;
      const isJp = JP.test(line) && jpCount / Math.max(1, line.replace(/\s/g, "").length) > 0.45;
      return `<div class="${isJp ? "jl" : "il"}">${h || "&nbsp;"}</div>`;
    }).join("");
  }

  window.Sensei = { MODES, ask, render, buildSystem };
})();
