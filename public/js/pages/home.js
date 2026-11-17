(async function () {
  'use strict';
  const PA = window.PixelArt;

  // 로그인 상태면 상단 버튼을 바꾼다
  Aqua.currentUser().then((user) => {
    if (!user) return;
    document.getElementById('navActions').innerHTML =
      `<a class="btn btn--small" href="/tanks.html">내 어항으로</a>`;
    const cta = document.getElementById('ctaPrimary');
    cta.href = '/tanks.html';
  });

  await Aqua.fontsReady();

  // 히어로: 예시 물고기가 헤엄치는 어항
  const demo = [
    { id: 1, ownerNickname: '민규', species: 'goldfish', color: 'orange', accessory: 'crown', stage: 4, status: 'healthy' },
    { id: 2, ownerNickname: '수빈', species: 'tropical', color: 'sky', accessory: null, stage: 3, status: 'healthy' },
    { id: 3, ownerNickname: '지우', species: 'puffer', color: 'lemon', accessory: 'ribbon', stage: 2, status: 'healthy' },
    { id: 4, ownerNickname: '하린', species: 'goldfish', color: 'coral', accessory: 'hat', stage: 2, status: 'hungry' },
    { id: 5, ownerNickname: '도윤', species: 'tropical', color: 'grape', accessory: null, stage: 1, status: 'healthy' },
    { id: 6, ownerNickname: '서연', species: 'puffer', color: 'mint', accessory: null, stage: 1, status: 'healthy' },
  ];
  const scene = new TankScene(document.getElementById('heroTank'), {
    labels: true,
    interactive: true,
    // 넓은 화면에서는 글자가 있는 왼쪽을 비워 둔다
    swimLeft: () => (window.innerWidth >= 900 ? 0.52 : 0),
    swimTop: () => (window.innerWidth < 900 ? 0.62 : 0),
    onFishClick: (f) => scene.sparkleBurst(f.id, 14),
  });
  scene.setFish(demo);
  scene.start();

  // 성장 4단계
  const strip = document.getElementById('growStrip');
  const base = window.innerWidth < 560 ? 3 : 4;
  [1, 2, 3, 4].forEach((stage) => {
    const el = document.createElement('div');
    el.className = 'grow-stage';
    const box = document.createElement('div');
    box.className = 'grow-fishbox';
    const c = PA.previewCanvas({ species: 'goldfish', color: 'orange', stage }, Math.round(base * PA.STAGE_SCALE[stage]), stage % 2);
    box.appendChild(c);
    if (stage === 4) {
      [[8, 20], [86, 8], [92, 62], [20, 70]].forEach(([x, y], i) => {
        const s = document.createElement('i');
        s.className = 'twinkle';
        s.style.left = x + '%'; s.style.top = y + '%';
        s.style.animationDelay = i * 0.4 + 's';
        box.appendChild(s);
      });
    }
    const label = document.createElement('div');
    label.className = 'grow-label';
    label.innerHTML = `<strong>${stage}단계 ${PA.STAGE_NAMES[stage]}</strong><span>${stage === 1 ? '처음 모습' : `먹이 ${PA.STAGE_NEED[stage]}개`}</span>`;
    el.append(box, label);
    strip.appendChild(el);
  });
})();
