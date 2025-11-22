const { createRemoteJWKSet, jwtVerify } = require('jose');

const issuer = process.env.OAUTH_ISSUER;
const audience = process.env.OAUTH_AUDIENCE;
const jwksUrl = process.env.OAUTH_JWKS_URL;
const devFallbackUserId = process.env.DEV_FAKE_USER_ID;
const isProduction = process.env.NODE_ENV === 'production';

let jwks;

async function verifyToken(token) {
  if (!jwksUrl) {
    const error = new Error('OAUTH_JWKS_URL is not configured');
    error.statusCode = 500;
    throw error;
  }
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(jwksUrl));
  }
  const { payload } = await jwtVerify(token, jwks, {
    issuer,
    audience,
  });
  return payload;
}

async function authenticateRequest(req) {
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) {
      const error = new Error('Missing access token');
      error.statusCode = 401;
      throw error;
    }
    return verifyToken(token);
  }

  if (!isProduction && devFallbackUserId) {
    return { sub: devFallbackUserId, scope: 'dev:all', devBypass: true };
  }

  const error = new Error('Authorization header missing or invalid');
  error.statusCode = 401;
  throw error;
}

function requireAuth() {
  return async (req, res, next) => {
    try {
      const payload = await authenticateRequest(req);
      req.user = payload;
      next();
    } catch (error) {
      const statusCode = error.statusCode || 401;
      if (statusCode >= 500) {
        console.error('Auth error:', error);
      }
      res.status(statusCode).json({ error: 'Unauthorized', details: error.message });
    }
  };
}

module.exports = requireAuth;
