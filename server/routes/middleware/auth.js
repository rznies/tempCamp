const jwt = require('jsonwebtoken');
const { createHash } = require('crypto');
const { logger, securityLogger } = require('../../lib/logger');
const { UserService } = require('../../services/userService');
const { TokenBlocklist } = require('../../services/tokenService');
const { ratelimiter } = require('../../lib/rateLimiter');
const { createErrorResponse } = require('../../lib/errorHandler');

// Security constants
const TOKEN_ALGORITHM = 'HS256';
const TOKEN_TYP = 'at+jwt';
const REPLAY_WINDOW_MS = 5000; // 5-second replay protection window

// Token verification with full validation
const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, {
      algorithms: [TOKEN_ALGORITHM],
      issuer: process.env.JWT_ISSUER,
      audience: process.env.JWT_AUDIENCE,
      clockTolerance: 5, // 5-second grace period for clock skew
      ignoreExpiration: false,
    });
  } catch (error) {
    logger.warn('Token verification failed', {
      error: error.name,
      stack: error.stack,
    });
    return null;
  }
};

// Security middleware pipeline
const securityHeaders = (req, res, next) => {
  res.set({
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'self'"
  });
  next();
};

// Replay attack protection middleware
const replayProtection = async (req, res, next) => {
  const tokenHash = createHash('sha256')
    .update(req.token)
    .digest('hex');
  
  if (await TokenBlocklist.isBlocked(tokenHash)) {
    securityLogger.warn('Replay attack detected', {
      ip: req.ip,
      tokenHash,
    });
    return res.status(409).json(
      createErrorResponse('security_error', 'Request rejected')
    );
  }

  await TokenBlocklist.addToTemporalCache(tokenHash, REPLAY_WINDOW_MS);
  next();
};

// Main authentication middleware
const authenticateUser = async (req, res, next) => {
  await ratelimiter.authLimiter(req, res, async () => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json(
          createErrorResponse('authentication_required', 'Bearer token missing')
        );
      }

      req.token = authHeader.split(' ')[1];
      req.tokenHash = createHash('sha256')
        .update(req.token)
        .digest('hex');

      const decoded = verifyToken(req.token);
      if (!decoded?.sub || decoded.typ !== TOKEN_TYP) {
        return res.status(403).json(
          createErrorResponse('invalid_token', 'Malformed token')
        );
      }

      const user = await UserService.get(decoded.sub, {
        include: ['sessions', 'roles']
      });
      if (!user || user.isDisabled) {
        return res.status(403).json(
          createErrorResponse('account_inactive', 'User account not active')
        );
      }

      // Check token against user's active sessions
      if (!user.sessions.some(s => s.jti === decoded.jti)) {
        return res.status(403).json(
          createErrorResponse('session_expired', 'Token not in active sessions')
        );
      }

      // Attach security context to request
      req.authContext = {
        user: user.toSecurityContext(),
        token: {
          jti: decoded.jti,
          scope: decoded.scope,
          issuedAt: new Date(decoded.iat * 1000)
        }
      };

      next();
    } catch (error) {
      securityLogger.error('Authentication process failed', {
        error: error.stack,
        tokenHash: req.tokenHash,
      });
      res.status(500).json(
        createErrorResponse('authentication_failure', 'System error')
      );
    }
  });
};

// Role-based access control
const requireRoles = (roles = []) => {
  return async (req, res, next) => {
    try {
      if (!req.authContext?.user.roles.some(r => roles.includes(r))) {
        securityLogger.warn('Role access denied', {
          required: roles,
          actual: req.authContext.user.roles,
        });
        return res.status(403).json(
          createErrorResponse('authorization_denied', 'Insufficient permissions')
        );
      }
      next();
    } catch (error) {
      securityLogger.error('Role check failed', {
        error: error.stack,
        userId: req.authContext?.user.id
      });
      res.status(500).json(
        createErrorResponse('authorization_failure', 'System error')
      );
    }
  };
};

// Admin-specific middleware
const requireAdmin = [
  authenticateUser,
  requireRoles(['admin']),
  (req, res, next) => {
    // Additional admin-specific checks
    if (!req.authContext.user.mfaVerified) {
      return res.status(403).json(
        createErrorResponse('mfa_required', 'Admin access requires MFA')
      );
    }
    next();
  }
];

// Optional user attachment
const attachUser = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = verifyToken(token);
      
      if (decoded?.sub) {
        const user = await UserService.getSafeProfile(decoded.sub);
        if (user && !user.isDisabled) {
          req.user = user;
          req.authContext = { user };
        }
      }
    }
  } catch (error) {
    logger.debug('Optional auth failed', { error: error.message });
  } finally {
    next();
  }
};

module.exports = {
  securityHeaders,
  replayProtection,
  authenticateUser,
  requireRoles,
  requireAdmin,
  attachUser,
};
