const root = import.meta.dir;

async function submitRegistration(request: Request) {
  const supabaseUrl = Bun.env.SUPABASE_URL?.replace(/\/$/, "");
  const serviceRoleKey = Bun.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = Bun.env.SUPABASE_PROOF_BUCKET || "payment-proofs";
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
      transaction_reference: fields.transactionNumber || "",
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
      throw new Error(`Supabase registration insert failed (${insertResponse.status}): ${detail}`);
    }

    return Response.json({ success: true, reference, status: registration.status });
  } catch (error) {
    console.error("Registration submission failed:", error);
    return Response.json({ error: "We could not save your registration. Please try again." }, { status: 502 });
  }
}

const server = Bun.serve({
  port: Number(Bun.env.PORT || 3000),
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/api/register") {
      if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
      return submitRegistration(request);
    }
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
