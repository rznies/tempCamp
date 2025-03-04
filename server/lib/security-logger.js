const pino = require('pino');

const securityLogger = pino({
  name: 'security',
  level: 'info',
  redact: ['password', 'token', '*.password'],
  serializers: {
    err: pino.stdSerializers.err
  }
});

const logSecurityEvent = (eventType, metadata = {}) => {
  securityLogger.info({
    eventType,
    timestamp: new Date().toISOString(),
    ...metadata
  });
};

module.exports = { logSecurityEvent };