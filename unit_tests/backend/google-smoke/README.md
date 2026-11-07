# Real-Google smoke test

This opt-in smoke test verifies that a pre-provisioned local user can sign in through Google twice without changing the Supabase UUID or creating duplicate Google identities. It is not part of the default suite because Google requires interactive account selection and may present account challenges.

Requirements:

- Local Supabase is running with the Google provider configured from the ignored root `.env`.
- The Google OAuth client allows `http://localhost:3000/auth/callback`.
- `GOOGLE_SMOKE_EMAIL` names the Google account that will be selected interactively. Do not commit it.

Run each command from the repository root:

```bash
GOOGLE_SMOKE_EMAIL="person@example.com" node unit_tests/backend/google-smoke/run.mjs prepare
GOOGLE_SMOKE_EMAIL="person@example.com" node unit_tests/backend/google-smoke/run.mjs login
GOOGLE_SMOKE_EMAIL="person@example.com" node unit_tests/backend/google-smoke/run.mjs repeat
GOOGLE_SMOKE_EMAIL="person@example.com" node unit_tests/backend/google-smoke/run.mjs cleanup
```

`prepare` refuses an existing Auth user rather than modifying a real fixture. `login` requires a previously unlinked user; `repeat` requires exactly one existing Google identity. The helper writes tokens only beneath the OS temp directory and removes each output after verification. `cleanup` removes only the UUID recorded by `prepare` after confirming its email.
