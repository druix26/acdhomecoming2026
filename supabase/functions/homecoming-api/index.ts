import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
};
const encoder = new TextEncoder();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

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
    const fields = 'reference,full_name,batch_year,registration_type,total_attendees,status,submitted_at';
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
    const { error } = await supabase.from('registrations').update({ status: 'Confirmed' }).eq('id', Number(confirmationMatch[1]));
    return error ? json({ error: 'Could not confirm registration.' }, 502) : json({ success: true, status: 'Confirmed' });
  }

  if (path !== '/register' || request.method !== 'POST') return json({ error: 'Not found.' }, 404);
  try {
    const form = await request.formData(); const proof = form.get('proof');
    if (!(proof instanceof File) || !proof.size) return json({ error: 'Proof of payment is required.' }, 400);
    if (proof.size > 10 * 1024 * 1024) return json({ error: 'Proof of payment must be 10 MB or smaller.' }, 400);
    if (!['image/jpeg', 'image/png', 'application/pdf'].includes(proof.type)) return json({ error: 'Proof of payment must be a JPG, PNG, or PDF.' }, 400);
    const value = (name: string) => String(form.get(name) || '');
    const reference = `ACD26-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const proofPath = `${reference}/${Date.now()}-${proof.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const uploaded = await supabase.storage.from(bucket).upload(proofPath, proof, { contentType: proof.type, upsert: false });
    if (uploaded.error) throw uploaded.error;
    const registration = {
      reference, status: 'For Payment Verification', full_name: value('name'), batch_year: Number(value('batch')),
      mobile_number: value('phone'), email_address: value('email'), current_location: value('location') || null,
      registration_type: value('registrationType'), total_attendees: Number(value('attendees') || 1),
      guest_names: form.getAll('guestNames[]').map(String), payment_method: value('paymentMethod'), payment_name: value('paymentName'),
      amount_paid: Number(value('amountPaid').replace(/[^0-9.]/g, '')), payment_date: value('paymentDate') || null,
      transaction_reference: value('transactionNumber'), proof_path: proofPath, proof_file_name: proof.name,
      payment_declaration: form.has('declaration'), data_consent: form.has('dataConsent'),
    };
    const inserted = await supabase.from('registrations').insert(registration);
    if (inserted.error) { await supabase.storage.from(bucket).remove([proofPath]); throw inserted.error; }
    return json({ success: true, reference, status: registration.status });
  } catch (error) {
    console.error(error); return json({ error: 'We could not save your registration. Please try again.' }, 502);
  }
});
