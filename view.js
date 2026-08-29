const tableBody = document.querySelector('#registrants');
const empty = document.querySelector('#empty');
const summary = document.querySelector('#summary');
const search = document.querySelector('#search');
const statusFilter = document.querySelector('#status-filter');
let registrants = [];

function date(value) { return value ? new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium' }).format(new Date(value)) : '—'; }
function escapeHtml(value) { const div = document.createElement('div'); div.textContent = String(value ?? ''); return div.innerHTML; }

async function readApiResponse(response) {
  const text = await response.text();
  try { return JSON.parse(text); }
  catch { throw new Error(text.trimStart().startsWith('<') ? 'The registrants service is not deployed yet.' : 'The registrants service returned an invalid response.'); }
}

function render() {
  const query = search.value.toLowerCase().trim();
  const status = statusFilter.value;
  const rows = registrants.filter((row) => (!status || row.status === status) && (!query || [row.reference, row.full_name, row.batch_year].some((value) => String(value || '').toLowerCase().includes(query))));
  tableBody.innerHTML = rows.map((row) => `<tr><td><strong>${escapeHtml(row.reference)}</strong></td><td><strong>${escapeHtml(row.full_name)}</strong><small>Batch ${escapeHtml(row.batch_year)}</small></td><td>${escapeHtml(row.registration_type)}</td><td><strong>${escapeHtml(row.total_attendees)}</strong></td><td><span class="status ${row.status === 'Confirmed' ? 'confirmed' : ''}">${escapeHtml(row.status)}</span></td><td>${date(row.submitted_at)}</td></tr>`).join('');
  empty.hidden = rows.length > 0;
  summary.textContent = `${registrants.length} registration${registrants.length === 1 ? '' : 's'} · ${registrants.reduce((sum, row) => sum + Number(row.total_attendees || 0), 0)} attendees`;
}

async function loadRegistrants() {
  summary.textContent = 'Loading registrants…';
  try {
    const response = await fetch(`${window.ACD_API_BASE}/registrants`);
    const result = await readApiResponse(response);
    if (!response.ok) throw new Error(result.error || 'Could not load registrants.');
    registrants = result.registrants || [];
    render();
  } catch (error) {
    summary.textContent = error.message || 'Could not load registrants.';
  }
}

document.querySelector('#refresh').addEventListener('click', loadRegistrants);
search.addEventListener('input', render);
statusFilter.addEventListener('change', render);
loadRegistrants();
