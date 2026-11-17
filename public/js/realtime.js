/* AQUABIT 실시간 (Socket.IO)
   연결되어 있는 동안 tank.js는 폴링을 멈추고, 여기서 받은 이벤트로 화면을 바꾼다.
   연결이 끊기면 자동으로 폴링으로 돌아가고, 다시 연결되면 빠진 채팅을 채운다. */
(function () {
  'use strict';
  let socket = null;
  let joined = false;

  window.AquaRealtime = { connected: () => !!(socket && socket.connected && joined) };

  function start() {
    const T = window.AquaTank;
    const esc = T.esc;
    const me = T.user.id;
    if (typeof io !== 'function') { console.warn('Socket.IO 스크립트를 못 불러와서 폴링으로 동작해요.'); return; }

    socket = io({ path: '/socket.io', transports: ['websocket', 'polling'] });

    socket.on('connect', () => {
      socket.emit('tank:join', T.tankId, async (res) => {
        joined = !!(res && res.ok);
        if (!joined) return;
        // 끊겨 있던 동안의 변경 채우기
        try {
          const { messages } = await Aqua.api(`/tanks/${T.tankId}/messages?after=${T.state.lastMsgId}`);
          T.appendMessages(messages);
        } catch (e) { /* 무시 */ }
        T.loadTank(false);
        T.loadWallet();
      });
    });
    socket.on('disconnect', () => { joined = false; });
    socket.on('auth:required', () => location.replace('/login.html?next=' + encodeURIComponent(location.pathname + location.search)));

    const who = (userId, nickname) => (userId === me ? '내' : `<b>${esc(nickname)}</b>님의`);
    const fishOwner = (fish) => who(fish.userId, fish.ownerNickname);

    // 채팅
    socket.on('chat:message', (m) => T.appendMessages([m]));

    // 입장
    socket.on('member:joined', (p) => {
      if (p.userId !== me) T.toast(`<b>${esc(p.nickname)}</b>님이 어항에 들어왔어요!`);
      T.loadTank(false);
    });

    // 먹이 주기: 다른 사람이 준 먹이는 그 물고기 위에서 떨어뜨려 보여 준다
    socket.on('fish:fed', (p) => {
      if (p.feederId === me) return; // 내가 준 건 이미 연출함
      const target = p.fish.userId === p.feederId ? '자기' : (p.fish.userId === me ? '내' : `<b>${esc(p.fish.ownerNickname)}</b>님의`);
      T.toast(`<b>${esc(p.feederNickname)}</b>님이 ${target} 물고기에게 먹이를 줬어요!`);
      const pos = T.scene.fishScreenPos(p.fish.id);
      if (pos) {
        T.scene.dropFood(pos.x + (Math.random() - 0.5) * 80, 90, p.fish.id, () => T.upsertFish(p.fish));
        // 화면이 뒤에 있어 애니메이션이 멈춰 있어도 데이터는 맞춘다
        setTimeout(() => T.upsertFish(p.fish), 8000);
      } else {
        T.upsertFish(p.fish);
      }
    });

    // 성장
    socket.on('fish:grew', (p) => {
      if (p.feederId === me) return; // 내가 준 먹이로 자란 건 tank.js가 LEVEL UP을 띄움
      T.toast(`${fishOwner(p.fish)} 물고기가 ${esc(p.stageName)} 물고기로 성장했어요!`, 4200);
      setTimeout(() => {
        T.upsertFish(p.fish);
        T.scene.sparkleBurst(p.fish.id, 24);
        T.scene.flash(p.fish.id);
        if (p.fish.userId === me) Fx.levelUp(p.fish, `${Aqua.josa(p.fish.name, '이', '가')} ${p.stageName} 물고기로 자랐어요!`);
      }, 1500);
    });

    // 꾸미기
    socket.on('fish:updated', (p) => { if (p.fish.userId !== me) T.upsertFish(p.fish); });

    // 출석 (내 출석은 팝업으로 이미 보여 줌)
    socket.on('attendance', (p) => {
      if (p.userId === me) return;
      const total = p.reward + (p.bonus || 0);
      T.toast(p.bonus
        ? `<b>${esc(p.nickname)}</b>님이 ${p.streak}일 연속 출석해서 ${total}진주를 받았어요!`
        : `<b>${esc(p.nickname)}</b>님이 출석해서 ${total}진주를 받았어요!`);
    });

    // 과제
    const refreshTasks = () => window.AquaTasks && window.AquaTasks.refresh();
    socket.on('task:created', ({ task }) => {
      if (task.assigneeId === me) T.toast(`새 과제가 왔어요: <b>${esc(task.title)}</b> (${task.reward}진주)`, 4200);
      refreshTasks();
    });
    socket.on('task:submitted', ({ task }) => {
      if (T.state.me.isOwner) T.toast(`<b>${esc(task.assigneeNickname)}</b>님이 과제를 제출했어요: ${esc(task.title)}`, 4200);
      refreshTasks();
    });
    socket.on('task:approved', ({ task }) => {
      if (task.assigneeId !== me) T.toast(`<b>${esc(task.assigneeNickname)}</b>님의 과제가 승인됐어요! +${task.reward}진주`);
      refreshTasks();
    });
    socket.on('task:rejected', ({ task }) => {
      if (task.assigneeId === me) T.toast(`과제가 반려됐어요: <b>${esc(task.title)}</b>. 고쳐서 다시 제출해 주세요.`, 5000);
      refreshTasks();
    });

    // 내 진주가 들어왔을 때 (과제 승인)
    socket.on('wallet:pearls', (p) => {
      T.toast(`<b>${esc(Aqua.josa(p.taskTitle, '이', '가'))}</b> 승인돼서 ${p.amount}진주를 받았어요!`, 4200);
      const badge = document.getElementById('actTasks').getBoundingClientRect();
      T.rewardPearls({ x: badge.left + badge.width / 2, y: badge.top }, p.amount, p.pearls);
    });
  }

  if (window.AquaTank && window.AquaTank.ready) start();
  else document.addEventListener('aquatank:ready', start, { once: true });
})();
