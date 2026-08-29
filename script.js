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
const submitButton = form.querySelector('.submit');
const feePerPerson = 1000;
let currentStep = 0;

const batchSelect = document.querySelector('#batch');
for (let year = 2026; year >= 1950; year -= 1) {
  batchSelect.add(new Option(String(year), String(year)));
}

function attendeeCount() {
  return Number(document.querySelector('#attendees').value || 1);
}

function updatePaymentSummary() {
  const count = attendeeCount();
  const amount = count * feePerPerson;
  document.querySelector('#attendee-label').textContent = count > 5 ? 'more than 5 attendees' : `${count} attendee${count === 1 ? '' : 's'}`;
  document.querySelector('#amount-due').textContent = count > 5 ? 'Contact committee' : `₱${amount.toLocaleString()}`;
  document.querySelector('#review-name').textContent = document.querySelector('#name').value || '—';
  document.querySelector('#review-attendees').textContent = count > 5 ? 'More than 5 attendees' : `${count} attendee${count === 1 ? '' : 's'}`;
  document.querySelector('#review-amount').textContent = count > 5 ? 'Fee confirmation required' : `₱${amount.toLocaleString()} due`;
}

function showStep(index) {
  currentStep = index;
  steps.forEach((step, position) => step.classList.toggle('active', position === index));
  progressItems.forEach((item, position) => {
    item.classList.toggle('active', position === index);
    item.classList.toggle('complete', position < index);
  });
  backButton.hidden = index === 0;
  nextButton.hidden = index === steps.length - 1;
  submitButton.hidden = index !== steps.length - 1;
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
  if (validateStep()) showStep(currentStep + 1);
});
backButton.addEventListener('click', () => showStep(currentStep - 1));
document.querySelector('#attendees').addEventListener('change', updatePaymentSummary);
document.querySelector('#proof').addEventListener('change', (event) => {
  const file = event.target.files[0];
  document.querySelector('#upload-title').textContent = file ? file.name : 'Choose receipt file';
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!validateStep()) return;
  const formData = new FormData(form);
  const file = formData.get('proof');
  const data = Object.fromEntries([...formData.entries()].filter(([key]) => key !== 'proof'));
  const reference = `ACD26-${Date.now().toString().slice(-6)}`;
  localStorage.setItem('acdHomecomingRegistration', JSON.stringify({ ...data, proofFileName: file.name, reference, status: 'For Payment Verification', registeredAt: new Date().toISOString() }));
  document.querySelector('#reference-number').textContent = reference;
  dialog.showModal();
  form.reset();
  document.querySelector('#upload-title').textContent = 'Choose receipt file';
  showStep(0);
});

document.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
document.querySelector('.dialog-done').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => {
  if (event.target === dialog) dialog.close();
});
