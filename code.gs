const SS = SpreadsheetApp.getActiveSpreadsheet();
const SHEETS = {
  transaksi: SS.getSheetByName("tb_transaksi"),
  recurring: SS.getSheetByName("tb_recurring"),
  utang: SS.getSheetByName("tb_utang_piutang"),
  produk: SS.getSheetByName("tb_produk"),
  log_stok: SS.getSheetByName("tb_log_stok"),
  kategori: SS.getSheetByName("tb_kategori"),
};

function doPost(e) {
  let request;
  try {
    request = JSON.parse(e.postData.contents);
  } catch (err) {
    return createResponse({ status: "error", message: "Invalid JSON" });
  }

  const action = request.action;
  const data = request.data;

  try {
    let result;
    switch (action) {
      case "getInitialData":
        result = getAllData();
        break;
      case "addTransaction":
        result = addTransaction(data);
        break;
      case "mutateStock":
        result = mutateStock(data);
        break;
      case "updateDebt":
        result = updateDebt(data);
        break;
      case "manageCategory":
        result = manageCategory(data);
        break;
      default:
        throw new Error("Action " + action + " tidak ditemukan");
    }
    return createResponse({ status: "success", data: result });
  } catch (err) {
    return createResponse({ status: "error", message: err.toString() });
  }
}

function createResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

function getAllData() {
  const result = {};
  for (let key in SHEETS) {
    const sheet = SHEETS[key];
    if (!sheet) {
      result[key] = [];
      continue;
    }
    const values = sheet.getDataRange().getValues();
    const headers = values.shift();
    result[key] = values.map((row) => {
      let obj = {};
      headers.forEach((h, i) => (obj[h] = row[i]));
      return obj;
    });

    if (key === "transaksi") {
      result[key].sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));
    }
  }
  return result;
}

function addTransaction(d) {
  const id =
    "TX-" + Utilities.formatDate(new Date(), "GMT+7", "yyyyMMddHHmmss");
  SHEETS.transaksi.appendRow([
    id,
    d.tanggal,
    d.tipe,
    d.nominal,
    d.kategori,
    d.keterangan,
  ]);
  return { id };
}

function mutateStock(d) {
  const id = "LOG-" + Date.now();
  SHEETS.log_stok.appendRow([
    id,
    new Date(),
    d.id_produk,
    d.jenis,
    d.jumlah,
    d.keterangan,
  ]);

  const pSheet = SHEETS.produk;
  const pData = pSheet.getDataRange().getValues();
  for (let i = 1; i < pData.length; i++) {
    if (pData[i][0] == d.id_produk) {
      let currentStok = Number(pData[i][4]);
      let delta = Number(d.jumlah);
      let newStok =
        d.jenis === "Masuk" ? currentStok + delta : currentStok - delta;
      pSheet.getRange(i + 1, 5).setValue(newStok);
      break;
    }
  }
  return { id };
}

function updateDebt(d) {
  const sheet = SHEETS.utang;
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] == d.id_up) {
      const sisa = Number(d.sisa);
      sheet.getRange(i + 1, 5).setValue(sisa);
      sheet.getRange(i + 1, 7).setValue(sisa <= 0 ? "Lunas" : "Belum Lunas");
      break;
    }
  }
  return true;
}

function manageCategory(d) {
  const sheet = SHEETS.kategori;
  if (d.mode === "add") {
    const id = "KAT-" + Date.now();
    sheet.appendRow([id, d.nama, d.tipe]);
    return { id };
  } else if (d.mode === "delete") {
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === d.id) {
        sheet.deleteRow(i + 1);
        break;
      }
    }
  }
  return true;
}

function processRecurring() {
  const now = new Date();
  const sheet = SHEETS.recurring;
  if (!sheet) return;
  const data = sheet.getDataRange().getValues();
  const headers = data.shift();
  data.forEach((row, idx) => {
    const r = {};
    headers.forEach((h, i) => (r[h] = row[i]));
    const lastEx = r.terakhir_eksekusi ? new Date(r.terakhir_eksekusi) : null;
    if (
      !lastEx ||
      lastEx.getMonth() !== now.getMonth() ||
      lastEx.getFullYear() !== now.getFullYear()
    ) {
      addTransaction({
        tanggal: Utilities.formatDate(now, "GMT+7", "yyyy-MM-dd"),
        tipe: r.tipe,
        nominal: r.nominal,
        kategori: "Rutin: " + r.nama_rutin,
        keterangan: "Dijalankan otomatis oleh sistem",
      });
      sheet.getRange(idx + 2, 7).setValue(now);
    }
  });
}
