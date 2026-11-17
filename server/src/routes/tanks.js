const express = require('express');
const crypto = require('crypto');
const { pool, tx } = require('../db');
const { wrap, bad, notFound } = require('../lib/http');
const { requireAuth, requireMember } = require('../lib/auth');
const { SPECIES, COLORS, MAX_MEMBERS, fishView, kstDate } = require('../lib/game');
const realtime = require('../lib/realtime');

const router = express.Router();
router.use(requireAuth);

// 헷갈리는 글자(0 O 1 I L)를 뺀 초대 코드 문자
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function makeCode() {
  let s = '';
  for (let i = 0; i < 6; i++) s += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
  return s;
}

const pick = (arr) => arr[crypto.randomInt(arr.length)];

/** 참여 시 기본 물고기 생성 */
async function createFish(conn, tankId, userId, nickname) {
  await conn.query(
    'INSERT INTO fish (tank_id, user_id, name, species, color, last_fed_at) VALUES (?, ?, ?, ?, ?, ?)',
    [tankId, userId, `${nickname}의 물고기`.slice(0, 12), pick(SPECIES), pick(COLORS), new Date()]
  );
}

async function getNickname(conn, userId) {
  const [[u]] = await conn.query('SELECT nickname FROM users WHERE id = ?', [userId]);
  return u.nickname;
}

// 내 어항 목록
router.get('/', wrap(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT t.id, t.name, t.invite_code, t.owner_id, o.nickname AS owner_nickname,
            (SELECT COUNT(*) FROM tank_members mm WHERE mm.tank_id = t.id) AS member_count,
            f.species, f.color, f.stage, f.accessory
       FROM tank_members m
       JOIN tanks t ON t.id = m.tank_id
       JOIN users o ON o.id = t.owner_id
       LEFT JOIN fish f ON f.tank_id = t.id AND f.user_id = m.user_id
      WHERE m.user_id = ?
      ORDER BY m.joined_at DESC, t.id DESC`,
    [req.session.userId]
  );
  res.json({
    tanks: rows.map((r) => ({
      id: r.id,
      name: r.name,
      inviteCode: r.invite_code,
      isOwner: r.owner_id === req.session.userId,
      ownerNickname: r.owner_nickname,
      memberCount: Number(r.member_count),
      maxMembers: MAX_MEMBERS,
      myFish: r.species ? { species: r.species, color: r.color, stage: r.stage, accessory: r.accessory } : null,
    })),
  });
}));

// 어항 만들기 → 6자리 초대 코드 발급, 만든 사람이 대표
router.post('/', wrap(async (req, res) => {
  const name = String(req.body.name || '').trim();
  if (name.length < 1 || name.length > 20) throw bad('어항 이름은 1~20자로 정해 주세요.');
  const userId = req.session.userId;

  const tank = await tx(async (conn) => {
    let tankId, code;
    for (let i = 0; i < 8 && !tankId; i++) {
      code = makeCode();
      try {
        const [r] = await conn.query(
          'INSERT INTO tanks (name, invite_code, owner_id) VALUES (?, ?, ?)', [name, code, userId]
        );
        tankId = r.insertId;
      } catch (e) {
        if (e.code !== 'ER_DUP_ENTRY') throw e;
      }
    }
    if (!tankId) throw new Error('초대 코드 생성 실패');
    await conn.query('INSERT INTO tank_members (tank_id, user_id) VALUES (?, ?)', [tankId, userId]);
    await createFish(conn, tankId, userId, await getNickname(conn, userId));
    return { id: tankId, name, inviteCode: code };
  });
  res.status(201).json({ tank });
}));

// 초대 코드로 참여 (최대 10명)
router.post('/join', wrap(async (req, res) => {
  const code = String(req.body.code || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) throw bad('초대 코드는 6자리예요.');
  const userId = req.session.userId;

  const result = await tx(async (conn) => {
    // 같은 어항에 동시에 들어오는 경우를 막기 위해 어항 행을 잠근다
    const [[tank]] = await conn.query('SELECT * FROM tanks WHERE invite_code = ? FOR UPDATE', [code]);
    if (!tank) throw notFound('이 코드의 어항이 없어요. 코드를 다시 확인해 주세요.');
    const [[already]] = await conn.query(
      'SELECT 1 AS x FROM tank_members WHERE tank_id = ? AND user_id = ?', [tank.id, userId]
    );
    if (already) return { tank, joined: false };
    const [[{ n }]] = await conn.query('SELECT COUNT(*) AS n FROM tank_members WHERE tank_id = ?', [tank.id]);
    if (n >= MAX_MEMBERS) throw bad(`이 어항은 이미 ${MAX_MEMBERS}명이 가득 찼어요.`, 'TANK_FULL');
    await conn.query('INSERT INTO tank_members (tank_id, user_id) VALUES (?, ?)', [tank.id, userId]);
    await createFish(conn, tank.id, userId, await getNickname(conn, userId));
    return { tank, joined: true };
  });
  if (result.joined) {
    const [[u]] = await pool.query('SELECT nickname FROM users WHERE id = ?', [userId]);
    realtime.toTank(result.tank.id, 'member:joined', { userId, nickname: u.nickname });
  }
  res.status(result.joined ? 201 : 200).json({
    tank: { id: result.tank.id, name: result.tank.name },
    joined: result.joined,
  });
}));

// 어항 상세: 멤버, 물고기
router.get('/:tankId', requireMember, wrap(async (req, res) => {
  const t = req.tank;
  const [members] = await pool.query(
    `SELECT u.id, u.nickname, m.joined_at FROM tank_members m
       JOIN users u ON u.id = m.user_id WHERE m.tank_id = ? ORDER BY m.joined_at, u.id`,
    [t.id]
  );
  const [fish] = await pool.query(
    `SELECT f.*, u.nickname,
            (SELECT COUNT(*) FROM feedings fd WHERE fd.fish_id = f.id AND fd.feed_date = ?) AS fed_today
       FROM fish f JOIN users u ON u.id = f.user_id WHERE f.tank_id = ? ORDER BY f.id`,
    [kstDate(), t.id]
  );
  res.json({
    tank: {
      id: t.id,
      name: t.name,
      inviteCode: t.invite_code,
      ownerId: t.owner_id,
      maxMembers: MAX_MEMBERS,
    },
    me: { userId: req.session.userId, isOwner: req.isOwner },
    members: members.map((m) => ({
      userId: m.id, nickname: m.nickname, isOwner: m.id === t.owner_id, joinedAt: m.joined_at,
    })),
    fish: fish.map(fishView),
    pendingTasks: await require('./tasks').pendingCount(pool, t.id, req.session.userId, req.isOwner),
    serverTime: new Date().toISOString(),
  });
}));

module.exports = router;
