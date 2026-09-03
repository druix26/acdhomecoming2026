import { createClient } from 'npm:@supabase/supabase-js@2';
import { Resend } from 'npm:resend@6.25.0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
};
const encoder = new TextEncoder();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const escapeHtml = (value: unknown) => String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]!);

const registrationFeePerPerson = (now = new Date()) => now >= new Date('2026-11-11T00:00:00+08:00') ? 700 : 600;

async function sendRegistrationConfirmation(registration: Record<string, unknown>) {
  const apiKey = Deno.env.get('RESEND_API_KEY'); const from = Deno.env.get('RESEND_FROM_EMAIL');
  if (!apiKey || !from) { console.warn('Confirmation email skipped: Resend is not configured.'); return false; }
  const senderEmail = from.match(/<([^<>]+)>/)?.[1]?.trim() || from.trim();
  const senderDomain = senderEmail.split('@')[1];
  if (!senderDomain) throw new Error('RESEND_FROM_EMAIL must contain a valid email address.');
  const attendeeCount = Number(registration.total_attendees || 1);
  const amount = Number(registration.amount_paid || 0).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
  const guests = Array.isArray(registration.guest_names) && registration.guest_names.length ? registration.guest_names.join(', ') : 'None';
  const details = [
    ['Confirmation code', registration.reference], ['Status', registration.status], ['Full name', registration.full_name],
    ['Batch / graduation year', registration.batch_year], ['Mobile number', registration.mobile_number], ['Email address', registration.email_address],
    ['Current city / country', registration.current_location || 'Not provided'], ['Registration type', registration.registration_type],
    ['Total attendees', attendeeCount], ['Guest names', guests], ['Payment method', registration.payment_method],
    ['Name used for payment', registration.payment_name], ['Amount paid', amount], ['Date of payment', registration.payment_date],
    ['Transaction / reference number', registration.transaction_reference],
    ['Proof of payment', registration.proof_file_name ? `Received (${registration.proof_file_name})` : 'Received'],
  ];
  const textDetails = details.map(([label, value]) => `${label}: ${String(value || '—')}`).join('\n');
  const htmlDetails = details.map(([label, value]) => `<tr><td style="padding:7px 12px;color:#667085;border-bottom:1px solid #e5e7eb">${escapeHtml(label)}</td><td style="padding:7px 12px;font-weight:600;border-bottom:1px solid #e5e7eb">${escapeHtml(value || '—')}</td></tr>`).join('');
  const payload: Record<string, unknown> = {
    from: `ACD Admin <no-reply@${senderDomain}>`, to: [registration.email_address], subject: 'ACD Payment Successful',
    text: `Hello ${registration.full_name},\n\nWe received your ACD Grand Alumni Homecoming 2026 registration and proof of payment.\n\n${textDetails}\n\nYour registration will be confirmed after the Homecoming Committee verifies your payment. Keep this email and confirmation code for your records.\n\nSama-Sama Tayo — ACD Grand Alumni Homecoming 2026`,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#17213b;max-width:640px;margin:auto"><h1 style="font-size:28px">Registration received</h1><p>Hello ${escapeHtml(registration.full_name)},</p><p>We received your registration and proof of payment for the <strong>ACD Grand Alumni Homecoming 2026</strong>.</p><div style="background:#eef4ff;border:1px solid #c7d7fe;padding:18px 20px;border-radius:8px;margin:22px 0"><span style="font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#475467">Confirmation code</span><strong style="display:block;font-size:24px;letter-spacing:.08em;color:#1e3a8a">${escapeHtml(registration.reference)}</strong></div><table role="presentation" style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e5e7eb">${htmlDetails}</table><p style="margin-top:22px">Your registration will be <strong>confirmed</strong> after the Homecoming Committee verifies your payment. Keep this email and confirmation code for your records.</p><p><strong>Sama-Sama Tayo</strong><br>ACD Grand Alumni Homecoming 2026</p></div>`,
  };
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send(payload as Parameters<typeof resend.emails.send>[0], { idempotencyKey: `registration-${registration.reference}` });
  if (error) throw new Error(`Confirmation email failed: ${error.message}`);
  return true;
}

async function sendConfirmedRegistrationEmail(registration: Record<string, unknown>) {
  const apiKey = Deno.env.get('RESEND_API_KEY'); const from = Deno.env.get('RESEND_FROM_EMAIL');
  if (!apiKey || !from) throw new Error('Resend is not configured.');
  const senderEmail = from.match(/<([^<>]+)>/)?.[1]?.trim() || from.trim();
  const senderDomain = senderEmail.split('@')[1];
  if (!senderDomain) throw new Error('RESEND_FROM_EMAIL must contain a valid email address.');
  const guests = Array.isArray(registration.guest_names) && registration.guest_names.length ? registration.guest_names.map(String) : [];
  const guestText = guests.length ? guests.map((guest) => `- ${guest}`).join('\n') : '- No guests';
  const guestHtml = guests.length ? guests.map((guest) => `<tr><td style="padding:9px 0;border-bottom:1px solid #d9dde5;font-size:18px;color:#17213b">&#10003;&nbsp;&nbsp;${escapeHtml(guest)}</td></tr>`).join('') : '<tr><td style="padding:9px 0;font-size:18px;color:#667085">No guests listed</td></tr>';
  const welcomeText = guests.length ? "We can't wait to welcome you and your guests for an unforgettable evening of stories, laughter, and reconnection." : "We can't wait to welcome you for an unforgettable evening of stories, laughter, and reconnection.";
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: `ACD Admin <no-reply@${senderDomain}>`, to: [String(registration.email_address)], subject: 'ACD Registration Confirmed',
    text: `Hi ${registration.full_name},\n\nGreat news—your registration for the ACD Grand Alumni Homecoming 2026 is confirmed!\n\nConfirmation ID: ${registration.reference}\nEvent date: December 12, 2026\nGuests:\n${guestText}\n\nSee you at the event! ${welcomeText}\n\nSama-Sama Tayo,\nACD Grand Alumni Homecoming 2026`,
    html: `<div style="margin:0;padding:24px 10px;background:#f6f4f0;font-family:Inter,Avenir,'Helvetica Neue',Arial,sans-serif;color:#17213b"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #d9dde5;border-radius:8px;overflow:hidden"><tr><td style="height:8px;background:#d6a84b;font-size:0">&nbsp;</td></tr><tr><td style="padding:28px 36px 22px;text-align:center;background:#ffffff"><img src="https://acdhomecoming2026.com/public/assets/sama-sama-tayo-event-logo.jpg" width="300" alt="Sama-Sama Tayo — ACD Grand Alumni Homecoming 2026" style="display:block;width:100%;max-width:300px;height:auto;margin:0 auto;border:0"></td></tr><tr><td style="padding:38px 42px;background:#1d2754;text-align:center"><div style="font-size:13px;line-height:1.4;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#d6a84b">You're officially on the guest list</div><h1 style="margin:10px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:40px;line-height:1.12;font-weight:500;color:#ffffff">Registration confirmed!</h1></td></tr><tr><td style="padding:38px 42px;font-size:18px;line-height:1.7;color:#17213b"><p style="margin:0 0 20px;font-size:22px;line-height:1.4;font-weight:700;color:#17213b">Hi ${escapeHtml(registration.full_name)},</p><p style="margin:0 0 26px">Great news—your registration for the <strong>ACD Grand Alumni Homecoming 2026</strong> is confirmed. Get ready to come home, reconnect, and celebrate the memories that bring us all together.</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 28px;background:#f6f4f0;border-left:5px solid #c86b3c"><tr><td style="padding:20px 22px"><div style="font-size:12px;line-height:1.4;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#667085">Confirmation ID</div><div style="margin-top:3px;font-size:27px;line-height:1.3;font-weight:800;letter-spacing:1px;color:#364b7a">${escapeHtml(registration.reference)}</div><div style="margin-top:14px;font-size:18px;line-height:1.5;color:#17213b"><strong>Event date:</strong> December 12, 2026</div></td></tr></table><div style="margin-bottom:10px;font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.3;color:#17213b">Your guest list</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:30px">${guestHtml}</table><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#364b7a"><tr><td style="padding:28px 26px;text-align:center;color:#ffffff"><div style="font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:1.25;color:#ffffff">See you at the event!</div><p style="margin:10px 0 0;font-size:18px;line-height:1.65;color:#ffffff">${welcomeText} Come ready to make new memories—<strong style="color:#d6a84b">Sama-Sama Tayo!</strong></p></td></tr></table><p style="margin:30px 0 0;font-size:18px;line-height:1.6">Warmly,<br><strong>ACD Grand Alumni Homecoming 2026 Committee</strong></p></td></tr><tr><td style="padding:20px 30px;background:#eef1f6;text-align:center;font-size:14px;line-height:1.5;color:#667085">December 12, 2026 &nbsp;&bull;&nbsp; Assumption College of Davao</td></tr></table></div>`,
  }, { idempotencyKey: `confirmed-${registration.reference}` });
  if (error) throw new Error(`Confirmed-registration email failed: ${error.message}`);
  return true;
}

function safeEqual(left: string, right: string) {
  const a = encoder.encode(left); const b = encoder.encode(right);
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

async function adminToken() {
  const secret = Deno.env.get('ADMIN_SESSION_SECRET');
  if (!secret) return null;
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode('acd-homecoming-admin'));
  return btoa(String.fromCharCode(...new Uint8Array(signature))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
  const path = new URL(request.url).pathname.split('/homecoming-api')[1] || '/';
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const bucket = Deno.env.get('SUPABASE_PROOF_BUCKET') || 'payment-proofs';
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  if (path === '/registrants' && request.method === 'GET') {
    const fields = 'reference,full_name,batch_year,registration_type,total_attendees,guest_names,status,submitted_at';
    const { data, error } = await supabase.from('registrations').select(fields).order('submitted_at', { ascending: false }).limit(500);
    return error ? json({ error: 'Could not load registrants.' }, 502) : json({ registrants: data || [] });
  }

  if (path === '/admin/login' && request.method === 'POST') {
    const password = Deno.env.get('ADMIN_PASSWORD'); const token = await adminToken();
    if (!password || !token) return json({ error: 'Admin access is not configured.' }, 503);
    const body = await request.json().catch(() => ({}));
    return safeEqual(String(body.password || ''), password) ? json({ success: true, token }) : json({ error: 'Incorrect password.' }, 401);
  }

  if (path === '/admin/registrations') {
    const expected = await adminToken();
    const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
    if (!expected || !safeEqual(supplied, expected)) return json({ error: 'Unauthorized.' }, 401);
    const { data, error } = await supabase.from('registrations').select('*').order('submitted_at', { ascending: false }).limit(500);
    if (error) return json({ error: 'Could not load registrations.' }, 502);
    const registrations = await Promise.all((data || []).map(async (row) => {
      if (!row.proof_path) return row;
      const { data: signed } = await supabase.storage.from(bucket).createSignedUrl(row.proof_path, 900);
      return { ...row, receipt_url: signed?.signedUrl || null };
    }));
    return json({ registrations });
  }

  const confirmationMatch = path.match(/^\/admin\/registrations\/(\d+)\/confirm$/);
  if (confirmationMatch && request.method === 'PATCH') {
    const expected = await adminToken();
    const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
    if (!expected || !safeEqual(supplied, expected)) return json({ error: 'Unauthorized.' }, 401);
    const id = Number(confirmationMatch[1]);
    const current = await supabase.from('registrations').select('*').eq('id', id).single();
    if (current.error || !current.data) return json({ error: 'Could not load registration.' }, current.error?.code === 'PGRST116' ? 404 : 502);
    const previousStatus = current.data.status;
    const updated = await supabase.from('registrations').update({ status: 'Confirmed' }).eq('id', id);
    if (updated.error) return json({ error: 'Could not confirm registration.' }, 502);
    try {
      await sendConfirmedRegistrationEmail({ ...current.data, status: 'Confirmed' });
      return json({ success: true, status: 'Confirmed', emailSent: true });
    } catch (error) {
      await supabase.from('registrations').update({ status: previousStatus }).eq('id', id);
      console.error(error); return json({ error: 'Could not send the confirmation email. Registration was not confirmed.' }, 502);
    }
  }

  if (path === '/check-transaction-reference' && request.method === 'POST') {
    try {
      const body = await request.json();
      const transactionReference = String(body.transactionNumber || '').trim().toUpperCase();
      if (!transactionReference) return json({ error: 'Transaction / reference number is required.' }, 400);
      const duplicate = await supabase.from('registrations').select('id').eq('transaction_reference', transactionReference).limit(1);
      if (duplicate.error) throw duplicate.error;
      return json({ duplicate: Boolean(duplicate.data?.length) });
    } catch (error) {
      console.error(error); return json({ error: 'Could not validate the transaction reference. Please try again.' }, 502);
    }
  }

  if (path !== '/register' || request.method !== 'POST') return json({ error: 'Not found.' }, 404);
  try {
    const form = await request.formData(); const proof = form.get('proof');
    if (!(proof instanceof File) || !proof.size) return json({ error: 'Proof of payment is required.' }, 400);
    if (proof.size > 10 * 1024 * 1024) return json({ error: 'Proof of payment must be 10 MB or smaller.' }, 400);
    if (!['image/jpeg', 'image/png', 'application/pdf'].includes(proof.type)) return json({ error: 'Proof of payment must be a JPG, PNG, or PDF.' }, 400);
    const value = (name: string) => String(form.get(name) || '');
    const transactionReference = value('transactionNumber').trim().toUpperCase();
    if (!transactionReference) return json({ error: 'Transaction / reference number is required.' }, 400);
    const duplicate = await supabase.from('registrations').select('id').eq('transaction_reference', transactionReference).limit(1);
    if (duplicate.error) throw duplicate.error;
    if (duplicate.data?.length) return json({ error: 'This transaction / reference number has already been used.' }, 409);
    const reference = `ACD26-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const proofPath = `${reference}/${Date.now()}-${proof.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const uploaded = await supabase.storage.from(bucket).upload(proofPath, proof, { contentType: proof.type, upsert: false });
    if (uploaded.error) throw uploaded.error;
    const totalAttendees = Math.max(1, Number(value('attendees') || 1));
    const registration = {
      reference, status: 'For Payment Verification', full_name: value('name'), batch_year: Number(value('batch')),
      mobile_number: value('phone'), email_address: value('email'), current_location: value('location') || null,
      registration_type: value('registrationType'), total_attendees: totalAttendees,
      guest_names: form.getAll('guestNames[]').map(String), payment_method: value('paymentMethod'), payment_name: value('paymentName'),
      amount_paid: registrationFeePerPerson() * totalAttendees, payment_date: value('paymentDate') || null,
      transaction_reference: transactionReference, proof_path: proofPath, proof_file_name: proof.name,
      payment_declaration: form.has('declaration'), data_consent: form.has('dataConsent'),
    };
    const inserted = await supabase.from('registrations').insert(registration);
    if (inserted.error) {
      await supabase.storage.from(bucket).remove([proofPath]);
      if (inserted.error.code === '23505') return json({ error: 'This transaction / reference number has already been used.' }, 409);
      throw inserted.error;
    }
    let emailSent = false;
    try { emailSent = await sendRegistrationConfirmation(registration); }
    catch (emailError) { console.error('Registration saved, but confirmation email failed:', emailError); }
    return json({ success: true, reference, status: registration.status, emailSent });
  } catch (error) {
    console.error(error); return json({ error: 'We could not save your registration. Please try again.' }, 502);
  }
});
