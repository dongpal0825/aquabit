// Socket.IO: 로그인 세션을 그대로 쓰고, 같은 어항 사람끼리만 방(tank:<id>)으로 묶는다.
const { Server } = require('socket.io');
const { pool } = require('./db');
const realtime = require('./lib/realtime');

function attachSocket(server, sessionMiddleware) {
  const io = new Server(server, {
    path: '/socket.io',
    serveClient: true,       // /socket.io/socket.io.js 로 클라이언트 스크립트 제공
    cors: { origin: false }, // 같은 출처에서만
  });

  // Vercel처럼 서버(함수 인스턴스)가 여러 개 뜨는 곳에서는 Redis로 서로의 방 메시지를 전달한다.
  // REDIS_URL(또는 Vercel 마켓플레이스 Upstash가 넣어 주는 KV_URL)이 있을 때만 켠다.
  const redisUrl = process.env.REDIS_URL || process.env.KV_URL;
  if (redisUrl) {
    const { createClient } = require('redis');
    const { createAdapter } = require('@socket.io/redis-adapter');
    const pub = createClient({ url: redisUrl });
    const sub = pub.duplicate();
    for (const c of [pub, sub]) c.on('error', (e) => console.error('[redis]', e.message));
    io.adapter(createAdapter(pub, sub));
    Promise.all([pub.connect(), sub.connect()])
      .then(() => console.log('[socket] Redis 어댑터 연결됨'))
      .catch((e) => console.error('[socket] Redis 연결 실패, 이 인스턴스 안에서만 전달됨:', e.message));
  }

  // express-session 쿠키로 사용자 확인
  io.engine.use(sessionMiddleware);

  io.on('connection', (socket) => {
    const userId = socket.request.session && socket.request.session.userId;
    if (!userId) {
      socket.emit('auth:required');
      socket.disconnect(true);
      return;
    }
    socket.join(`user:${userId}`);

    // 어항 화면에 들어오면 그 어항 방에 들어간다 (참여자인지 확인)
    socket.on('tank:join', async (tankId, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      try {
        const id = Number(tankId);
        const [[m]] = await pool.query('SELECT 1 AS x FROM tank_members WHERE tank_id = ? AND user_id = ?', [id, userId]);
        if (!m) return reply({ ok: false, error: '참여하지 않은 어항이에요.' });
        for (const room of socket.rooms) if (room.startsWith('tank:')) socket.leave(room);
        socket.join(`tank:${id}`);
        reply({ ok: true });
      } catch (e) {
        reply({ ok: false, error: '방에 들어가지 못했어요.' });
      }
    });

    socket.on('tank:leave', () => {
      for (const room of socket.rooms) if (room.startsWith('tank:')) socket.leave(room);
    });
  });

  realtime.init(io);
  return io;
}

module.exports = { attachSocket };
