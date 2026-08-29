# Supabase registration storage

1. Create a Supabase project.
2. Open **SQL Editor**, paste `schema.sql`, and run it once.
3. In **Project Settings → API**, copy the project URL and server-only service-role key.
4. Configure the website server environment:

   ```env
   SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-server-only-service-role-key
   SUPABASE_PROOF_BUCKET=payment-proofs
   ```

5. Restart or redeploy the Bun server.

Registration data is visible under **Table Editor → registrations**. Payment
receipts are visible under **Storage → payment-proofs**. The `proof_path` column
links each registration record to its stored receipt. Keep the bucket private
and never expose the service-role key in browser JavaScript or HTML.
