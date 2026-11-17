// Vercel 서버리스 함수 진입점: /api/* 요청을 Express 앱으로 넘긴다 (vercel.json의 rewrites).
// 운영 VM과 로컬에서는 쓰이지 않는다 (그쪽은 server/src/index.js가 직접 포트를 연다).
module.exports = require('../server/src/index.js').app;
