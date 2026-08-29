# Google Sheets registration integration

The spreadsheet owner must complete this one-time setup because the currently connected account has view-only access.

1. Open the destination spreadsheet and choose **Extensions → Apps Script**.
2. Replace `Code.gs` with the contents of this folder's `Code.gs`.
3. Open **Project Settings → Script properties** and add `REGISTRATION_API_SECRET` with a long random value.
4. Run `setup` once and approve access to Sheets and Drive. This adds the header row and creates the private payment-proof folder.
5. Choose **Deploy → New deployment → Web app**. Execute as yourself and allow access to anyone.
6. Copy the deployment URL into the website server environment as `GOOGLE_APPS_SCRIPT_URL`.
7. Set `REGISTRATION_API_SECRET` in the website server environment to the same value used in Script Properties.

Never place the shared secret in `script.js`, HTML, or another browser-delivered file.
