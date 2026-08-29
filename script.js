const target = new Date('2026-12-12T18:00:00+08:00');
const countdown = document.querySelector('#countdown');

function updateCountdown() {
  const remaining = Math.max(0, target - new Date());
  const days = Math.floor(remaining / 86400000);
  const hours = Math.floor((remaining % 86400000) / 3600000);
  const minutes = Math.floor((remaining % 3600000) / 60000);
  countdown.innerHTML = `<strong>${String(days).padStart(2, '0')}</strong><span>days</span><strong>${String(hours).padStart(2, '0')}</strong><span>hours</span><strong>${String(minutes).padStart(2, '0')}</strong><span>minutes</span>`;
}

updateCountdown();
setInterval(updateCountdown, 60000);

const menuButton = document.querySelector('.menu-button');
const nav = document.querySelector('nav');
menuButton.addEventListener('click', () => {
  const isOpen = nav.classList.toggle('open');
  menuButton.setAttribute('aria-expanded', isOpen);
});
nav.addEventListener('click', () => {
  nav.classList.remove('open');
  menuButton.setAttribute('aria-expanded', 'false');
});

const form = document.querySelector('#registration-form');
const dialog = document.querySelector('#success-dialog');
const steps = [...form.querySelectorAll('.form-step')];
const progressItems = [...form.querySelectorAll('.form-progress li')];
const nextButton = form.querySelector('.next-button');
const backButton = form.querySelector('.back-button');
const submitButton = nextButton;
const feePerPerson = 600;
let currentStep = 0;

const batchSelect = document.querySelector('#batch');
for (let year = 2026; year >= 1950; year -= 1) {
  batchSelect.add(new Option(String(year), String(year)));
}

function attendeeCount() {
  const selected = document.querySelector('#attendees').value;
  if (selected === '6') return 1 + document.querySelectorAll('.guest-row').length;
  return Number(selected || 1);
}

const guestRows = document.querySelector('#guest-rows');
const addGuestButton = document.querySelector('#add-guest');
const attendeeSelect = document.querySelector('#attendees');

function guestRow(name = '') {
  const row = document.createElement('div');
  row.className = 'guest-row';
  row.innerHTML = `<span></span><input name="guestNames[]" aria-label="Guest full name" placeholder="Guest full name" value="${name.replaceAll('"', '&quot;')}" required /><button class="remove-guest" type="button" aria-label="Remove guest">×</button>`;
  row.querySelector('.remove-guest').addEventListener('click', () => {
    row.remove();
    renumberGuests();
    updatePaymentSummary();
  });
  return row;
}

function renumberGuests() {
  const rows = [...guestRows.querySelectorAll('.guest-row')];
  const canRemove = document.querySelector('#attendees').value === '6';
  rows.forEach((row, index) => {
    row.querySelector('span').textContent = index + 1;
    row.querySelector('input').setAttribute('aria-label', `Guest ${index + 1} full name`);
    row.querySelector('.remove-guest').hidden = !canRemove;
  });
  if (!rows.length) guestRows.innerHTML = '<p class="empty-guests">No guest names needed for an alumni-only registration.</p>';
}

function syncGuestRows() {
  const selected = document.querySelector('#attendees').value;
  const desired = selected ? Math.max(0, Number(selected) - 1) : 0;
  const current = [...guestRows.querySelectorAll('.guest-row')];
  if (!selected) {
    guestRows.innerHTML = '<p class="empty-guests">Select the total number of attendees to add guest names.</p>';
  } else {
    guestRows.querySelector('.empty-guests')?.remove();
    for (let index = current.length; index < desired; index += 1) guestRows.append(guestRow());
    [...guestRows.querySelectorAll('.guest-row')].slice(desired).forEach((row) => row.remove());
    renumberGuests();
  }
  addGuestButton.hidden = selected !== '6';
}

function syncRegistrationType() {
  const type = form.querySelector('input[name="registrationType"]:checked')?.value;
  if (type === 'Alumni Only') {
    attendeeSelect.value = '1';
    attendeeSelect.disabled = true;
  } else if (type === 'Alumni + Spouse/Guest') {
    attendeeSelect.value = '2';
    attendeeSelect.disabled = true;
  } else {
    attendeeSelect.disabled = false;
    attendeeSelect.value = '';
  }
  syncGuestRows();
  updatePaymentSummary();
}

function updatePaymentSummary() {
  const count = attendeeCount();
  const amount = count * feePerPerson;
  document.querySelector('#attendee-label').textContent = `${count} attendee${count === 1 ? '' : 's'}`;
  document.querySelector('#amount-due').textContent = `₱${amount.toLocaleString()}`;
  document.querySelector('#review-name').textContent = document.querySelector('#name').value || '—';
  document.querySelector('#review-attendees').textContent = `${count} attendee${count === 1 ? '' : 's'}`;
  document.querySelector('#review-amount').textContent = `₱${amount.toLocaleString()} due`;
}

function showStep(index) {
  currentStep = index;
  steps.forEach((step, position) => step.classList.toggle('active', position === index));
  progressItems.forEach((item, position) => {
    item.classList.toggle('active', position === index);
    item.classList.toggle('complete', position < index);
  });
  backButton.hidden = index === 0;
  nextButton.innerHTML = index === steps.length - 1 ? 'Submit registration <span>↗</span>' : 'Next step <span>→</span>';
  if (index >= 2) updatePaymentSummary();
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function validateStep() {
  const fields = [...steps[currentStep].querySelectorAll('input, select, textarea')];
  const invalid = fields.find((field) => !field.checkValidity());
  if (invalid) {
    invalid.reportValidity();
    invalid.focus();
    return false;
  }
  return true;
}

nextButton.addEventListener('click', () => {
  if (!validateStep()) return;
  if (currentStep === steps.length - 1) form.requestSubmit();
  else showStep(currentStep + 1);
});
backButton.addEventListener('click', () => showStep(currentStep - 1));
attendeeSelect.addEventListener('change', () => {
  syncGuestRows();
  updatePaymentSummary();
});
form.querySelectorAll('input[name="registrationType"]').forEach((input) => input.addEventListener('change', syncRegistrationType));
addGuestButton.addEventListener('click', () => {
  guestRows.querySelector('.empty-guests')?.remove();
  guestRows.append(guestRow());
  renumberGuests();
  updatePaymentSummary();
});
document.querySelector('#proof').addEventListener('change', (event) => {
  const file = event.target.files[0];
  document.querySelector('#upload-title').textContent = file ? file.name : 'Choose receipt file';
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!validateStep()) return;
  const formData = new FormData(form);
  formData.set('attendees', String(attendeeCount()));
  const originalText = submitButton.innerHTML;
  submitButton.disabled = true;
  submitButton.textContent = 'Saving registration…';
  form.querySelector('.submission-error')?.remove();
  try {
    const response = await fetch('/api/register', { method: 'POST', body: formData });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.error || 'Submission failed.');
    localStorage.setItem('acdHomecomingRegistration', JSON.stringify({ reference: result.reference, status: result.status, submittedAt: new Date().toISOString() }));
    document.querySelector('#reference-number').textContent = result.reference;
    dialog.showModal();
    form.reset();
    attendeeSelect.disabled = false;
    attendeeSelect.value = '';
    syncGuestRows();
    document.querySelector('#upload-title').textContent = 'Choose receipt file';
    showStep(0);
  } catch (error) {
    const message = document.createElement('p');
    message.className = 'submission-error full';
    message.setAttribute('role', 'alert');
    message.textContent = error.message || 'We could not save your registration. Please try again.';
    form.querySelector('.form-actions').before(message);
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = originalText;
  }
});

document.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
document.querySelector('.dialog-done').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => {
  if (event.target === dialog) dialog.close();
});
