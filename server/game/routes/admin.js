// 관리자 API (ADMIN_ENABLED=true일 때만 연결된다)
// 모든 어항 보기/수정/삭제, 사용자와 소속 어항 보기, 진주/아이템 지급, 공지 보내기
const express = require('express');
const crypto = require('crypto');
const { pool, tx } = require('../db');
const { wrap, bad, notFound } = require('../lib/http');
const { requireAuth, requireAdmin } = require('../lib/auth');
const { changePearls, getInventory, addItem } = require('../lib/pearls');
const { MAX_MEMBERS, STAGES, kstDate } = require('../lib/game');
const realtime = require('../lib/realtime');

const router = express.Router();
router.use(requireAuth, requireAdmin);

const ITEMS = ['food', 'ribbon', 'hat', 'crown'];
const ITEM_LABEL = { food: '먹이', ribbon: '리본', hat: '꽃', crown: '왕관' };
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const makeCode = () => Array.from({ length: 6 }, () => CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]).join('');

// 한눈에 보기
router.get('/overview', wrap(async (req, res) => {
  const one = async (sql, params = []) => Number((await pool.query(sql, params))[0][0].n);
  res.json({
    users: await one('SELECT COUNT(*) AS n FROM users WHERE is_admin = 0'),
    tanks: await one('SELECT COUNT(*) AS n FROM tanks'),
    messages: await one('SELECT COUNT(*) AS n FROM messages'),
    openTasks: await one("SELECT COUNT(*) AS n FROM tasks WHERE status <> 'approved'"),
    pearlsInCirculation: await one('SELECT COALESCE(SUM(pearls), 0) AS n FROM users WHERE is_admin = 0'),
    feedingsToday: await one('SELECT COUNT(*) AS n FROM feedings WHERE feed_date = ?', [kstDate()]), // 한국 날짜 기준
  });
}));

// 모든 어항과 멤버
router.get('/tanks', wrap(async (req, res) => {
  const [tanks] = await pool.query(
    `SELECT t.*, o.nickname AS owner_nickname, o.username AS owner_username,
            (SELECT COUNT(*) FROM messages m WHERE m.tank_id = t.id) AS message_count,
            (SELECT COUNT(*) FROM tasks k WHERE k.tank_id = t.id AND k.status <> 'approved') AS open_tasks
       FROM tanks t JOIN users o ON o.id = t.owner_id ORDER BY t.id`
  );
  const [members] = await pool.query(
    `SELECT tm.tank_id, u.id, u.username, u.nickname, f.name AS fish_name, f.stage, f.food_total
       FROM tank_members tm JOIN users u ON u.id = tm.user_id
       LEFT JOIN fish f ON f.tank_id = tm.tank_id AND f.user_id = tm.user_id
      ORDER BY tm.joined_at`
  );
  res.json({
    tanks: tanks.map((t) => ({
      id: t.id, name: t.name, inviteCode: t.invite_code, createdAt: t.created_at,
      ownerId: t.owner_id, ownerNickname: t.owner_nickname, ownerUsername: t.owner_username,
      messageCount: Number(t.message_count), openTasks: Number(t.open_tasks), maxMembers: MAX_MEMBERS,
      members: members.filter((m) => m.tank_id === t.id).map((m) => ({
        userId: m.id, username: m.username, nickname: m.nickname, fishName: m.fish_name,
        stage: m.stage, stageName: m.stage ? STAGES[m.stage - 1].name : null, foodTotal: m.food_total,
      })),
    })),
  });
}));

async function loadTank(id) {
  const [[t]] = await pool.query('SELECT * FROM tanks WHERE id = ?', [id]);
  if (!t) throw notFound('어항을 찾을 수 없어요.');
  return t;
}

// 어항 수정: 이름, 대표 바꾸기, 초대 코드 새로 만들기
router.patch('/tanks/:id', wrap(async (req, res) => {
  const t = await loadTank(Number(req.params.id));
  const changes = [];
  if (req.body.name !== undefined) {
    const name = String(req.body.name).trim();
    if (name.length < 1 || name.length > 20) throw bad('어항 이름은 1~20자로 정해 주세요.');
    if (name !== t.name) { await pool.query('UPDATE tanks SET name = ? WHERE id = ?', [name, t.id]); changes.push(`이름을 '${name}'(으)로`); }
  }
  if (req.body.ownerId !== undefined && Number(req.body.ownerId) !== t.owner_id) {
    const toId = Number(req.body.ownerId);
    const [[m]] = await pool.query(
      'SELECT u.nickname FROM tank_members tm JOIN users u ON u.id = tm.user_id WHERE tm.tank_id = ? AND tm.user_id = ?', [t.id, toId]
    );
    if (!m) throw bad('대표는 이 어항의 팀원 중에서 골라 주세요.');
    await tx(async (conn) => {
      await conn.query('UPDATE tanks SET owner_id = ? WHERE id = ?', [toId, t.id]);
      // 대표는 자기 자신에게 과제를 줄 수 없으므로 새 대표의 끝나지 않은 과제는 지운다
      await conn.query("DELETE FROM tasks WHERE tank_id = ? AND assignee_id = ? AND status <> 'approved'", [t.id, toId]);
    });
    const [[from]] = await pool.query('SELECT nickname FROM users WHERE id = ?', [t.owner_id]);
    realtime.toTank(t.id, 'tank:owner-changed', {
      fromUserId: t.owner_id, fromNickname: from.nickname, toUserId: toId, toNickname: m.nickname, byAdmin: true,
    });
    changes.push(`대표를 ${m.nickname}님으로`);
  }
  if (req.body.newInviteCode) {
    let code;
    for (let i = 0; i < 8; i++) {
      code = makeCode();
      try { await pool.query('UPDATE tanks SET invite_code = ? WHERE id = ?', [code, t.id]); break; }
      catch (e) { if (e.code !== 'ER_DUP_ENTRY') throw e; code = null; }
    }
    if (!code) throw new Error('초대 코드 생성 실패');
    changes.push(`초대 코드를 ${code}(으)로`);
  }
  if (changes.length) realtime.toTank(t.id, 'tank:updated', { byAdmin: true });
  res.json({ ok: true, changes });
}));

// 어항 삭제 (관리자는 이름 확인 없이)
router.delete('/tanks/:id', wrap(async (req, res) => {
  const t = await loadTank(Number(req.params.id));
  await pool.query('DELETE FROM tanks WHERE id = ?', [t.id]);
  realtime.toTank(t.id, 'tank:deleted', { tankName: t.name, byNickname: '관리자', byUserId: req.session.userId });
  realtime.closeTankRoom(t.id);
  res.json({ ok: true });
}));

// 사용자 목록 (?q= 아이디/닉네임 검색) + 들어간 어항
router.get('/users', wrap(async (req, res) => {
  const q = String(req.query.q || '').trim();
  const [users] = await pool.query(
    `SELECT u.id, u.username, u.nickname, u.pearls, u.is_admin, u.created_at,
            (SELECT MAX(att_date) FROM attendance a WHERE a.user_id = u.id) AS last_attendance
       FROM users u
      WHERE (? = '' OR u.username LIKE ? OR u.nickname LIKE ?)
      ORDER BY u.is_admin DESC, u.id`,
    [q, `%${q}%`, `%${q}%`]
  );
  const [memberships] = await pool.query(
    `SELECT tm.user_id, t.id, t.name, t.owner_id FROM tank_members tm JOIN tanks t ON t.id = tm.tank_id ORDER BY t.id`
  );
  const [inv] = await pool.query('SELECT user_id, item, quantity FROM inventory');
  res.json({
    users: users.map((u) => {
      const items = { food: 0, ribbon: 0, hat: 0, crown: 0 };
      for (const r of inv) if (r.user_id === u.id) items[r.item] = r.quantity;
      return {
        id: u.id, username: u.username, nickname: u.nickname, pearls: u.pearls, isAdmin: !!u.is_admin,
        createdAt: u.created_at, lastAttendance: u.last_attendance, inventory: items,
        tanks: memberships.filter((m) => m.user_id === u.id).map((m) => ({ id: m.id, name: m.name, isOwner: m.owner_id === u.id })),
      };
    }),
  });
}));

// 진주 지급/회수, 아이템 지급
// { pearls: 50 } 또는 { pearls: -20 }, { item: 'food', quantity: 5 }, reason(선택)
router.post('/users/:id/grant', wrap(async (req, res) => {
  const userId = Number(req.params.id);
  const reason = String(req.body.reason || '').trim().slice(0, 60);
  const [[u]] = await pool.query('SELECT id, nickname FROM users WHERE id = ?', [userId]);
  if (!u) throw notFound('사용자를 찾을 수 없어요.');
  const pearls = req.body.pearls === undefined || req.body.pearls === '' ? 0 : Number(req.body.pearls);
  const item = req.body.item ? String(req.body.item) : null;
  const qty = item ? Number(req.body.quantity || 1) : 0;
  if (!Number.isInteger(pearls) || Math.abs(pearls) > 100000) throw bad('진주는 -100000 ~ 100000 사이 정수로 적어 주세요.');
  if (item && !ITEMS.includes(item)) throw bad('없는 아이템이에요.');
  if (item && (!Number.isInteger(qty) || qty < 1 || qty > 999)) throw bad('아이템 수량은 1~999로 적어 주세요.');
  if (!pearls && !item) throw bad('지급할 진주나 아이템을 정해 주세요.');

  const result = await tx(async (conn) => {
    await conn.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [userId]);
    let balance = null;
    if (pearls) {
      const label = pearls > 0 ? '관리자 지급' : '관리자 회수';
      balance = await changePearls(conn, {
        userId, amount: pearls, type: 'admin', description: reason ? `${label}: ${reason}` : label,
      });
    }
    if (item) {
      // 장신구는 한 개만 가지면 충분
      if (item !== 'food') {
        const cur = await getInventory(conn, userId);
        if (!cur[item]) await addItem(conn, userId, item, 1);
      } else {
        await addItem(conn, userId, item, qty);
      }
    }
    const [[now]] = await conn.query('SELECT pearls FROM users WHERE id = ?', [userId]);
    return { pearls: now.pearls, inventory: await getInventory(conn, userId), balance };
  });

  // 받은 사람 화면에 바로 보이게
  if (pearls > 0) realtime.toUser(userId, 'wallet:pearls', { pearls: result.pearls, amount: pearls, reason: 'admin', note: reason });
  realtime.toUser(userId, 'wallet:changed', { pearls: result.pearls, inventory: result.inventory, note: reason, item, quantity: qty, pearlsDelta: pearls });
  const parts = [];
  if (pearls) parts.push(`진주 ${pearls > 0 ? '+' : ''}${pearls}`);
  if (item) parts.push(`${ITEM_LABEL[item]} ${item === 'food' ? qty + '개' : ''}`.trim());
  res.json({ ok: true, ...result, summary: `${u.nickname}님에게 ${parts.join(', ')}` });
}));

// 공지: 특정 어항 또는 모든 어항의 채팅에 공지로 남기고 실시간 알림
router.post('/notices', wrap(async (req, res) => {
  const body = String(req.body.body || '').trim();
  const tankId = req.body.tankId ? Number(req.body.tankId) : null;
  if (!body) throw bad('공지 내용을 적어 주세요.');
  if (body.length > 300) throw bad('공지는 300자까지 보낼 수 있어요.');
  const [targets] = tankId
    ? await pool.query('SELECT id FROM tanks WHERE id = ?', [tankId])
    : await pool.query('SELECT id FROM tanks');
  if (tankId && !targets.length) throw notFound('어항을 찾을 수 없어요.');
  const [[me]] = await pool.query('SELECT nickname FROM users WHERE id = ?', [req.session.userId]);
  const now = new Date();
  for (const t of targets) {
    const [r] = await pool.query('INSERT INTO messages (tank_id, user_id, body, created_at) VALUES (?, ?, ?, ?)', [t.id, req.session.userId, body, now]);
    const message = { id: Number(r.insertId), userId: req.session.userId, nickname: me.nickname, body, createdAt: now, isAdmin: true };
    realtime.toTank(t.id, 'chat:message', message);
    realtime.toTank(t.id, 'notice', { body });
  }
  res.json({ ok: true, sentTo: targets.length });
}));

module.exports = router;
