const root = import.meta.dir;

async function submitRegistration(request: Request) {
  const endpoint = Bun.env.GOOGLE_APPS_SCRIPT_URL;
  const secret = Bun.env.REGISTRATION_API_SECRET;
  if (!endpoint || !secret) {
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

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret,
        fields,
        proof: {
          name: proof.name,
          type: proof.type,
          base64: Buffer.from(await proof.arrayBuffer()).toString("base64"),
        },
      }),
    });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.error || "Google rejected the registration.");
    return Response.json(result);
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
