const path = require('path');
const http = require('http');
const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const config = require('./config');
const { pool } = require('./db');
const { ApiError } = require('./lib/http');

const app = express();
app.set('trust proxy', 1); // Apache 뒤에서 동작
app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));

const sessionStore = new MySQLStore({ createDatabaseTable: true, clearExpired: true }, pool);
const sessionMiddleware = session({
  name: 'aquabit.sid',
  secret: config.sessionSecret,
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: 'auto',
    maxAge: 1000 * 60 * 60 * 24 * 14,
  },
});
app.use(sessionMiddleware);

app.get('/api/health', (req, res) => res.json({ ok: true, timeScale: config.timeScale }));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/tanks/:tankId/fish', require('./routes/fish'));
app.use('/api/tanks/:tankId/messages', require('./routes/messages'));
app.use('/api/tanks/:tankId/tasks', require('./routes/tasks'));
app.use('/api/tanks', require('./routes/tanks'));
app.use('/api', require('./routes/economy'));

app.use('/api', (req, res) => res.status(404).json({ error: '없는 API예요.', code: 'NOT_FOUND' }));

// 로컬 개발용: 정적 파일 (운영에서는 Apache가 /var/www/html을 서비스)
if (config.serveStatic) {
  app.use(express.static(path.join(__dirname, '..', '..', 'public'), { extensions: ['html'] }));
}

// 오류 처리
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof ApiError) return res.status(err.status).json({ error: err.message, code: err.code });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: '요청 형식이 올바르지 않아요.' });
  console.error(err);
  res.status(500).json({ error: '서버에서 문제가 생겼어요. 잠시 후 다시 시도해 주세요.' });
});

// 세션 저장소 등에서 놓친 비동기 오류로 서버 전체가 죽지 않게 기록만 한다
process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));

const server = http.createServer(app);
require('./socket').attachSocket(server, sessionMiddleware);
server.listen(config.port, () => {
  console.log(`AQUABIT API on http://localhost:${config.port} (TIME_SCALE=${config.timeScale})`);
});

module.exports = { app, server, sessionMiddleware };
