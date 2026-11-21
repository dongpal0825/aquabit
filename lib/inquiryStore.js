'use strict';

// data/inquiries.json 저장소
// - 요청이 동시에 와도 파일이 꼬이지 않도록 작업을 한 줄로 세워 순서대로 처리한다.
// - 임시 파일에 먼저 쓰고 이름을 바꿔서, 쓰는 도중 꺼져도 기존 파일이 깨지지 않게 한다.
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');

const FILE = path.join(config.paths.data, 'inquiries.json');
let queue = Promise.resolve();

function enqueue(task) {
  const run = queue.then(task, task);
  queue = run.catch(() => {});
  return run;
}

async function readAll() {
  try {
    const list = JSON.parse(await fs.readFile(FILE, 'utf8'));
    return Array.isArray(list) ? list : [];
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    // 파일이 깨졌으면 덮어쓰지 않도록 백업해 둔다.
    const backup = `${FILE}.broken-${Date.now()}`;
    await fs.rename(FILE, backup).catch(() => {});
    console.error(`[AQUABIT] inquiries.json을 읽을 수 없어 ${path.basename(backup)}로 옮겼습니다.`);
    return [];
  }
}

async function writeAll(list) {
  const tmp = `${FILE}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(list, null, 2) + '\n', 'utf8');
  await fs.rename(tmp, FILE);
}

function makeReceiptId(date) {
  // 서버의 현지 날짜 기준 (UTC로 하면 한국 시간 오전 9시 전 접수가 전날 날짜로 찍힘)
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  return `Q${ymd}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

/**
 * 문의를 저장한다. 같은 제출 토큰이 이미 있으면 새로 저장하지 않고 기존 기록을 돌려준다.
 * @returns {Promise<{ duplicate: boolean, record: object }>}
 */
function add(fields, submissionToken) {
  return enqueue(async () => {
    const list = await readAll();
    const existing = list.find((r) => r.submissionToken === submissionToken);
    if (existing) return { duplicate: true, record: existing };

    const now = new Date();
    const record = {
      id: makeReceiptId(now),
      createdAt: now.toISOString(),
      ...fields,
      mailStatus: 'pending',
      submissionToken,
    };
    list.push(record);
    await writeAll(list);
    return { duplicate: false, record };
  });
}

function updateMailStatus(id, mailStatus, mailError) {
  return enqueue(async () => {
    const list = await readAll();
    const record = list.find((r) => r.id === id);
    if (!record) return;
    record.mailStatus = mailStatus;
    if (mailError) record.mailError = mailError;
    else delete record.mailError;
    await writeAll(list);
  });
}

module.exports = { add, updateMailStatus };
