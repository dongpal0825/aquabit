(async function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = Aqua.escapeHtml;

  const user = await Aqua.requireLogin();
  if (!user.isAdmin) { location.replace('/community/tanks.html'); return; }
  $('logoutBtn').addEventListener('click', Aqua.logout);

  function toast(html, ms = 3200) {
    const box = $('toasts');
    while (box.children.length >= 3) box.firstChild.remove();
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = html;
    box.appendChild(t);
    setTimeout(() => t.remove(), ms);
  }
  const fmtDate = (v) => (v ? new Date(v).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' }) : '-');

  // ── 탭 ──
  const loaders = { overview: loadOverview, tanks: loadTanks, users: loadUsers, notices: loadNoticeTargets };
  function showTab(name) {
    document.querySelectorAll('.admin-tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
    document.querySelectorAll('.admin-panel').forEach((p) => { p.hidden = p.id !== 'panel-' + name; });
    try { sessionStorage.setItem('aquabit.adminTab', name); } catch (e) { /* 무시 */ }
    loaders[name]().catch((e) => toast(esc(e.message)));
  }
  document.querySelectorAll('.admin-tab').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

  // ── 한눈에 ──
  async function loadOverview() {
    const o = await Aqua.api('/admin/overview');
    const items = [
      ['사용자', o.users, '명'], ['어항', o.tanks, '개'], ['진행 중 과제', o.openTasks, '개'],
      ['쌓인 채팅', o.messages, '개'], ['오늘 준 먹이', o.feedingsToday, '번'], ['돌고 있는 진주', o.pearlsInCirculation, ''],
    ];
    $('stats').innerHTML = items.map(([k, v, u]) => `<div class="stat"><dt>${k}</dt><dd class="pixel">${v.toLocaleString()}<small>${u}</small></dd></div>`).join('');
  }

  // ── 어항 ──
  let tanks = [];
  async function loadTanks() {
    tanks = (await Aqua.api('/admin/tanks')).tanks;
    const rows = $('tankRows');
    if (!tanks.length) { rows.innerHTML = '<tr><td colspan="7" class="empty">아직 어항이 없어요.</td></tr>'; return; }
    rows.innerHTML = tanks.map((t) => `
      <tr>
        <td><b>${esc(t.name)}</b><small>만든 날 ${fmtDate(t.createdAt)}</small></td>
        <td class="pixel">${t.inviteCode}</td>
        <td>${esc(t.ownerNickname)}<small>${esc(t.ownerUsername)}</small></td>
        <td><span class="count pixel">${t.members.length}/${t.maxMembers}</span>
          <ul class="chips">${t.members.map((m) => `<li${m.userId === t.ownerId ? ' class="owner"' : ''}>${esc(m.nickname)} <small>${esc(m.username)}${m.stage ? `, ${m.stage}단계` : ''}</small></li>`).join('')}</ul></td>
        <td class="num pixel">${t.openTasks}</td>
        <td class="num pixel">${t.messageCount}</td>
        <td class="actions">
          <button class="btn btn--small btn--foam" data-edit="${t.id}">수정</button>
          <button class="btn btn--small btn--foam" data-notice="${t.id}">공지</button>
          <button class="btn btn--small btn--coral" data-del="${t.id}">삭제</button>
        </td>
      </tr>`).join('');
    rows.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => openTankEdit(Number(b.dataset.edit))));
    rows.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => openDelete(Number(b.dataset.del))));
    rows.querySelectorAll('[data-notice]').forEach((b) => b.addEventListener('click', async () => {
      showTab('notices');
      await loadNoticeTargets();
      $('noticeTarget').value = b.dataset.notice;
      $('noticeBody').focus();
    }));
  }

  let editing = null;
  function openTankEdit(id) {
    editing = tanks.find((t) => t.id === id);
    $('tdName').value = editing.name;
    $('tdOwner').innerHTML = editing.members.map((m) => `<option value="${m.userId}"${m.userId === editing.ownerId ? ' selected' : ''}>${esc(m.nickname)} (${esc(m.username)})</option>`).join('');
    $('tdCode').checked = false;
    $('tdError').textContent = '';
    $('tankDialog').showModal();
  }
  $('tankForm').addEventListener('submit', async (e) => {
    if (!e.submitter || e.submitter.value !== 'ok') return;
    e.preventDefault();
    try {
      const r = await Aqua.api(`/admin/tanks/${editing.id}`, {
        method: 'PATCH',
        body: { name: $('tdName').value, ownerId: Number($('tdOwner').value), newInviteCode: $('tdCode').checked },
      });
      $('tankDialog').close();
      toast(r.changes.length ? `${esc(r.changes.join(', '))} 바꿨어요.` : '바뀐 것이 없어요.');
      loadTanks();
    } catch (ex) { $('tdError').textContent = ex.message; }
  });

  let deleting = null;
  function openDelete(id) {
    deleting = tanks.find((t) => t.id === id);
    $('delText').innerHTML = `<b>${esc(deleting.name)}</b> 어항을 삭제할까요? 되돌릴 수 없어요. 팀원 ${deleting.members.length}명의 물고기, 채팅, 과제가 모두 지워지고 지금 접속한 팀원은 목록 화면으로 나가요. 각자의 진주와 내역은 남아요.`;
    $('delError').textContent = '';
    $('delDialog').showModal();
  }
  $('delForm').addEventListener('submit', async (e) => {
    if (!e.submitter || e.submitter.value !== 'ok') return;
    e.preventDefault();
    try {
      await Aqua.api(`/admin/tanks/${deleting.id}`, { method: 'DELETE' });
      $('delDialog').close();
      toast(`<b>${esc(deleting.name)}</b> 어항을 삭제했어요.`);
      loadTanks();
    } catch (ex) { $('delError').textContent = ex.message; }
  });

  // ── 사용자 ──
  let users = [];
  let searchTimer;
  async function loadUsers() {
    const q = $('userSearch').value.trim();
    users = (await Aqua.api('/admin/users' + (q ? `?q=${encodeURIComponent(q)}` : ''))).users;
    const rows = $('userRows');
    if (!users.length) { rows.innerHTML = '<tr><td colspan="6" class="empty">찾는 사용자가 없어요.</td></tr>'; return; }
    rows.innerHTML = users.map((u) => {
      const acc = ['ribbon', 'hat', 'crown'].filter((k) => u.inventory[k]).map((k) => ({ ribbon: '리본', hat: '꽃', crown: '왕관' }[k]));
      return `
      <tr>
        <td><b>${esc(u.nickname)}</b>${u.isAdmin ? ' <span class="tag">관리자</span>' : ''}<small>${esc(u.username)}, 가입 ${fmtDate(u.createdAt)}</small></td>
        <td class="num pixel">${u.pearls.toLocaleString()}</td>
        <td>먹이 ${u.inventory.food}${acc.length ? `<small>${acc.join(', ')}</small>` : ''}</td>
        <td>${u.tanks.length ? `<ul class="chips">${u.tanks.map((t) => `<li${t.isOwner ? ' class="owner"' : ''}>${esc(t.name)}${t.isOwner ? ' <small>대표</small>' : ''}</li>`).join('')}</ul>` : '<span class="muted">없음</span>'}</td>
        <td>${u.lastAttendance || '<span class="muted">-</span>'}</td>
        <td class="actions">${u.isAdmin ? '' : `<button class="btn btn--small btn--sea" data-grant="${u.id}">지급</button>`}</td>
      </tr>`;
    }).join('');
    rows.querySelectorAll('[data-grant]').forEach((b) => b.addEventListener('click', () => openGrant(Number(b.dataset.grant))));
  }
  $('userSearch').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => loadUsers().catch((e) => toast(esc(e.message))), 250); });

  let granting = null;
  function openGrant(id) {
    granting = users.find((u) => u.id === id);
    $('grantWho').innerHTML = `<b>${esc(granting.nickname)}</b> (${esc(granting.username)}) 지금 진주 ${granting.pearls}, 먹이 ${granting.inventory.food}`;
    $('gPearls').value = '';
    $('gItem').value = '';
    $('gQty').value = 5;
    $('gReason').value = '';
    $('gError').textContent = '';
    $('grantDialog').showModal();
    $('gPearls').focus();
  }
  $('grantForm').addEventListener('submit', async (e) => {
    if (!e.submitter || e.submitter.value !== 'ok') return;
    e.preventDefault();
    const body = { pearls: $('gPearls').value === '' ? 0 : Number($('gPearls').value), reason: $('gReason').value };
    if ($('gItem').value) { body.item = $('gItem').value; body.quantity = Number($('gQty').value); }
    try {
      const r = await Aqua.api(`/admin/users/${granting.id}/grant`, { method: 'POST', body });
      $('grantDialog').close();
      toast(`${esc(r.summary)} 지급했어요.`);
      loadUsers();
    } catch (ex) { $('gError').textContent = ex.message; }
  });

  // ── 공지 ──
  async function loadNoticeTargets() {
    if (!tanks.length) tanks = (await Aqua.api('/admin/tanks')).tanks;
    const cur = $('noticeTarget').value;
    $('noticeTarget').innerHTML = `<option value="">모든 어항 (${tanks.length}개)</option>` + tanks.map((t) => `<option value="${t.id}">${esc(t.name)} (${t.members.length}명)</option>`).join('');
    if (cur) $('noticeTarget').value = cur;
  }
  $('noticeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('noticeError').textContent = '';
    try {
      const r = await Aqua.api('/admin/notices', {
        method: 'POST', body: { body: $('noticeBody').value, tankId: $('noticeTarget').value ? Number($('noticeTarget').value) : null },
      });
      $('noticeBody').value = '';
      toast(`어항 ${r.sentTo}개에 공지를 보냈어요.`);
    } catch (ex) { $('noticeError').textContent = ex.message; }
  });

  let start = 'overview';
  try { start = sessionStorage.getItem('aquabit.adminTab') || 'overview'; } catch (e) { /* 무시 */ }
  showTab(loaders[start] ? start : 'overview');
})();
