const { asyncRedis } = require('../config/redis');

class TokenBlocklist {
  static BLOCKED_PREFIX = 'blocked:';
  static TEMP_PREFIX = 'temp:';

  static async isBlocked(tokenHash) {
    const [blockedExists, tempExists] = await Promise.all([
      asyncRedis.exists(`${this.BLOCKED_PREFIX}${tokenHash}`),
      asyncRedis.exists(`${this.TEMP_PREFIX}${tokenHash}`)
    ]);
    return blockedExists || tempExists;
  }

  static async addToTemporalCache(tokenHash, ttl) {
    await asyncRedis.setex(
      `${this.TEMP_PREFIX}${tokenHash}`,
      Math.ceil(ttl / 1000),
      '1'
    );
  }

  static async blockToken(tokenHash, expiry) {
    await asyncRedis.setex(
      `${this.BLOCKED_PREFIX}${tokenHash}`,
      expiry,
      Date.now().toString()
    );
  }
}

module.exports = { TokenBlocklist };