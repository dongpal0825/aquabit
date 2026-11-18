const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const num = (v, d) => (v === undefined || v === '' || isNaN(Number(v)) ? d : Number(v));

// 운영 환경에서 세션 키가 없으면 누구나 아는 기본값으로 로그인 쿠키를 위조할 수 있으므로 시작하지 않는다
if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  console.error('SESSION_SECRET이 비어 있어요. server/.env에 긴 무작위 문자열을 넣어 주세요.');
  process.exit(1);
}

module.exports = {
  port: num(process.env.PORT, 3000),
  host: process.env.HOST || undefined, // 비우면 모든 주소, 운영(Apache 뒤)에서는 127.0.0.1
  isProd: process.env.NODE_ENV === 'production',
  sessionSecret: process.env.SESSION_SECRET || 'aquabit-dev-secret', // 개발용 기본값 (운영에서는 아래에서 막음)
  serveStatic: (process.env.SERVE_STATIC || 'true') === 'true',
  timeScale: Math.max(1, num(process.env.TIME_SCALE, 1)),
  admin: {
    enabled: (process.env.ADMIN_ENABLED || 'true') === 'true',
    username: process.env.ADMIN_USERNAME || 'admin',
    password: process.env.ADMIN_PASSWORD || '',
  },
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: num(process.env.DB_PORT, 3306),
    user: process.env.DB_USER || 'aquabit',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'aquabit',
  },
};
