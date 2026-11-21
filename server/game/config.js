'use strict';
const crypto = require('node:crypto');
const enabled = process.env.GAME_DATABASE_ENABLED === 'true';
if (enabled && process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  throw new Error('게임 DB를 운영하려면 SESSION_SECRET을 로컬 환경 설정에 등록하세요.');
}
module.exports = {
  enabled,
  sessionSecret: process.env.SESSION_SECRET || crypto.randomBytes(48).toString('hex'),
  timeScale: Math.max(1, Number(process.env.TIME_SCALE) || 1),
  // 관리자: ADMIN_ENABLED=false면 /api/game/admin과 관리자 화면이 막히고 seed도 관리자 계정을 만들지 않는다
  admin: { enabled: process.env.ADMIN_ENABLED !== 'false', username: process.env.ADMIN_USERNAME || 'admin', password: process.env.ADMIN_PASSWORD || '' },
  db: { host: process.env.DB_HOST || '127.0.0.1', port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'aquabit', password: process.env.DB_PASSWORD || '', database: process.env.DB_NAME || 'aquabit' },
};
