/**
 * Shokyuu Sensei — Google Apps Script (sinkron progres + log chat ke Google Sheets)
 *
 * Cara pasang:
 * 1. Buat Google Sheet baru, beri nama "Shokyuu Sensei Data".
 * 2. Menu Extensions → Apps Script. Hapus isi Code.gs, tempel file ini.
 * 3. Project Settings (ikon gerigi) → Script Properties → Add:
 *      ACCESS_TOKEN = token yang sama dengan di aplikasi & Worker
 * 4. Deploy → New deployment → Web app
 *      Execute as: Me    |    Who has access: Anyone
 * 5. Salin URL yang berakhiran /exec ke Setting aplikasi.
 */

const CHUNK = 40000; // batas aman isi satu sel

function doGet() {
  return out_({ ok: true, app: "shokyuu-sensei" });
}

function doPost(e) {
  try {
    const req = JSON.parse((e.postData && e.postData.contents) || "{}");
    const token = PropertiesService.getScriptProperties().getProperty("ACCESS_TOKEN");
    if (!token || req.token !== token) return out_({ ok: false, error: "Token akses salah (GAS)." });

    switch (req.action) {
      case "ping": return out_({ ok: true });
      case "get":  return out_({ ok: true, data: readProgress_() });
      case "put":  writeProgress_(req.data); return out_({ ok: true });
      case "log":  logChat_(req.row || {}); return out_({ ok: true });
      default:     return out_({ ok: false, error: "Aksi tidak dikenal: " + req.action });
    }
  } catch (err) {
    return out_({ ok: false, error: String(err) });
  }
}

/* ---------- progres disimpan sebagai JSON, dipecah per baris ---------- */
function sheet_(name, header) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); if (header) sh.appendRow(header); }
  return sh;
}

function readProgress_() {
  const sh = sheet_("progress");
  const n = sh.getLastRow();
  if (n < 2) return null;
  const json = sh.getRange(2, 1, n - 1, 1).getValues().map(r => r[0]).join("");
  return json ? JSON.parse(json) : null;
}

function writeProgress_(data) {
  if (!data) throw new Error("Data kosong.");
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = sheet_("progress");
    const json = JSON.stringify(data);
    const rows = [];
    for (let i = 0; i < json.length; i += CHUNK) rows.push([json.slice(i, i + CHUNK)]);
    sh.clear();
    sh.getRange(1, 1, 1, 2).setValues([["data (jangan diedit manual)", "diperbarui"]]);
    sh.getRange(2, 1, rows.length, 1).setValues(rows);
    sh.getRange(2, 2).setValue(new Date());
    updateSummary_(data);
  } finally {
    lock.releaseLock();
  }
}

/* ---------- ringkasan yang enak dibaca manusia ---------- */
function updateSummary_(p) {
  const sh = sheet_("ringkasan");
  sh.clear();
  const srs = p.srs || {};
  const ids = Object.keys(srs);
  const mastered = ids.filter(id => srs[id].iv >= 6).length;
  const rows = [
    ["Diperbarui", new Date()],
    ["Hari belajar", (p.days || []).length],
    ["Kartu dipelajari", ids.length],
    ["Kartu dikuasai (≥ 6 hari)", mastered],
    ["", ""],
    ["Bab", "Kuis terbaik (%)"]
  ];
  Object.keys(p.quiz || {}).sort((a, b) => a - b).forEach(b => rows.push(["Bab " + b, p.quiz[b].best]));
  sh.getRange(1, 1, rows.length, 2).setValues(rows);
  sh.autoResizeColumns(1, 2);
}

/* ---------- log percakapan dengan Sensei ---------- */
function logChat_(row) {
  const sh = sheet_("chat_log", ["waktu", "bab", "mode", "peran", "teks"]);
  sh.appendRow([row.t || new Date().toISOString(), row.bab || "", row.mode || "", row.role || "", String(row.text || "").slice(0, 4000)]);
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
