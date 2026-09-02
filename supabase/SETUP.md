# Supabase registration storage

1. Create a Supabase project.
2. Open **SQL Editor**, paste `schema.sql`, and run it once.
3. In **Project Settings → API**, copy the project URL and server-only service-role key.
4. Configure the website server environment:

   ```env
   SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-server-only-service-role-key
   SUPABASE_PROOF_BUCKET=payment-proofs
   ADMIN_PASSWORD=replace-with-a-strong-admin-password
   ADMIN_SESSION_SECRET=replace-with-a-long-random-session-secret
   RESEND_API_KEY=re_your-resend-api-key
   RESEND_FROM_EMAIL=ACD Homecoming <registration@your-verified-domain.com>
   RESEND_REPLY_TO_EMAIL=your-committee-email@example.com
   ```

5. Restart or redeploy the Bun server.

Registration data is visible under **Table Editor → registrations**. Payment
receipts are visible under **Storage → payment-proofs**. The `proof_path` column
links each registration record to its stored receipt. Keep the bucket private
and never expose the service-role key in browser JavaScript or HTML.

The administration page is available at `/admin.html`. Its password and session
signing secret must only be stored in the server environment.

## GitHub Pages deployment

GitHub Pages cannot run the Bun API. This project therefore includes the
`homecoming-api` Supabase Edge Function for the production website. In Supabase,
add `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`, `SUPABASE_PROOF_BUCKET`,
`RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and optionally `RESEND_REPLY_TO_EMAIL` under
**Edge Functions → Secrets**, then deploy `supabase/functions/homecoming-api`.
The production pages automatically send registration and admin requests to that
function; local development continues to use the Bun API.

## Confirmation email

Create a Resend API key and verify the domain used by `RESEND_FROM_EMAIL`. After
a registration is saved, the API emails the registrant their registration
reference, payment-verification status, attendee count, and amount paid. Email
delivery failures are logged without discarding an otherwise valid registration.
