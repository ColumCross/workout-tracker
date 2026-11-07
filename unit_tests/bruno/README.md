# Local API collection

This flat Bruno collection exercises the local Supabase API directly. It does not drive the client or use Google accounts.

Backend setup must generate a private runtime environment from `environments/local.template.bru` with fresh synthetic fixtures:

- Provisioned users A and B with clean workout history and EULA acknowledgement reset to null.
- An Auth-only user with no `public.users` profile.
- Dedicated provisioned users for bulk-workout deletion and account-data deletion, both with clean history.
- Fresh access/refresh sessions for those users, an invalid token, and a locally signed expired token whose expiry rejection was independently verified.
- One shared machine visible to every authenticated user and one nonexistent UUID.
- The local publishable key and synthetic disabled-signup inputs.

The setup must keep administrator credentials and generated runtime environments outside this directory. Run the collection in sequence against `http://127.0.0.1:54321`; requests intentionally mutate and finally revoke some fixture sessions.

Bruno checks API-visible rollback and isolation. Database tests remain responsible for proving hidden all-table state, transactional failure injection, function metadata/grants, and concurrency.
