# Shokyuu Sensei (初級先生)

Guru bahasa Jepang pribadi untuk buku **初級日本語 新装版**. Isi: materi per bab, kartu hafalan (SRS), kuis, dan **Sensei AI** yang bisa diajak ngobrol (teks & suara) dengan jawaban streaming.

Baca `PRD.md` untuk tujuan, aturan, dan rencana lengkap.

```
shokyuu-sensei/
├─ index.html, manifest.webmanifest, sw.js   ← PWA (GitHub Pages)
├─ css/style.css
├─ js/store.js    progres, SRS, sinkron GAS, simpan PDF lokal
├─ js/speech.js   suara Jepang + mikrofon (Web Speech API)
├─ js/sensei.js   persona Sensei + streaming ke Worker
├─ js/app.js      semua tampilan
├─ data/          index.json + bab1–3.json
├─ icons/
└─ backend/
   ├─ worker.js   Cloudflare Worker (proxy AI, streaming)
   └─ Code.gs     Google Apps Script (sinkron progres ke Sheets)
```

> ⚠️ Jangan pernah menaruh API key atau PDF buku di repo ini. Repo GitHub Pages gratis itu publik.

---

## Langkah 1 — Frontend di GitHub Pages (±5 menit)

1. Buat repo baru di GitHub, misalnya `shokyuu-sensei` (Public).
2. Upload **semua isi folder ini** (kecuali folder `backend/` boleh ikut, isinya tidak rahasia).
3. Repo → **Settings → Pages** → Source: `Deploy from a branch` → Branch: `main` / `(root)` → Save.
4. Tunggu 1–2 menit. Aplikasi ada di `https://<username>.github.io/shokyuu-sensei/`.
5. Buka di HP (Chrome) → menu ⋮ → **Install app / Tambahkan ke layar utama**.

Tanpa langkah 2 & 3, aplikasi sudah bisa dipakai: materi, kartu, kuis jalan; Sensei dalam **mode demo**.

## Langkah 2 — Otak Sensei di Cloudflare Worker (±10 menit)

1. Daftar/login di https://dash.cloudflare.com (gratis).
2. **Workers & Pages → Create → Create Worker** → beri nama `shokyuu-sensei` → Deploy.
3. **Edit code** → hapus isinya → tempel isi `backend/worker.js` → **Deploy**.
4. Worker → **Settings → Variables and Secrets** → tambahkan:

   | Nama | Tipe | Isi |
   |---|---|---|
   | `ACCESS_TOKEN` | Secret | buat sendiri, contoh: `pri-nihongo-2026-xyz` (panjang & acak) |
   | `ANTHROPIC_API_KEY` | Secret | API key dari https://console.anthropic.com (kalau pakai Claude) |
   | `GEMINI_API_KEY` | Secret | API key dari https://aistudio.google.com (kalau pakai Gemini) |
   | `ALLOWED_ORIGINS` | Text | `https://<username>.github.io` |
   | `CLAUDE_MODEL` | Text (opsional) | default `claude-haiku-5-5` (cepat & hemat). Ganti `claude-sonnet-5-5` untuk kualitas lebih tinggi |
   | `GEMINI_MODEL` | Text (opsional) | default `gemini-flash-latest` |

   Cukup isi salah satu API key, sesuai pilihan di aplikasi.
5. Salin URL Worker, contoh `https://shokyuu-sensei.namaakun.workers.dev`.
6. Di aplikasi: **設定 (Setting)** → isi URL Worker dan Token akses → **Simpan** → **Tes koneksi Sensei**. Tes menampilkan waktu sampai kata pertama muncul.

## Langkah 3 — Sinkron progres ke Google Sheets (±5 menit, opsional)

1. Buat Google Sheet baru, nama `Shokyuu Sensei Data`.
2. **Extensions → Apps Script** → tempel isi `backend/Code.gs`.
3. ⚙️ Project Settings → **Script Properties** → `ACCESS_TOKEN` = token yang sama dengan langkah 2.
4. **Deploy → New deployment → Web app** → Execute as: *Me*, Who has access: *Anyone* → Deploy → izinkan akses.
5. Salin URL `/exec` → tempel di Setting aplikasi → **Tes koneksi GAS**.

Sheet akan berisi: `progress` (data mentah, jangan diedit), `ringkasan` (statistik), dan `chat_log` (riwayat ngobrol dengan Sensei).

## Langkah 4 — PDF buku (opsional)

Setting → **PDF buku** → pilih file PDF. File disimpan di perangkat itu saja (IndexedDB), lalu tombol **Buka halaman buku** di Materi langsung membuka halaman bab yang sesuai. Lakukan sekali di setiap perangkat.

---

## Suara

- **Laptop Windows:** pakai **Edge** → suara Jepang online "Nanami" paling natural. Mikrofon bahasa Jepang jalan di Edge/Chrome.
- **HP Android:** Chrome. Kalau suara Jepang tidak ada: Settings → Google → Text-to-speech → install data bahasa Jepang.
- Kecepatan bicara & pilihan suara ada di Setting.

## Menambah bab baru

1. Buat `data/babN.json` dengan format yang sama seperti `bab1.json` (kotoba, kanji, bunpo, partikel). Tulis penjelasan & contoh sendiri, jangan menyalin dialog buku.
2. Isi `"file": "data/babN.json"` di `data/index.json`.
3. Tambahkan file itu ke daftar `SHELL` di `sw.js` dan **naikkan `VERSION`**.

## Update aplikasi

Setiap mengubah file, naikkan `VERSION` di `sw.js` (misalnya `ss-v1.0.1`) supaya HP mengambil versi terbaru.

## Backup

Selain GitHub, simpan zip repo ini di Google Drive. Data progres aman di Google Sheets.
