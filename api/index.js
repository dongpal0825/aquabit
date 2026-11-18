// Vercel 함수 진입점: /api/* 와 /socket.io/* 요청을 받는다 (vercel.json의 rewrites).
// Express 앱과 Socket.IO가 붙은 HTTP 서버를 그대로 내보내면, Vercel이 일반 요청과 WebSocket 연결을 모두 넘겨준다.
module.exports = require('../server/src/index.js').server;
