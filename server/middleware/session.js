const { v4: uuidv4 } = require('uuid');
const { sessionManager } = require('../config/redis');

const trackSession = async (req, res, next) => {
  req.sessionMeta = {
    ip: req.ip,
    ua: req.get('User-Agent'),
    sessionId: uuidv4()
  };

  if (req.user) {
    await sessionManager.createSession(req.user.id, req.sessionMeta);
  }

  next();
};

module.exports = { trackSession };