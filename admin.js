const loginView = document.querySelector('#login-view');
const dashboard = document.querySelector('#dashboard');
const loginForm = document.querySelector('#login-form');
const loginError = document.querySelector('#login-error');
const tableBody = document.querySelector('#registrations');
const empty = document.querySelector('#empty');
const summary = document.querySelector('#summary');
const search = document.querySelector('#search');
const statusFilter = document.querySelector('#status-filter');
let registrations = [];

function money(value) { return new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP',maximumFractionDigits:0}).format(value || 0); }
function date(value) { return value ? new Intl.DateTimeFormat('en-PH',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value)) : '—'; }
function escapeHtml(value) { const div=document.createElement('div'); div.textContent=String(value??''); return div.innerHTML; }

async function readApiResponse(response) {
  const responseText = await response.text();
  try {
    return JSON.parse(responseText);
  } catch {
    const returnedHtml = responseText.trimStart().startsWith('<');
    throw new Error(returnedHtml
      ? 'The admin API is not available on this deployment. Deploy the site with the Bun server instead of static hosting.'
      : 'The admin service returned an invalid response. Please try again.');
  }
}

function render() {
  const query = search.value.toLowerCase().trim();
  const status = statusFilter.value;
  const rows = registrations.filter((row) => (!status || row.status === status) && (!query || [row.reference,row.full_name,row.email_address,row.batch_year,row.transaction_reference].some((value) => String(value||'').toLowerCase().includes(query))));
  tableBody.innerHTML = rows.map((row) => `<tr><td><strong>${escapeHtml(row.reference)}</strong><small>Batch ${escapeHtml(row.batch_year)}</small></td><td><strong>${escapeHtml(row.full_name)}</strong><small>${escapeHtml(row.email_address)}</small><small>${escapeHtml(row.mobile_number)}</small></td><td><strong>${row.total_attendees} attendee${row.total_attendees===1?'':'s'}</strong><small>${escapeHtml((row.guest_names||[]).join(', ')||'No guests')}</small></td><td><strong>${money(row.amount_paid)}</strong><small>${escapeHtml(row.payment_method)}</small><small>${escapeHtml(row.transaction_reference)}</small></td><td><span class="status ${row.status==='Confirmed'?'confirmed':''}">${escapeHtml(row.status)}</span></td><td>${date(row.submitted_at)}</td><td>${row.receipt_url?`<a class="receipt" href="${escapeHtml(row.receipt_url)}" target="_blank" rel="noopener">View receipt ↗</a>`:'Unavailable'}</td></tr>`).join('');
  empty.hidden = rows.length > 0;
  summary.textContent = `${registrations.length} total registration${registrations.length===1?'':'s'} · ${registrations.reduce((sum,row)=>sum+Number(row.total_attendees||0),0)} attendees`;
}

async function loadRegistrations() {
  summary.textContent = 'Loading records…';
  try {
    const response = await fetch('/api/admin/registrations');
    if (response.status === 401) return showLogin();
    const result = await readApiResponse(response);
    if (!response.ok) throw new Error(result.error || 'Could not load registrations.');
    registrations = result.registrations || [];
    render();
  } catch (error) {
    summary.textContent = error.message || 'Could not load registrations.';
  }
}

function showLogin() { loginView.hidden=false; dashboard.hidden=true; }
function showDashboard() { loginView.hidden=true; dashboard.hidden=false; loadRegistrations(); }

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault(); loginError.textContent='';
  const button=loginForm.querySelector('button'); button.disabled=true; button.textContent='Signing in…';
  try { const response=await fetch('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:document.querySelector('#password').value})}); const result=await readApiResponse(response); if(!response.ok) throw new Error(result.error||'Could not sign in.'); loginForm.reset(); showDashboard(); } catch(error) { loginError.textContent=error.message; } finally { button.disabled=false; button.textContent='Sign in'; }
});
document.querySelector('#logout').addEventListener('click',async()=>{await fetch('/api/admin/logout',{method:'POST'});showLogin();});
document.querySelector('#refresh').addEventListener('click',loadRegistrations);
search.addEventListener('input',render); statusFilter.addEventListener('change',render);
fetch('/api/admin/session').then((response)=>response.ok?showDashboard():showLogin()).catch(showLogin);
