# Time Capsule
A full-stack time capsule app built with React and Express. Create messages that can only be revealed after a specified date.

## Running it locally

1. Clone the repository:

```bash
git clone https://github.com/Andy34G7/time-capsule.git
cd time-capsule
```

1. Set the environment variables in a .env file for both client and server as needed (see `.env.example` files). When using Google OAuth:
   - Server requires Turso credentials plus `OAUTH_JWKS_URL=https://www.googleapis.com/oauth2/v3/certs`, `OAUTH_ISSUER=https://accounts.google.com`, `OAUTH_AUDIENCE=<Google client id>`, and `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI` for exchanging auth codes.
   - Client requires `VITE_GOOGLE_CLIENT_ID` and `VITE_GOOGLE_REDIRECT_URI` for the PKCE flow.
   - During local development you can set `DEV_FAKE_USER_ID` on the server to bypass OAuth while still exercising owner-scoped capsules.
   - Image uploads use Backblaze B2; configure `B2_APPLICATION_KEY_ID`, `B2_APPLICATION_KEY`, `B2_BUCKET_ID`, `B2_BUCKET_NAME`, optional `B2_IMAGE_PREFIX`/`B2_DOWNLOAD_URL`, plus `MEDIA_MAX_IMAGE_RES`, `MEDIA_MAX_IMAGE_BYTES`, and `MEDIA_IMAGE_QUALITY` to control server-side compression before a file is pushed to the bucket. By default uploads are capped at `MEDIA_MAX_IMAGE_BYTES=2097152` (2 MB per image) before compression.

1. Start the backend server:

```bash
cd server
npm install
npm run dev
```

1. In a separate terminal, start the frontend client:

```bash
cd client
npm install
npm run dev
```

## Maintainers

- Andey Hemanth
- Ajmal Abdul Rasheed
