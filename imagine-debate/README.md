# Imagine Debate

Imagine Debate is a two-person, real-time debate app with ranked and unranked debates and AI appraisal. The current experience and the new unranked Open exchange mode are documented in [the debate format proposal](docs/debate-format-proposal.md). That document distinguishes current repository behaviour from proposed work and lists database, deployment and testing requirements.

## Repository map

- `frontend/`: Next.js app, authentication, lobby, room, dashboard and outcomes. See [frontend README](frontend/README.md) and `frontend/AGENTS.md` before editing frontend code.
- `backend/src/socketServer.ts`: authenticated Socket.IO rooms, turn state, timers, messages and forfeits. Active room state is in memory.
- `supabase/migrations/`: checked-in incremental database changes, not a complete baseline schema.
- `supabase/functions/`: AI judge, account deletion and reports. Verify deployed versions and settings independently.
- Root `General Architecture.txt`, `Tech Stack.txt` and `To add list.txt` are historical notes; check code and live configuration before relying on them.

## Local development

From this directory, install dependencies in the root, `frontend`, and `backend` with `npm install` in each, copy each `.env.example` to the appropriate local environment file, and fill in credentials. Start both servers with `npm run dev`. The frontend defaults to port 3000 and the backend to 4000. `NEXT_PUBLIC_SOCKET_URL` configures the frontend's remote Socket.IO endpoint; the local browser uses localhost:4000. The backend needs a Supabase service-role key: keep it server-side and never commit credentials. AI judging additionally requires Edge Function secrets, including `GEMINI_API_KEY`, in the relevant Supabase environment. Local development depends on a compatible Supabase schema; the migrations here alone may not create one.

Useful checks: `npm run lint --prefix frontend`, `npm run build --prefix frontend`, and `npm run build --prefix backend`. After the backend build, run `node dist/debateFormat.test.js`, `node dist/moderation.test.js`, and `node --test tests/socket.integration.test.mjs` from `backend/`; the integration test uses a local fake Supabase service and the frontend socket client dependency. Deployments of frontend, backend, database migrations and Edge Functions are separate; repository state does not establish what is live.

Privacy, moderation and app-store release gaps are tracked in [the privacy and safety release checklist](docs/release-privacy-safety.md).

The working-tree friend and profile design, database migration, test scope and release blockers are documented in [friends and profiles](docs/friends-and-profiles.md).
