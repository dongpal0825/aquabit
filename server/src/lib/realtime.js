// 실시간 알림 보내기. Socket.IO 서버가 붙기 전(init 전)에는 아무것도 하지 않는다.
// 방 이름: tank:<id> (같은 어항 사람들), user:<id> (나 혼자)
const { pool } = require('../db');

let io = null;

function init(server) { io = server; }

function toTank(tankId, event, payload) {
  if (io) io.to(`tank:${tankId}`).emit(event, payload);
}

function toUser(userId, event, payload) {
  if (io) io.to(`user:${userId}`).emit(event, payload);
}

/** 출석은 사람 단위라서 그 사람이 들어간 모든 어항에 알린다 */
async function attendance(userId, payload) {
  if (!io) return;
  try {
    const [rows] = await pool.query('SELECT tank_id FROM tank_members WHERE user_id = ?', [userId]);
    for (const r of rows) toTank(r.tank_id, 'attendance', { ...payload, userId });
  } catch (e) {
    console.error('[realtime] attendance', e.message);
  }
}

module.exports = { init, toTank, toUser, attendance };
