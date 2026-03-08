const { google } = require("googleapis");

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SHEET_HISTORY  = "Diet";
const SHEET_TODAY    = "Today";

function getAuth() {
  const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

async function getSheets() {
  const auth = await getAuth();
  return google.sheets({ version: "v4", auth });
}

async function getRows(sheets, sheetName) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A:M`,
  });
  return res.data.values || [];
}

function buildRow(data) {
  return [
    data.date        || "",
    data.kcal        || 0,
    data.kcal_target || 0,
    data.protein     || 0,
    data.carbs       || 0,
    data.fat         || 0,
    data.trained     ? "true" : "false",
    data.alcohol     || "No",
    data.breakfast   || "",
    data.lunch       || "",
    data.dinner      || "",
    data.snacks      || "",
    new Date().toISOString(),
  ];
}

function rowToObject(row) {
  return {
    date:        row[0],
    kcal:        Number(row[1]),
    kcal_target: Number(row[2]),
    protein:     Number(row[3]),
    carbs:       Number(row[4]),
    fat:         Number(row[5]),
    trained:     row[6] === "true",
    alcohol:     row[7],
    breakfast:   row[8],
    lunch:       row[9],
    dinner:      row[10],
    snacks:      row[11],
    updated_at:  row[12],
  };
}

async function saveToday(sheets, data) {
  const row = buildRow(data);
  const rows = await getRows(sheets, SHEET_TODAY);
  if (rows.length <= 1) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_TODAY}!A:M`,
      valueInputOption: "RAW",
      requestBody: { values: [row] },
    });
  } else {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_TODAY}!A2:M2`,
      valueInputOption: "RAW",
      requestBody: { values: [row] },
    });
  }
}

async function saveHistory(sheets, data) {
  const rows = await getRows(sheets, SHEET_HISTORY);
  let rowIndex = -1;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === data.date) { rowIndex = i + 1; break; }
  }
  const row = buildRow(data);
  if (rowIndex > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_HISTORY}!A${rowIndex}:M${rowIndex}`,
      valueInputOption: "RAW",
      requestBody: { values: [row] },
    });
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_HISTORY}!A:M`,
      valueInputOption: "RAW",
      requestBody: { values: [row] },
    });
  }
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const sheets = await getSheets();

    if (req.method === "POST") {
      const data = req.body;
      const type = data.type || "today";
      if (type === "close") {
        await saveHistory(sheets, data);
        await saveToday(sheets, data);
      } else {
        await saveToday(sheets, data);
      }
      return res.status(200).json({ success: true, type, date: data.date });
    }

    if (req.method === "GET") {
      const type = req.query.type || "today";
      if (type === "today") {
        const rows = await getRows(sheets, SHEET_TODAY);
        if (rows.length > 1) return res.status(200).json(rowToObject(rows[1]));
        return res.status(200).json({ error: "Sin datos hoy" });
      }
      if (type === "history") {
        const rows = await getRows(sheets, SHEET_HISTORY);
        const data = rows.slice(1).map(rowToObject);
        return res.status(200).json(data);
      }
      return res.status(400).json({ error: "type invalido" });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
