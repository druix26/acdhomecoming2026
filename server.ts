const root = import.meta.dir;
const encoder = new TextEncoder();
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
};

function withCors(response: Response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders)) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function supabaseConfig() {
  return {
    url: Bun.env.SUPABASE_URL?.replace(/\/$/, ""),
    key: Bun.env.SUPABASE_SERVICE_ROLE_KEY,
    bucket: Bun.env.SUPABASE_PROOF_BUCKET || "payment-proofs",
  };
}

function escapeHtml(value: unknown) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]!);
}

async function sendRegistrationConfirmation(registration: Record<string, unknown>) {
  const apiKey = Bun.env.RESEND_API_KEY;
  const from = Bun.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    console.warn("Confirmation email skipped: RESEND_API_KEY or RESEND_FROM_EMAIL is not configured.");
    return false;
  }
  const replyTo = Bun.env.RESEND_REPLY_TO_EMAIL;
  const attendeeCount = Number(registration.total_attendees || 1);
  const amount = Number(registration.amount_paid || 0).toLocaleString("en-PH", { style: "currency", currency: "PHP" });
  const payload: Record<string, unknown> = {
    from,
    to: [registration.email_address],
    subject: `Registration received — ${registration.reference}`,
    text: `Hello ${registration.full_name},\n\nWe received your ACD Grand Alumni Homecoming 2026 registration.\n\nRegistration reference: ${registration.reference}\nStatus: ${registration.status}\nAttendees: ${attendeeCount}\nAmount paid: ${amount}\n\nYour registration will be confirmed after the Homecoming Committee verifies your payment. Please keep this email and your payment receipt.\n\nSama-Sama Tayo — ACD Grand Alumni Homecoming 2026`,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#17213b;max-width:600px"><h1 style="font-size:28px">Registration received</h1><p>Hello ${escapeHtml(registration.full_name)},</p><p>We received your registration for the <strong>ACD Grand Alumni Homecoming 2026</strong>.</p><div style="background:#f6f4f0;padding:20px;border-radius:6px"><p><strong>Registration reference:</strong> ${escapeHtml(registration.reference)}</p><p><strong>Status:</strong> ${escapeHtml(registration.status)}</p><p><strong>Attendees:</strong> ${attendeeCount}</p><p><strong>Amount paid:</strong> ${escapeHtml(amount)}</p></div><p>Your registration will be confirmed after the Homecoming Committee verifies your payment. Please keep this email and your payment receipt.</p><p><strong>Sama-Sama Tayo</strong><br>ACD Grand Alumni Homecoming 2026</p></div>`,
  };
  if (replyTo) payload.reply_to = replyTo;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `registration-${registration.reference}`, "User-Agent": "acd-homecoming-2026/1.0" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Confirmation email failed (${response.status}): ${await response.text()}`);
  return true;
}

function safeEqual(left: string, right: string) {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

async function adminToken() {
  const secret = Bun.env.ADMIN_SESSION_SECRET;
  if (!secret) return null;
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode("acd-homecoming-admin"));
  return Buffer.from(signature).toString("base64url");
}

async function isAdmin(request: Request) {
  const expected = await adminToken();
  if (!expected) return false;
  const authorization = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (authorization && safeEqual(authorization, expected)) return true;
  const cookie = request.headers.get("cookie") || "";
  const token = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("acd_admin="))?.slice(10) || "";
  return safeEqual(token, expected);
}

async function handleAdminApi(request: Request, url: URL) {
  if (url.pathname === "/api/admin/login") {
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
    const configuredPassword = Bun.env.ADMIN_PASSWORD;
    const token = await adminToken();
    if (!configuredPassword || !token) return Response.json({ error: "Admin access is not configured." }, { status: 503 });
    const body = await request.json().catch(() => ({}));
    if (!safeEqual(String(body.password || ""), configuredPassword)) return Response.json({ error: "Incorrect password." }, { status: 401 });
    const secure = url.protocol === "https:" ? "; Secure" : "";
    return new Response(JSON.stringify({ success: true, token }), {
      headers: { "Content-Type": "application/json", "Set-Cookie": `acd_admin=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${secure}` },
    });
  }

  if (url.pathname === "/api/admin/logout") {
    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json", "Set-Cookie": "acd_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0" },
    });
  }

  if (!(await isAdmin(request))) return Response.json({ error: "Unauthorized." }, { status: 401 });
  if (url.pathname === "/api/admin/session") return Response.json({ authenticated: true });

  if (url.pathname === "/api/admin/registrations") {
    const { url: supabaseUrl, key, bucket } = supabaseConfig();
    if (!supabaseUrl || !key) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
    const headers = { apikey: key, Authorization: `Bearer ${key}` };
    const response = await fetch(`${supabaseUrl}/rest/v1/registrations?select=*&order=submitted_at.desc&limit=500`, { headers });
    if (!response.ok) return Response.json({ error: "Could not load registrations." }, { status: 502 });
    const rows = await response.json();
    const registrations = await Promise.all(rows.map(async (row: Record<string, unknown>) => {
      if (!row.proof_path) return row;
      const signed = await fetch(`${supabaseUrl}/storage/v1/object/sign/${bucket}/${row.proof_path}`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ expiresIn: 900 }),
      });
      const signedData = signed.ok ? await signed.json() : null;
      const signedPath = signedData?.signedURL || signedData?.signedUrl;
      return { ...row, receipt_url: signedPath ? `${supabaseUrl}/storage/v1${signedPath}` : null };
    }));
    return Response.json({ registrations });
  }

  const confirmationMatch = url.pathname.match(/^\/api\/admin\/registrations\/(\d+)\/confirm$/);
  if (confirmationMatch && request.method === "PATCH") {
    const { url: supabaseUrl, key } = supabaseConfig();
    if (!supabaseUrl || !key) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
    const response = await fetch(`${supabaseUrl}/rest/v1/registrations?id=eq.${confirmationMatch[1]}`, {
      method: "PATCH",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ status: "Confirmed" }),
    });
    if (!response.ok) return Response.json({ error: "Could not confirm registration." }, { status: 502 });
    return Response.json({ success: true, status: "Confirmed" });
  }

  return new Response("Not found", { status: 404 });
}

async function submitRegistration(request: Request) {
  const { url: supabaseUrl, key: serviceRoleKey, bucket } = supabaseConfig();
  if (!supabaseUrl || !serviceRoleKey) {
    return Response.json({ error: "Registration storage is not configured." }, { status: 503 });
  }

  try {
    const form = await request.formData();
    const proof = form.get("proof");
    if (!(proof instanceof File) || !proof.size) {
      return Response.json({ error: "Proof of payment is required." }, { status: 400 });
    }
    if (proof.size > 10 * 1024 * 1024) {
      return Response.json({ error: "Proof of payment must be 10 MB or smaller." }, { status: 400 });
    }
    const acceptedTypes = ["image/jpeg", "image/png", "application/pdf"];
    if (!acceptedTypes.includes(proof.type)) {
      return Response.json({ error: "Proof of payment must be a JPG, PNG, or PDF." }, { status: 400 });
    }

    const fields: Record<string, string | string[]> = {};
    for (const [key, value] of form.entries()) {
      if (key === "proof") continue;
      const normalizedKey = key === "guestNames[]" ? "guestNames" : key;
      if (normalizedKey === "guestNames") {
        const existing = fields.guestNames;
        fields.guestNames = [...(Array.isArray(existing) ? existing : []), String(value)];
      } else {
        fields[normalizedKey] = String(value);
      }
    }

    const reference = `ACD26-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const safeName = proof.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const proofPath = `${reference}/${Date.now()}-${safeName}`;
    const supabaseHeaders = {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    };

    const transactionReference = String(fields.transactionNumber || "").trim().toUpperCase();
    if (!transactionReference) {
      return Response.json({ error: "Transaction / reference number is required." }, { status: 400 });
    }
    const duplicateResponse = await fetch(
      `${supabaseUrl}/rest/v1/registrations?select=id&transaction_reference=eq.${encodeURIComponent(transactionReference)}&limit=1`,
      { headers: supabaseHeaders },
    );
    if (!duplicateResponse.ok) throw new Error("Could not validate the transaction reference.");
    if ((await duplicateResponse.json()).length) {
      return Response.json({ error: "This transaction / reference number has already been used." }, { status: 409 });
    }

    const uploadResponse = await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${proofPath}`, {
      method: "POST",
      headers: { ...supabaseHeaders, "Content-Type": proof.type, "x-upsert": "false" },
      body: proof,
    });
    if (!uploadResponse.ok) {
      const detail = await uploadResponse.text();
      throw new Error(`Supabase receipt upload failed (${uploadResponse.status}): ${detail}`);
    }

    const guestNames = Array.isArray(fields.guestNames) ? fields.guestNames : [];
    const amountPaid = Number(String(fields.amountPaid || "0").replace(/[^0-9.]/g, ""));
    const registration = {
      reference,
      status: "For Payment Verification",
      full_name: fields.name || "",
      batch_year: Number(fields.batch || 0),
      mobile_number: fields.phone || "",
      email_address: fields.email || "",
      current_location: fields.location || null,
      registration_type: fields.registrationType || "",
      total_attendees: Number(fields.attendees || 1),
      guest_names: guestNames,
      payment_method: fields.paymentMethod || "",
      payment_name: fields.paymentName || "",
      amount_paid: amountPaid,
      payment_date: fields.paymentDate || null,
      transaction_reference: transactionReference,
      proof_path: proofPath,
      proof_file_name: proof.name,
      payment_declaration: Boolean(fields.declaration),
      data_consent: Boolean(fields.dataConsent),
    };

    const insertResponse = await fetch(`${supabaseUrl}/rest/v1/registrations`, {
      method: "POST",
      headers: { ...supabaseHeaders, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify(registration),
    });
    if (!insertResponse.ok) {
      await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${proofPath}`, { method: "DELETE", headers: supabaseHeaders });
      const detail = await insertResponse.text();
      if (insertResponse.status === 409 || detail.includes("registrations_transaction_reference_unique_idx")) {
        return Response.json({ error: "This transaction / reference number has already been used." }, { status: 409 });
      }
      throw new Error(`Supabase registration insert failed (${insertResponse.status}): ${detail}`);
    }

    let emailSent = false;
    try {
      emailSent = await sendRegistrationConfirmation(registration);
    } catch (emailError) {
      console.error("Registration saved, but confirmation email failed:", emailError);
    }

    return Response.json({ success: true, reference, status: registration.status, emailSent });
  } catch (error) {
    console.error("Registration submission failed:", error);
    return Response.json({ error: "We could not save your registration. Please try again." }, { status: 502 });
  }
}

async function listPublicRegistrants() {
  const { url: supabaseUrl, key } = supabaseConfig();
  if (!supabaseUrl || !key) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const fields = "reference,full_name,batch_year,registration_type,total_attendees,guest_names,status,submitted_at";
  const response = await fetch(`${supabaseUrl}/rest/v1/registrations?select=${fields}&order=submitted_at.desc&limit=500`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!response.ok) return Response.json({ error: "Could not load registrants." }, { status: 502 });
  return Response.json({ registrants: await response.json() });
}

const server = Bun.serve({
  port: Number(Bun.env.PORT || 3000),
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS" && url.pathname.startsWith("/api/")) {
      return new Response(null, { headers: corsHeaders });
    }
    if (url.pathname === "/api/registrants") {
      if (request.method !== "GET") return withCors(new Response("Method not allowed", { status: 405 }));
      return withCors(await listPublicRegistrants());
    }
    if (url.pathname === "/api/register") {
      if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
      return withCors(await submitRegistration(request));
    }
    if (url.pathname.startsWith("/api/admin/")) return withCors(await handleAdminApi(request, url));
    const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
    const filePath = `${root}${pathname}`;

    if (!filePath.startsWith(root)) {
      return new Response("Forbidden", { status: 403 });
    }

    const file = Bun.file(filePath);
    if (!(await file.exists())) {
      return new Response("Not found", { status: 404 });
    }

    return new Response(file);
  },
});

console.log(`ACD Homecoming is running at http://localhost:${server.port}`);
