// 회원 탈퇴 (본인 탈퇴와 관리자 강제 탈퇴가 같이 쓴다)
//  1) 대표인 어항: 가장 먼저 들어온 다른 팀원에게 대표를 넘기고, 남은 팀원이 없으면 어항을 삭제
//  2) 과제: 이 사람이 담당자인 과제는 지우고, 이 사람이 만든 과제는 그 어항의 지금 대표가 만든 것으로 바꿈
//  3) users 행 삭제 → 물고기, 어항 참여, 채팅, 진주 내역, 인벤토리, 출석, 먹이 기록은 FK로 함께 삭제
//  4) 커밋 뒤: 팀원에게 실시간 알림, 이 사람의 로그인 세션 삭제, 열려 있는 화면 연결 끊기
const { pool, tx } = require('../db');
const { notFound } = require('./http');
const realtime = require('./realtime');

async function deleteAccount(userId, { by = 'self' } = {}) {
  const result = await tx(async (conn) => {
    const [[user]] = await conn.query('SELECT id, nickname FROM users WHERE id = ? FOR UPDATE', [userId]);
    if (!user) throw notFound('없는 사용자예요.');

    const [memberships] = await conn.query(
      'SELECT t.id, t.name, t.owner_id FROM tank_members tm JOIN tanks t ON t.id = tm.tank_id WHERE tm.user_id = ? FOR UPDATE',
      [userId]
    );
    const handed = [], deleted = [], left = [];
    for (const t of memberships) {
      if (t.owner_id !== userId) { left.push(t); continue; }
      const [[next]] = await conn.query(
        `SELECT tm.user_id, u.nickname FROM tank_members tm JOIN users u ON u.id = tm.user_id
          WHERE tm.tank_id = ? AND tm.user_id <> ? ORDER BY tm.joined_at, tm.user_id LIMIT 1`,
        [t.id, userId]
      );
      if (!next) {
        await conn.query('DELETE FROM tanks WHERE id = ?', [t.id]); // 과제·물고기·채팅은 어항과 함께 삭제
        deleted.push(t);
        continue;
      }
      await conn.query('UPDATE tanks SET owner_id = ? WHERE id = ?', [next.user_id, t.id]);
      // 새 대표에게 맡겨져 있던 끝나지 않은 과제는 자기 과제를 승인하게 되므로 지운다 (대표 넘기기와 같은 규칙)
      await conn.query("DELETE FROM tasks WHERE tank_id = ? AND assignee_id = ? AND status <> 'approved'", [t.id, next.user_id]);
      handed.push({ ...t, toUserId: next.user_id, toNickname: next.nickname });
    }

    await conn.query('DELETE FROM tasks WHERE assignee_id = ?', [userId]);
    await conn.query(
      'UPDATE tasks tk JOIN tanks t ON t.id = tk.tank_id SET tk.creator_id = t.owner_id WHERE tk.creator_id = ?',
      [userId]
    );
    await conn.query('DELETE FROM users WHERE id = ?', [userId]);
    return { user, handed, deleted, left };
  });

  // 로그인 세션 지우기 (express-mysql-session의 data 열은 JSON 문자열)
  await pool.query('DELETE FROM game_sessions WHERE data REGEXP ?', [`"userId":${Number(userId)}[,}]`]).catch(() => {});

  const { user, handed, deleted, left } = result;
  const byNickname = by === 'admin' ? '관리자' : user.nickname;
  for (const t of left) {
    realtime.toTank(t.id, 'member:left', { userId, nickname: user.nickname, removedTasks: 0, accountDeleted: true });
  }
  for (const t of handed) {
    realtime.toTank(t.id, 'member:left', { userId, nickname: user.nickname, removedTasks: 0, accountDeleted: true });
    realtime.toTank(t.id, 'tank:owner-changed', {
      fromUserId: userId, fromNickname: user.nickname, toUserId: t.toUserId, toNickname: t.toNickname, removedTasks: 0,
    });
  }
  for (const t of deleted) {
    realtime.toTank(t.id, 'tank:deleted', { tankName: t.name, byNickname, byUserId: userId });
    realtime.closeTankRoom(t.id);
  }
  realtime.kickUser(userId, { by });

  return {
    nickname: user.nickname,
    handedOver: handed.map((t) => ({ tankId: t.id, tankName: t.name, toNickname: t.toNickname })),
    deletedTanks: deleted.map((t) => ({ tankId: t.id, tankName: t.name })),
  };
}

module.exports = { deleteAccount };
