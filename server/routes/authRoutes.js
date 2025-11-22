const express = require('express');
const { createRemoteJWKSet, jwtVerify } = require('jose');

const router = express.Router();

const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

let jwks;
function getGoogleJwks() {
	if (!jwks) {
		jwks = createRemoteJWKSet(new URL(GOOGLE_JWKS_URL));
	}
	return jwks;
}

router.post('/google/exchange', async (req, res, next) => {
	try {
		const { code, redirectUri } = req.body || {};
		if (!code) {
			const error = new Error('Authorization code is required');
			error.statusCode = 400;
			throw error;
		}
		const clientId = process.env.GOOGLE_CLIENT_ID;
		const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
		const configuredRedirectUri = process.env.GOOGLE_REDIRECT_URI;

		if (!clientId || !clientSecret || !configuredRedirectUri) {
			const error = new Error('Google OAuth environment variables are not configured');
			error.statusCode = 500;
			throw error;
		}

		const body = new URLSearchParams({
			code,
			client_id: clientId,
			client_secret: clientSecret,
			redirect_uri: redirectUri || configuredRedirectUri,
			grant_type: 'authorization_code',
		});

		const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body,
		});

		const data = await response.json();
		if (!response.ok) {
			const error = new Error(data.error_description || data.error || 'Google token exchange failed');
			error.statusCode = 502;
			throw error;
		}

		const idToken = data.id_token;
		if (!idToken) {
			const error = new Error('Google response missing id_token');
			error.statusCode = 502;
			throw error;
		}

		const verified = await jwtVerify(idToken, getGoogleJwks(), {
			issuer: 'https://accounts.google.com',
			audience: clientId,
		});

		const profile = {
			sub: verified.payload.sub,
			email: verified.payload.email,
			name: verified.payload.name,
			picture: verified.payload.picture,
			emailVerified: verified.payload.email_verified,
		};

		res.json({
			idToken,
			expiresIn: data.expires_in,
			profile,
		});
	} catch (error) {
		next(error);
	}
});

module.exports = router;
