# Time Capsule
A full-stack time capsule app built with React and Express. Create messages that can only be revealed after a specified date.

## Running it locally

1. Clone the repository:

```bash
git clone https://github.com/Andy34G7/time-capsule.git
cd time-capsule
```

2. Set the environment variables in a .env file for both client and server as needed (see `.env.example` files). When using Google OAuth:
   - Server requires Turso credentials plus `OAUTH_JWKS_URL=https://www.googleapis.com/oauth2/v3/certs`, `OAUTH_ISSUER=https://accounts.google.com`, `OAUTH_AUDIENCE=<Google client id>`, and `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI` for exchanging auth codes.
   - Client requires `VITE_GOOGLE_CLIENT_ID` and `VITE_GOOGLE_REDIRECT_URI` for the PKCE flow.
   - During local development you can set `DEV_FAKE_USER_ID` on the server to bypass OAuth while still exercising owner-scoped capsules.

3. Start the backend server:

```bash
cd server
npm install
npm run dev
```

4. In a separate terminal, start the frontend client:

```bash
cd client
npm install
npm run dev
```

## Maintainers

- Andey Hemanth
- Ajmal Abdul Rasheed
