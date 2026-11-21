# Imagine Debate frontend

This is the Next.js frontend for Imagine Debate. For setup, architecture and links to the debate-format proposal, start with the [project README](../README.md). Read [AGENTS.md](AGENTS.md) before changing frontend code; it points to the installed Next.js documentation for version-specific behaviour.

From this directory use `npm run dev`, `npm run lint`, or `npm run build`. The app uses Supabase Auth and database reads, and a separate Socket.IO server for live debate events. Configure the public Supabase variables in `.env.example` and set `NEXT_PUBLIC_SOCKET_URL` when the deployed backend is at a different origin. Do not place service-role or Gemini secrets in frontend environment variables.
