const pino = require('pino');

const securityLogger = pino({
  name: 'security',
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  redact: {
    paths: [
      'req.headers.authorization',
      'token',
      'password',
      'refreshToken',
      '*.password',
      '*.token'
    ],
    remove: true
  },
  serializers: {
    err: pino.stdSerializers.err,
    req: (req) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      ip: req.ip,
      userAgent: req.headers['user-agent']
    })
  }
});

module.exports = { securityLogger };