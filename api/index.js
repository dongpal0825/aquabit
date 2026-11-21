// Vercel 함수 진입점 (vercel 브랜치 전용).
// 정적 파일(public/, 게임 빌드 public/play/)은 Vercel이 바로 보내고, 그 밖의 요청(회사 홈페이지 EJS 화면,
// /api/game, /game-socket.io, 문의 폼)은 vercel.json의 rewrites로 이 함수에 온다.
// Express 앱과 Socket.IO를 붙인 HTTP 서버를 그대로 내보내면 Vercel이 일반 요청과 WebSocket을 모두 넘겨준다.
const http = require('http');
const app = require('../app');

const server = http.createServer(app);
require('../server/game/router').attach(server);

module.exports = server;
