# PRD — Shokyuu Sensei (初級先生)

**Versi:** 1.0 (MVP)  
**Tanggal:** 15 Oktober 2026  
**Pemilik:** Prihatin Purwadi (Pak Pri)  
**Status:** Disetujui untuk prototipe Bab 1–3

---

## 1. Latar Belakang

Aplikasi sebelumnya (Nihongo Sensei AI) hilang karena repo GitHub terhapus. Shokyuu Sensei dibangun ulang dari nol dengan fokus yang lebih jelas: membantu Pak Pri menguasai buku **初級日本語 新装版** (Tokyo University of Foreign Studies, 28 bab + 10 よみもの) sampai bisa **ngobrol bahasa Jepang secara natural**.

Dokumen ini menjadi pegangan utama. Setiap sesi pengembangan (termasuk Claude Code) membaca file ini lebih dulu.

## 2. Tujuan

1. Menguasai isi buku bab per bab: kosakata (ことば), kanji, bunpo (ぶんけい), dan kaiwa.
2. Punya lawan bicara bahasa Jepang yang **natural seperti native speaker** dan bisa diajak ngobrol **instan** kapan saja.
3. Bisa dipakai di HP dan laptop kantor **tanpa instalasi apa pun** (cukup browser).

### Bukan tujuan (di luar MVP)
- Mode AI lokal / offline LLM (OpenVINO, Jetson): dipertimbangkan nanti di laptop pribadi.
- Multi-user, login, atau dipakai orang lain.
- Bab 4–28 dan よみもの: ditambahkan bertahap setelah Bab 1–3 terbukti jalan.

## 3. Pengguna

Satu pengguna: Pak Pri. Penutur bahasa Indonesia, terbiasa dengan lingkungan kerja Jepang, belajar dari level 初級 (setara N5–N4). Belajar di sela waktu kerja, dari HP dan laptop kantor (Windows yang dikunci IT).

## 4. Fitur MVP

### F1. Materi per Bab
- Daftar bab (1–28); MVP berisi Bab 1–3.
- Tiap bab punya:
  - **Ringkasan tema** dan situasi percakapan.
  - **ことば**: kata Jepang, kana, arti bahasa Indonesia, contoh kalimat. Tombol 🔊 untuk dengar pelafalan.
  - **かんじ**: kanji baru, onyomi/kunyomi, arti, contoh kata.
  - **ぶんけい (bunpo)**: pola kalimat, penjelasan singkat dalam bahasa Indonesia, 2–3 contoh.
- Tombol "Buka halaman buku" untuk menampilkan halaman PDF bab tersebut dari file milik pengguna (lihat aturan data §7).

### F2. Flashcard + SRS
- Kartu kosakata dan kanji per bab, atau gabungan beberapa bab.
- Penilaian: Lupa / Susah / Bisa / Mudah → jadwal ulang otomatis (algoritma SM-2 sederhana).
- Jalan **offline**.

### F3. Kuis
- Pilihan ganda: arti kata, bacaan kanji, partikel yang tepat (は/が/を/に/で/の/も…), menyusun kalimat.
- Skor per bab disimpan.
- Jalan **offline**.

### F4. Chat Sensei (inti aplikasi)
- Ngobrol teks dengan Sensei AI, jawaban **streaming** (kata pertama muncul < 1 detik).
- Mode:
  - **Kaiwa bebas**: obrolan santai sesuai level bab.
  - **Roleplay bab**: Sensei membuat situasi baru berdasarkan tema dan bunpo bab aktif.
  - **Tanya bunpo**: penjelasan dalam bahasa Indonesia.
  - **Koreksi kalimat**: Pak Pri menulis kalimat, Sensei mengoreksi dan menjelaskan.
- Setiap jawaban Sensei bisa diputar suaranya (🔊) dan ditampilkan furigana/romaji (bisa disembunyikan).

### F5. Latihan Bicara (suara)
- Tombol mikrofon: ucapan bahasa Jepang diubah jadi teks (Web Speech API, `ja-JP`), lalu dikirim ke Sensei.
- Jawaban Sensei dibacakan otomatis (Web Speech API; di Edge memakai suara Jepang seperti "Nanami").
- Bisa dinyalakan/dimatikan.

### F6. Progres
- Bab yang sudah dibuka, jumlah kata yang dikuasai, skor kuis, streak harian.
- Tersimpan lokal (IndexedDB) dan disinkronkan ke Google Sheets saat online, supaya HP dan laptop sama.

### F7. Pengaturan
- Pilih penyedia AI: **Claude** atau **Gemini**.
- Tampilan furigana / romaji / terjemahan: on/off.
- Kecepatan suara.
- Bab aktif (menentukan level bahasa Sensei).

## 5. Persona Sensei

- Native speaker bahasa Jepang (Tokyo), guru berpengalaman, sabar dan ramah.
- **Menyesuaikan level**: hanya memakai kosakata dan bunpo sampai bab aktif (plus kata yang sangat umum). Kalau terpaksa memakai kata baru, kata itu ditandai dan dijelaskan.
- Bicara bahasa Jepang dulu, penjelasan dalam **bahasa Indonesia santai**.
- Mengoreksi kesalahan dengan sopan: tunjukkan kalimat yang benar, jelaskan singkat, lalu lanjutkan obrolan.
- Default bahasa sopan です/ます sesuai buku; bisa diminta latihan bentuk biasa.
- **Tidak menyalin dialog buku**. Sensei membuat dialog dan soal baru berdasarkan tema, kosakata, dan bunpo bab.

## 6. Arsitektur

```
HP / Laptop (browser)
  └─ PWA "Shokyuu Sensei"  ── di-host di GitHub Pages
       ├─ Offline: materi bab (JSON), flashcard, kuis, suara TTS, progres lokal (IndexedDB)
       ├─ Online  → Cloudflare Worker ── streaming ──→ Claude API / Gemini API
       └─ Online  → GAS Web App ──→ Google Sheets (sinkron progres & log chat)
```

| Komponen | Teknologi | Alasan |
|---|---|---|
| Frontend | HTML/CSS/JS statis, PWA (service worker), GitHub Pages | Gratis, bisa di-install, jalan offline |
| Proxy AI | Cloudflare Worker (gratis) | Mendukung **streaming**, jadi chat terasa instan; menyimpan API key |
| Data progres | Google Apps Script + Google Sheets | Gratis, mudah dilihat dan di-backup |
| Suara | Web Speech API (STT & TTS) | Tanpa instalasi, cocok untuk laptop kantor yang dikunci IT |

**Kenapa bukan GAS untuk AI:** GAS tidak bisa streaming; jawaban baru muncul utuh setelah 2–5 detik.  
**Kenapa bukan lokal (OpenVINO):** di laptop i5-1135G7 / Iris Xe, model 7B butuh ±8–15 detik per jawaban dan bahasa Jepangnya kurang natural; instalasinya juga terhalang kebijakan IT.

## 7. Aturan Data & Keamanan

1. **API key hanya di Cloudflare Worker** (secret). Tidak pernah ada di repo GitHub atau kode frontend.
2. Worker hanya menerima request dari domain GitHub Pages milik Pak Pri, plus **token akses pribadi** sederhana, supaya tidak dipakai orang lain.
3. **PDF buku tidak di-upload ke GitHub** (repo publik, buku berhak cipta). PDF dibuka dari perangkat pengguna dan disimpan lokal di IndexedDB.
4. Repo hanya berisi data ringkas per bab: daftar kosakata, kanji, dan pola bunpo, ditulis ulang dengan penjelasan sendiri. Dialog asli buku tidak disalin.
5. Repo di-backup: GitHub + salinan zip di Google Drive, supaya tidak hilang lagi.

## 8. Struktur Data Bab (JSON)

```json
{
  "bab": 1,
  "judul": "どうぞ よろしく",
  "tema": "Perkenalan diri, menanyakan orang dan barang",
  "kotoba": [
    { "jp": "がくせい", "kanji": "学生", "arti": "pelajar, mahasiswa", "contoh": "わたしは がくせいです。" }
  ],
  "kanji": [
    { "k": "人", "on": ["じん"], "kun": ["ひと"], "arti": "orang", "contoh": ["にほん人", "あの人"] }
  ],
  "bunpo": [
    { "pola": "N1 は N2 です", "jelaskan": "N1 adalah N2", "contoh": ["わたしは たなかです。"] }
  ],
  "halaman_pdf": [1, 7]
}
```

## 9. Kriteria Selesai (MVP Bab 1–3)

- [ ] Aplikasi terbuka dari link GitHub Pages di HP dan laptop kantor, bisa di-install sebagai PWA.
- [ ] Materi, flashcard, dan kuis Bab 1–3 jalan **tanpa internet**.
- [ ] Chat Sensei: kata pertama muncul **< 1 detik**, bahasa Jepang natural, sesuai level bab aktif.
- [ ] Sensei mengoreksi kalimat yang salah dan menjelaskan dalam bahasa Indonesia.
- [ ] Mikrofon menangkap ucapan Jepang, dan jawaban Sensei dibacakan dengan suara Jepang.
- [ ] Progres tersinkron antara HP dan laptop lewat Google Sheets.
- [ ] Tidak ada API key di repo GitHub.

## 10. Rencana Bertahap

| Tahap | Isi |
|---|---|
| 1 | PRD (dokumen ini) |
| 2 | Prototipe frontend PWA + data Bab 1–3 + Chat Sensei via Cloudflare Worker |
| 3 | GAS + Google Sheets untuk sinkron progres |
| 4 | Uji pakai 1 minggu, perbaikan |
| 5 | Tambah Bab 4–28 bertahap (±3 bab per batch) + よみもの |
| 6 (opsional) | Mode AI lokal untuk laptop pribadi / Jetson; suara VOICEVOX |

## 11. Risiko

| Risiko | Mitigasi |
|---|---|
| Biaya API membengkak | Batas token per jawaban, riwayat chat dipangkas, pilihan model murah (Haiku / Gemini Flash) |
| Suara Jepang di browser kurang natural di sebagian HP | Opsi suara cloud TTS atau VOICEVOX di tahap berikutnya |
| Ekstraksi isi buku (PDF hasil scan) salah baca | Data bab dicek manual per batch sebelum masuk repo |
| Repo hilang lagi | PRD + data disimpan juga di Project claude.ai dan Google Drive |
