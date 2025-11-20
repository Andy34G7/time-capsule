# Time Capsule Client

This frontend is a React app that talks directly to the Express API inside `../server`.

## Features

- Lists every capsule returned by `GET /api/capsules`.
- Shows capsule details, reveal status, and message payload when available.
- Provides an unlock form that posts to `POST /api/capsules/:id/unlock`.
- Ships a minimal creation form that calls `POST /api/capsules`.
- Tailwind CSS v4 plus DaisyUI handle all styling so you can tweak the design with utility classes.

## Getting Started

1. Copy the example environment file and point it at your backend:

```bash
cp .env.example .env
```

By default the client talks to `http://localhost:4000/api`, which matches the dev server.

1. Install dependencies and start Vite:

```bash
npm install
npm run dev
```

## Routes

- `/` — capsule list with refresh control.
- `/capsules/:id` — details page with unlock workflow.
- `/create` — minimal creation form (title, message, reveal date, optional author/passphrase).

Everything else uses the default 404 page served by React Router.
