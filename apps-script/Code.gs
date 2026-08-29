const SPREADSHEET_ID = '171Je4O7KAU4aQsYsWNZJ_KvFadHS1eDZWPAVWblxlTc';
const SHEET_NAME = 'Sheet1';
const PROOF_FOLDER_NAME = 'ACD Homecoming 2026 Payment Proofs';
const HEADERS = [
  'Submitted At', 'Registration Reference', 'Status', 'Full Name',
  'Batch / Graduation Year', 'Mobile Number', 'Email Address', 'Current City / Country',
  'Registration Type', 'Total Attendees', 'Guest Names', 'Payment Method', 'Name Used for Payment',
  'Amount Paid', 'Payment Date', 'Transaction / Reference Number', 'Proof of Payment Link',
  'Proof File Name', 'Registration & Payment Declaration', 'Data Consent'
];

function setup() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error(`Sheet tab "${SHEET_NAME}" was not found.`);
  if (!sheet.getRange(1, 1).getValue()) {
    const headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
    headerRange.setValues([HEADERS]);
    headerRange.setBackground('#063F78').setFontColor('#FFFFFF').setFontWeight('bold').setWrap(true);
    sheet.setFrozenRows(1);
    sheet.setRowHeight(1, 48);
    sheet.setColumnWidths(1, HEADERS.length, 150);
    sheet.setColumnWidth(11, 230);
    sheet.setColumnWidth(17, 260);
  }
  getProofFolder_();
}

function doPost(event) {
  try {
    const payload = JSON.parse(event.postData.contents);
    const expectedSecret = PropertiesService.getScriptProperties().getProperty('REGISTRATION_API_SECRET');
    if (!expectedSecret || payload.secret !== expectedSecret) throw new Error('Unauthorized request.');
    const fields = payload.fields || {};
    const proof = payload.proof || {};
    if (!proof.base64 || !proof.name || !proof.type) throw new Error('Proof of payment is required.');

    const folder = getProofFolder_();
    const reference = `ACD26-${Utilities.getUuid().slice(0, 8).toUpperCase()}`;
    const safeName = String(proof.name).replace(/[^a-zA-Z0-9._-]/g, '_');
    const blob = Utilities.newBlob(Utilities.base64Decode(proof.base64), proof.type, `${reference}-${safeName}`);
    const file = folder.createFile(blob);
    const proofLink = file.getUrl();
    const status = 'For Payment Verification';

    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
    if (!sheet.getRange(1, 1).getValue()) setup();
    sheet.appendRow([
      new Date(), reference, status, fields.name || '', fields.batch || '', fields.phone || '',
      fields.email || '', fields.location || '', fields.registrationType || '', fields.attendees || '',
      (fields.guestNames || []).join('\n'), fields.paymentMethod || '', fields.paymentName || '',
      fields.amountPaid || '', fields.paymentDate || '', fields.transactionNumber || '', proofLink,
      proof.name, fields.declaration ? 'Confirmed' : '', fields.dataConsent ? 'Consented' : ''
    ]);

    return json_({ success: true, reference, status, proofLink });
  } catch (error) {
    return json_({ success: false, error: error.message });
  }
}

function getProofFolder_() {
  const properties = PropertiesService.getScriptProperties();
  const storedId = properties.getProperty('PROOF_FOLDER_ID');
  if (storedId) {
    try { return DriveApp.getFolderById(storedId); } catch (error) { /* recreate below */ }
  }
  const matching = DriveApp.getFoldersByName(PROOF_FOLDER_NAME);
  const folder = matching.hasNext() ? matching.next() : DriveApp.createFolder(PROOF_FOLDER_NAME);
  properties.setProperty('PROOF_FOLDER_ID', folder.getId());
  return folder;
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
