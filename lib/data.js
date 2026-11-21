'use strict';

// data 폴더의 JSON 파일을 읽는다.
// 요청마다 새로 읽기 때문에 JSON만 고치면 서버를 다시 켜지 않아도 바로 반영된다.
const fs = require('fs');
const path = require('path');
const config = require('../config');

function readJson(fileName, fallback = []) {
  const filePath = path.join(config.paths.data, fileName);
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.error(`[AQUABIT] ${fileName} 읽기 실패: ${err.message}`);
    return fallback;
  }
}

const NOTICE_CATEGORIES = {
  notice: '공지',
  update: '업데이트',
  maintenance: '점검',
  event: '이벤트',
};

// 공지사항: 게임 DB가 켜져 있으면 site_notices 표(관리자 화면에서 수정), 아니면 data/notices.json
// 최신 글이 먼저 오도록 정렬 (날짜가 같으면 id가 큰 글이 먼저)
async function getNotices() {
  let notices = null;
  if (require('../server/game/config').enabled) {
    try {
      const { pool } = require('../server/game/db');
      const [rows] = await pool.query(
        "SELECT id, category, title, body, DATE_FORMAT(notice_date, '%Y-%m-%d') AS date FROM site_notices"
      );
      notices = rows.map((r) => ({ ...r, body: String(r.body).split(/\r?\n/).map((s) => s.trim()).filter(Boolean) }));
    } catch (err) {
      console.error(`[AQUABIT] 공지 DB 읽기 실패, notices.json을 대신 씀: ${err.code || err.message}`);
    }
  }
  if (!notices) notices = readJson('notices.json');
  return notices
    .filter((n) => n && Number.isInteger(n.id))
    .map((n) => ({ ...n, categoryLabel: NOTICE_CATEGORIES[n.category] || '공지' }))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.id - a.id);
}

module.exports = {
  NOTICE_CATEGORIES,
  getNotices,
  getCareers: () => readJson('careers.json'),
  getFaq: () => readJson('faq.json'),
  getTeam: () => readJson('team.json'),
  getHistory: () => readJson('history.json'),
};
