/**
 * Navoo waitlist → Google Sheets
 * Paste this into Extensions → Apps Script of your Google Sheet, set SECRET, then
 * Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone.
 * Copy the web app URL into Netlify as SHEETS_WEBHOOK_URL.
 */

// Must match SHEETS_SECRET in Netlify. Use a long random string (letters + numbers).
const SECRET = '6Smsq4SvxsNmKcjT6jcPWdc4TDKhzefL';

const SHEET_NAME = 'Submissions';
const COLUMNS = [
  ['created_at', 'Date'],
  ['email', 'Email'],
  ['form_location', 'Form'],
  ['utm_source', 'UTM source'],
  ['utm_medium', 'UTM medium'],
  ['utm_campaign', 'UTM campaign'],
  ['utm_content', 'UTM content'],
  ['utm_term', 'UTM term'],
  ['fbclid', 'fbclid'],
  ['gclid', 'gclid'],
  ['referrer', 'Referrer'],
  ['landing_page', 'Landing page'],
  ['device', 'Device'],
  ['country', 'Country'],
  ['event_id', 'Event ID'],
  ['repeat_count', 'Times submitted'],
  ['last_seen', 'Last submitted'],
];

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!SECRET || SECRET.indexOf('PASTE-') === 0) return out({ ok: false, error: 'SECRET not set in Apps Script' });
    if (body.secret !== SECRET) return out({ ok: false, error: 'unauthorised' });
    const row = body.row || {};
    const email = String(row.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return out({ ok: false, error: 'invalid email' });

    const lock = LockService.getScriptLock();
    lock.waitLock(20000); // one write at a time, so duplicates can't slip in
    try {
      const sheet = getSheet();
      const now = new Date();
      const emailCol = 2;

      // Duplicate check: exact match in the Email column
      const lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        const found = sheet.getRange(2, emailCol, lastRow - 1, 1)
          .createTextFinder(email).matchEntireCell(true).matchCase(false).findNext();
        if (found) {
          const r = found.getRow();
          const repeatCol = colIndex('repeat_count');
          const current = Number(sheet.getRange(r, repeatCol).getValue()) || 1;
          sheet.getRange(r, repeatCol, 1, 2).setValues([[current + 1, now]]);
          return out({ ok: true, duplicate: true });
        }
      }

      const values = COLUMNS.map(function (c) {
        const key = c[0];
        if (key === 'created_at') return now;
        if (key === 'email') return email;
        if (key === 'repeat_count') return 1;
        if (key === 'last_seen') return now;
        return safe(row[key]);
      });
      sheet.appendRow(values);
      return out({ ok: true, duplicate: false });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return out({ ok: false, error: String(err && err.message || err) });
  }
}

// Visiting the URL in a browser should show {"ok":true,...} — handy to check the deployment works.
function doGet() {
  return out({ ok: true, service: 'navoo-waitlist', sheet: SHEET_NAME });
}

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(COLUMNS.map(function (c) { return c[1]; }));
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, COLUMNS.length).setFontWeight('bold').setBackground('#16324F').setFontColor('#FFFFFF');
    sheet.getRange('A:A').setNumberFormat('yyyy-mm-dd hh:mm');
    sheet.getRange('Q:Q').setNumberFormat('yyyy-mm-dd hh:mm');
    sheet.setColumnWidth(2, 240);
  }
  return sheet;
}

function colIndex(key) {
  for (var i = 0; i < COLUMNS.length; i++) if (COLUMNS[i][0] === key) return i + 1;
  throw new Error('unknown column ' + key);
}

// Text starting with = + - @ would be run as a formula by Sheets; prefix with ' to keep it as plain text.
function safe(v) {
  var s = v == null ? '' : String(v).slice(0, 500);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Optional: run this once from the editor to create the header row and authorise the script.
function setup() {
  getSheet();
}
