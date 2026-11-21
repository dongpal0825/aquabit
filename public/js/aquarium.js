/* 메인 배너의 픽셀 아쿠아리움 (Canvas)
 * - 캔버스를 실제 크기보다 작게(픽셀 한 칸 = 4~5px) 만들고 CSS로 늘려 픽셀 느낌을 낸다.
 * - 움직임 줄이기 설정이 켜져 있으면 한 장면만 그리고 멈춘다.
 * - 화면에 보이지 않거나 탭이 숨겨지면 애니메이션을 멈춘다.
 */
(function () {
  'use strict';

  var canvas = document.getElementById('aquarium-canvas');
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext('2d');
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  var INK = '#0b1d3a';

  // ---------- 스프라이트 (왼쪽을 보는 물고기) ----------
  // K: 테두리, A: 몸, L: 배, C: 꼬리, W: 눈 반짝임
  var SPRITES = {
    big: [
      '....KKKKKK......',
      '..KKAAAAAAKK..KK',
      '.KAWAAAAAAAAKKCK',
      'KAAKAAAAAAAAAKCK',
      'KAAAAAAAAAAAACCK',
      'KLLLLLAAAAAAAKCK',
      '.KLLLLLLLAAAKKCK',
      '..KKLLLLLLKK..KK',
      '....KKKKKK......',
    ],
    small: [
      '..KKKK.KK',
      '.KAAAAKCK',
      'KAKAAAACK',
      '.KLLLLKCK',
      '..KKKK.KK',
    ],
    round: [
      '...KKKKK.....',
      '..KAAAAAK..KK',
      '.KAWAAAAAK.KCK',
      'KAAKAAAAAAKCCK',
      'KAAAAAAAAAACCK',
      'KLLLLAAAAAKCCK',
      '.KLLLLLAAK.KCK',
      '..KLLLLLK..KK',
      '...KKKKK.....',
    ],
  };

  var PALETTES = [
    { A: '#4fd1e8', L: '#c9f3ff', C: '#ff7a6b' },
    { A: '#ff9a3c', L: '#ffe0b0', C: '#ffd34e' },
    { A: '#ff7aa8', L: '#ffd1e1', C: '#a99bff' },
    { A: '#ffd34e', L: '#fff3c4', C: '#2b8be8' },
    { A: '#5fe3b0', L: '#d4fff0', C: '#ff7a6b' },
  ];

  // 스프라이트를 미리 작은 캔버스에 그려 둔다. (매 프레임 칸을 하나하나 그리지 않도록)
  var spriteCache = {};
  function getSprite(name, paletteIndex, flip) {
    var key = name + paletteIndex + (flip ? 'f' : '');
    if (spriteCache[key]) return spriteCache[key];
    var grid = SPRITES[name];
    var w = 0;
    grid.forEach(function (row) { w = Math.max(w, row.length); });
    var c = document.createElement('canvas');
    c.width = w;
    c.height = grid.length;
    var g = c.getContext('2d');
    var pal = PALETTES[paletteIndex];
    grid.forEach(function (row, y) {
      for (var x = 0; x < row.length; x++) {
        var ch = row[x];
        if (ch === '.') continue;
        g.fillStyle = ch === 'K' ? INK : ch === 'W' ? '#ffffff' : pal[ch];
        g.fillRect(flip ? w - 1 - x : x, y, 1, 1);
      }
    });
    spriteCache[key] = c;
    return c;
  }

  // ---------- 장면 ----------
  var W = 0, H = 0, sandTop = 0;
  var fishes = [], bubbles = [], weeds = [], rocks = [], sparkles = [];

  function rand(min, max) { return min + Math.random() * (max - min); }
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

  function makeFish(anywhere) {
    var name = pick(['big', 'small', 'small', 'round']);
    var dir = Math.random() < 0.5 ? -1 : 1;
    var sprite = SPRITES[name];
    var w = sprite[0].length + 1;
    return {
      name: name,
      palette: Math.floor(Math.random() * PALETTES.length),
      dir: dir,
      w: w,
      x: anywhere ? rand(0, W) : dir > 0 ? -w : W + w,
      baseY: rand(H * 0.12, sandTop - sprite.length - 4),
      speed: rand(name === 'small' ? 10 : 6, name === 'small' ? 20 : 13),
      amp: rand(1, 3),
      freq: rand(0.6, 1.4),
      phase: rand(0, Math.PI * 2),
    };
  }

  function makeBubble(anywhere) {
    return {
      x: rand(0, W),
      y: anywhere ? rand(0, sandTop) : sandTop - 1,
      size: Math.random() < 0.3 ? 2 : 1,
      speed: rand(6, 14),
      phase: rand(0, Math.PI * 2),
    };
  }

  function buildScene() {
    var rect = canvas.getBoundingClientRect();
    var cssW = Math.max(1, rect.width);
    var cssH = Math.max(1, rect.height);
    var px = cssW < 600 ? 4 : 5;
    W = Math.ceil(cssW / px);
    H = Math.ceil(cssH / px);
    canvas.width = W;
    canvas.height = H;
    // 하단의 물결 띠(16px)에 가리는 만큼 모래를 넉넉하게 둔다.
    sandTop = H - Math.max(10, Math.round(H * 0.11));

    var fishCount = Math.round(Math.min(14, Math.max(5, W / 28)));
    fishes = [];
    for (var i = 0; i < fishCount; i++) fishes.push(makeFish(true));

    bubbles = [];
    for (var b = 0; b < Math.round(W / 10); b++) bubbles.push(makeBubble(true));

    weeds = [];
    var wx = rand(4, 16);
    while (wx < W - 4) {
      weeds.push({
        x: Math.round(wx),
        h: Math.round(rand(H * 0.12, H * 0.32)),
        phase: rand(0, Math.PI * 2),
        color: Math.random() < 0.5 ? '#1f9d6b' : '#2fbf85',
      });
      wx += rand(14, 40);
    }

    rocks = [];
    for (var r = 0; r < Math.round(W / 45); r++) {
      rocks.push({ x: Math.round(rand(0, W)), w: Math.round(rand(6, 12)), h: Math.round(rand(3, 6)) });
    }

    sparkles = [];
    for (var s = 0; s < Math.round(W / 16); s++) {
      sparkles.push({ x: Math.round(rand(0, W)), y: Math.round(rand(0, H * 0.6)), phase: rand(0, Math.PI * 2) });
    }
  }

  // ---------- 그리기 ----------
  var WATER = ['#1d78d6', '#1a6fcb', '#1565c0', '#1358a9', '#114b92', '#0f3f7a', '#0f2f5c'];

  function drawWater(t) {
    var band = Math.ceil(sandTop / WATER.length);
    for (var i = 0; i < WATER.length; i++) {
      ctx.fillStyle = WATER[i];
      ctx.fillRect(0, i * band, W, band + 1);
    }
    // 위에서 내려오는 빛줄기
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    for (var k = 0; k < 4; k++) {
      var base = ((k * W) / 4 + t * 2) % (W + 40) - 20;
      for (var y = 0; y < sandTop * 0.8; y += 2) {
        ctx.fillRect(Math.round(base + y * 0.35), y, 6, 2);
      }
    }
    // 반짝이는 물 입자
    sparkles.forEach(function (s) {
      var a = (Math.sin(t * 1.6 + s.phase) + 1) / 2;
      if (a > 0.6) {
        ctx.fillStyle = 'rgba(227,246,255,' + ((a - 0.6) * 1.5).toFixed(2) + ')';
        ctx.fillRect(s.x, s.y, 1, 1);
      }
    });
  }

  function drawSand() {
    // 계단 모양 모래 윗면
    ctx.fillStyle = '#e7c46a';
    for (var x = 0; x < W; x += 6) {
      var bump = (x / 6) % 3 === 0 ? 1 : 0;
      ctx.fillRect(x, sandTop - bump, 6, H - sandTop + bump);
    }
    ctx.fillStyle = '#ffe6a3';
    ctx.fillRect(0, sandTop + 1, W, H - sandTop);
    // 모래 점무늬 (자리 고정)
    ctx.fillStyle = '#d9b25a';
    for (var i = 0; i < W; i += 5) {
      var y = sandTop + 2 + ((i * 7) % Math.max(1, H - sandTop - 2));
      ctx.fillRect(i, y, 1, 1);
    }
    rocks.forEach(function (r) {
      ctx.fillStyle = INK;
      ctx.fillRect(r.x, sandTop - r.h, r.w, r.h + 1);
      ctx.fillStyle = '#6f86a6';
      ctx.fillRect(r.x + 1, sandTop - r.h + 1, r.w - 2, r.h);
      ctx.fillStyle = '#9fb3cc';
      ctx.fillRect(r.x + 1, sandTop - r.h + 1, Math.max(1, Math.floor(r.w / 3)), 1);
    });
  }

  function drawWeeds(t) {
    weeds.forEach(function (w) {
      for (var y = 0; y < w.h; y++) {
        var sway = Math.round(Math.sin(t * 1.2 + w.phase + y * 0.25) * (y / w.h) * 3);
        ctx.fillStyle = INK;
        ctx.fillRect(w.x + sway - 1, sandTop - y, 4, 1);
        ctx.fillStyle = w.color;
        ctx.fillRect(w.x + sway, sandTop - y, 2, 1);
        if (y % 6 === 3) { // 잎
          ctx.fillStyle = w.color;
          ctx.fillRect(w.x + sway + (y % 12 === 3 ? 2 : -2), sandTop - y, 2, 1);
        }
      }
    });
  }

  function drawBubbles(t, dt) {
    bubbles.forEach(function (b, i) {
      b.y -= b.speed * dt;
      if (b.y < -2) bubbles[i] = makeBubble(false);
      var x = Math.round(b.x + Math.sin(t * 2 + b.phase) * 1.5);
      var y = Math.round(b.y);
      ctx.fillStyle = 'rgba(227,246,255,0.85)';
      if (b.size === 1) {
        ctx.fillRect(x, y, 1, 1);
      } else {
        ctx.fillRect(x + 1, y, 1, 1);
        ctx.fillRect(x, y + 1, 1, 1);
        ctx.fillRect(x + 2, y + 1, 1, 1);
        ctx.fillRect(x + 1, y + 2, 1, 1);
      }
    });
  }

  function drawFishes(t, dt) {
    fishes.forEach(function (f, i) {
      f.x += f.dir * f.speed * dt;
      if ((f.dir > 0 && f.x > W + f.w) || (f.dir < 0 && f.x < -f.w * 2)) {
        fishes[i] = makeFish(false);
        return;
      }
      // 스프라이트는 왼쪽을 보므로, 오른쪽으로 갈 때 뒤집는다.
      var sprite = getSprite(f.name, f.palette, f.dir > 0);
      var y = Math.round(f.baseY + Math.sin(t * f.freq + f.phase) * f.amp);
      ctx.drawImage(sprite, Math.round(f.x), y);
    });
  }

  // ---------- 반복 ----------
  var rafId = 0, last = 0, elapsed = 0, visible = true;

  function frame(now) {
    var dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    elapsed += dt;
    render(elapsed, dt);
    rafId = window.requestAnimationFrame(frame);
  }

  function render(t, dt) {
    ctx.imageSmoothingEnabled = false;
    drawWater(t);
    drawWeeds(t);
    drawSand();
    drawFishes(t, dt);
    drawBubbles(t, dt);
  }

  function start() {
    if (rafId || reduceMotion.matches || !visible || document.hidden) return;
    last = 0;
    rafId = window.requestAnimationFrame(frame);
  }

  function stop() {
    if (rafId) window.cancelAnimationFrame(rafId);
    rafId = 0;
  }

  function refresh() {
    stop();
    buildScene();
    render(elapsed, 0); // 멈춘 상태에서도 한 장면은 보이도록
    start();
  }

  // 창 크기가 바뀌면 장면을 다시 만든다. (너무 자주 하지 않도록 잠시 기다림)
  var resizeTimer = 0;
  window.addEventListener('resize', function () {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(refresh, 150);
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stop();
    else start();
  });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      if (visible) start();
      else stop();
    }).observe(canvas);
  }

  var onMotionChange = function () {
    if (reduceMotion.matches) stop();
    else start();
  };
  if (reduceMotion.addEventListener) reduceMotion.addEventListener('change', onMotionChange);
  else if (reduceMotion.addListener) reduceMotion.addListener(onMotionChange);

  refresh();
})();
