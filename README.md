# Workout Tracker

A personal workout tracker for recording machines, sets, repetitions, and weights, then reviewing saved workouts from a phone or laptop. Each user's workout data is private.

## Features

- **Google sign-in:** administrator-provisioned accounts, session restoration, and protected workout screens.
- **Workout logging:** name and rename exercises, record multiple sets per exercise, add further exercises, and review a summary before saving.
- **Set validation:** positive whole-number repetitions and nonnegative weights entered in kilograms, converted to integer grams for storage. Decimal points and commas are accepted for weight entry.
- **Rest timer:** track your rest periods in between sets with a drag-only rotary duration selection from 00:00 to 10:00, countdown, pause/resume, and a compact timer strip during set entry.
- **Local draft recovery:** unfinished workouts are stored per user on the current device. Failed saves preserve the draft; confirmed saves clear it. Storage failures are reported.
- **Atomic saving:** a complete workout saves in one transaction. Retrying the same workout ID does not duplicate or overwrite the first successful save.
- **Workout history:** load saved exercises, sets, repetitions, and weights, oldest first. Dates use the timezone captured when the workout began. Empty, loading, and retryable error states are supported.
- **Appearance:** automatic light/dark themes and responsive React Native controls.

## Expo client

### Stack and architecture

`client/` uses Expo SDK 58, React 19, React Native 0.88, TypeScript, React Native for Web, and Expo Router. Supabase JS handles authentication and service calls; AsyncStorage persists sessions and drafts. React Native Paper, vector icons, and `react-native-rotary-timer` provide the UI.

| Location | Responsibility |
| --- | --- |
| `client/src/app/` | Routes and layout: login/callback, home, workout entry/session/summary, reports, privacy policy |
| `client/src/features/auth/` | Session lifecycle, Google sign-in, and acknowledgement checks |
| `client/src/features/workout/` | Workout state, timer, draft persistence, validation, screens, reusable controls, and API gateway |
| `client/src/features/privacy/` | Policy display, acknowledgement, and account-data deletion |
| `client/src/lib/`, `client/src/theme/` | Supabase client configuration and system-aware themes |

`client/patches/` contains automatically applied fixes for React Native SVG web updates and drag-only rotary selection. `npm ci` runs `patch-package` through the postinstall script. Expo currently uses web `output: "server"`; a deployed static-hosting setup is not established by this configuration.

### How to run

Start the backend as described below. From the repository root:

```bash
nix develop
npm --prefix client ci
cp client/.env.example client/.env.local
```

Create the environment file only if it does not already exist. Populate:

- `EXPO_PUBLIC_SUPABASE_URL`: local API URL, normally `http://127.0.0.1:54321`.
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: public client key from `supabase status`.
- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`: public Google Web OAuth client ID.

```bash
npm --prefix client run web
```

Open `http://localhost:8081`. For the web Google flow, configure that origin and `http://localhost:8081/auth/callback` as the Google OAuth client's authorized JavaScript origin and redirect URI. The client exchanges a Google ID token for a Supabase session. Never place OAuth secrets or Supabase administrator keys in client configuration.

## Supabase backend

### Stack and architecture

Supabase supplies PostgreSQL 17, Auth, the Data API, and Deno Edge Functions. No separate custom application server is needed. Configuration lives in `supabase/config.toml`, schema/constraints/RLS/database functions in `supabase/migrations/`, and HTTP handlers in `supabase/functions/`.

| Table | Purpose |
| --- | --- |
| `public.users` | Application membership/profile linked to an Auth UUID, including acknowledgement timestamp |
| `public.workouts` | Owned workout, start/end timestamps, and captured local timezone |
| `public.exercises` | Ordered, named entries within a workout, with an optional machine reference |
| `public.sets` | Repetition count, integer gram weight, and workout-wide set number |
| `public.machines` | Shared machine IDs readable by authenticated users; no user-owned catalog |

RLS isolates user-owned records. Composite foreign keys prevent cross-user or mismatched parent/child links. Direct client table writes are blocked; explicit operations validate authorization on the server using the session identity.

| Operation | Purpose |
| --- | --- |
| `getWorkoutID` Edge Function | Generate a noncached, owner-scoped ID from server time, random digits, and user UUID without inserting a row |
| `saveWorkout` PostgreSQL RPC | Atomically save the workout, exercises, and sets from a JSON `payload`; first successful save wins |
| `getWorkouts` Edge Function | Return the caller's ordered history without internal IDs; query `userId` must match the session |
| `getUserEULAStatus`, `acknowledgeEULA` Edge Functions | Read/store server-timestamped acknowledgement |
| `deleteAllWorkouts` Edge Function | Delete the caller's workout hierarchy, retaining their profile |
| `deleteUser` Edge Function | Delete the caller's application profile and workout hierarchy, retaining Auth identity and shared machines |

New saves require nonempty exercises and sets, nonblank exercise names, positive integer reps, nonnegative integer gram weights, and positive set numbers unique across the workout. Payload limits are 1 MiB, 100 exercises, and 100 sets per exercise. The start time comes from the workout ID; the end time is database insertion time. A failed transaction leaves no partial workout.

### How to run

The x86_64 Linux Nix shell provides Node.js 22, Supabase CLI, Docker CLI, PostgreSQL tools, and Bruno desktop. A running Docker-compatible container runtime is required separately.

From the repository root:

```bash
nix develop
cp .env.example .env
```

Create `.env` only if missing. The local Google provider reads `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` and `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET` from this ignored file. Use your own OAuth configuration for interactive login; keep secrets out of public documentation and source control.

```bash
supabase start
supabase db reset --local
supabase status
```

The reset applies the checked-in migration and **deletes existing local database data**. Use it for a fresh regression baseline or after local schema changes. The API is at `http://127.0.0.1:54321` and Studio at `http://127.0.0.1:54323`.

In a separate terminal, from the repository root inside the Nix shell:

```bash
supabase functions serve
```

This serves all six Edge Functions. Keep it running while using the client or backend/API tests.

### Provisioning and hosted configuration

Before a person's first Google login, an administrator must create a confirmed Auth user with their verified Google email and a matching `public.users` row. With `SUPABASE_URL` and `SUPABASE_SECRET_KEY` supplied securely in the administrator's environment, run:

```bash
node scripts/provision-user.mjs "person@example.com" "Person Name"
```

The script rolls back the new Auth user if profile creation fails. Google links to the pre-provisioned identity by verified email; application ownership uses its UUID.

Hosted deployment is separate from local setup: database migrations use `supabase db push`, Edge Functions use `supabase functions deploy`, and the client needs its own deployment. Confirm the target before remote changes. Configure hosted Google credentials, Site URL, redirect allow-list, and disabled signup separately; `db push` does not deploy these settings. Do not enable paid plans or add-ons.

## Regression test suite

All regression tests live in `unit_tests/`:

| Area | Runs against | Coverage |
| --- | --- | --- |
| `client/` | Jest/React Native Testing Library with mocked Auth, APIs, storage, and clocks | Client flows, validation, timers, drafts, privacy, and request construction |
| `backend/` | Real local Supabase with synthetic Auth users and sessions | Provisioning, authorization/RLS, atomic saves, retries/concurrency, validation, history, acknowledgement, and deletion |
| `bruno/` | Local HTTP APIs with synthetic fixtures | Sequential API acceptance collection |

### Run the automated suites

Install locked client dependencies, start/reset local Supabase, and serve Edge Functions using the instructions above. Run these commands from the repository root:

```bash
# Client and backend suites
node unit_tests/run.mjs

# Bruno API collection, with automatic fixture setup/cleanup
node unit_tests/run-bruno.mjs
```

To run an individual layer:

```bash
npm --prefix client run test:client
node unit_tests/backend/run.mjs
```

Client tests do not require Supabase. The Bruno runner invokes `npx --yes @usebruno/cli@latest` from the collection directory; the desktop package does not supply the CLI. The first CLI download requires network access.

Backend and Bruno runners create synthetic fixtures and clean them up in `finally`. The backend runner executes each suite in a separate process; administrator access is limited to fixture lifecycle and database assertions. Run the runners sequentially: they share fixture state. Helpers refuse nonlocal targets. Test files must not contain personal accounts, reusable credentials, or generated sessions. Private runtime credentials and state are written with owner-only permissions under `${TMPDIR:-/tmp}/workout-tracker-backend-tests/`, not into the repository; successful cleanup removes that directory. `WORKOUT_TRACKER_TEST_STATE_DIR` can override its location. If interrupted, run cleanup before trying again:

```bash
node unit_tests/backend/cleanup.mjs
```

For interactive Bruno use, run `node unit_tests/backend/setup.mjs`, open `unit_tests/bruno/`, and use the printed private environment path. Alternatively, run manually from the repository root:

```bash
node unit_tests/backend/setup.mjs
(
  cd unit_tests/bruno
  npx --yes @usebruno/cli@latest run . --env-file /tmp/workout-tracker-backend-tests/bruno-local.json
)
node unit_tests/backend/cleanup.mjs
```

Replace the environment path with the one printed by setup, especially when `TMPDIR` or `WORKOUT_TRACKER_TEST_STATE_DIR` is set. Run the collection sequentially and always clean up, even if Bruno fails. The subshell above keeps cleanup in the repository root. `unit_tests/bruno/environments/local.template.bru` documents variable names with placeholders only.

### Optional Google smoke test and coverage limits

The separate Google smoke test requires interactive account selection, a configured local provider, and the authorized redirect URI `http://localhost:3000/auth/callback`. Supply `GOOGLE_SMOKE_EMAIL` in your environment for an account you control that is not already provisioned locally. From the repository root:

```bash
node unit_tests/backend/google-smoke/run.mjs prepare
node unit_tests/backend/google-smoke/run.mjs login
node unit_tests/backend/google-smoke/run.mjs repeat
node unit_tests/backend/google-smoke/run.mjs cleanup
```

This checks stable UUID/Google identity linking across two sign-ins. It is excluded from automated runs because Google login and account challenges require interaction. Session output is written only under the OS temporary directory. Cleanup removes only the recorded fixture; run it even if a smoke-test step fails.

The completed regression run passed **14 client suites / 115 tests**, **9 backend suites / 26 tests**, and **83 Bruno requests / 86 tests**. Client tests verify behavior and request construction with fake responses, not database persistence or authorization. Backend and Bruno tests verify local API/database behavior with real sessions but do not render or drive the client. These are not browser end-to-end tests. Interactive Google login and native gesture/keyboard/device behavior require separate smoke testing.
