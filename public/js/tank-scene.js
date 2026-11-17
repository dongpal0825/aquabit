/* AQUABIT 어항 장면 (Canvas)
   - scene 캔버스: 화면의 1/PX 해상도로 그린 뒤 픽셀 그대로 확대 (물, 모래, 수초, 거품, 물고기)
   - overlay 캔버스: 선명한 해상도로 이름표, 말풍선 같은 글자를 그린다
   동시에 움직이는 효과 수는 limits로 묶어 둔다. */
(function () {
  'use strict';
  const PA = window.PixelArt;
  const PX = 2;          // 장면 픽셀 1칸 = CSS 2px
  // 물고기 지도 1칸 = 장면 픽셀 2칸 (1단계 기준). 좁은 화면에서는 1칸으로 줄인다.
  const fishUnit = (cssW) => (cssW < 600 ? 1 : 2);

  const WATER_BANDS = ['#9ff0ef', '#86e6ea', '#6edae4', '#58cddd', '#45bfd5', '#36b0cc', '#2ba1c3', '#2392b9', '#1d84ae', '#1977a3'];
  const KELP_COLORS = ['#2f9e6e', '#3fbf84', '#237c57'];

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rand = (a, b) => a + Math.random() * (b - a);

  class TankScene {
    /**
     * @param {HTMLElement} host  두 캔버스를 넣을 요소 (position: relative/absolute 필요)
     * @param {object} opts { labels, maxBubbles, onFishClick, onWaterClick, interactive }
     */
    constructor(host, opts = {}) {
      this.host = host;
      this.opts = Object.assign({ labels: true, maxBubbles: 14, maxFx: 60, interactive: true }, opts);
      this.scene = document.createElement('canvas');
      this.overlay = document.createElement('canvas');
      for (const c of [this.scene, this.overlay]) {
        Object.assign(c.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block' });
        host.appendChild(c);
      }
      this.scene.style.imageRendering = 'pixelated';
      this.scene.setAttribute('aria-hidden', 'true');
      this.overlay.setAttribute('aria-hidden', 'true');
      this.sctx = this.scene.getContext('2d');
      this.octx = this.overlay.getContext('2d');

      this.fish = new Map();     // id → 물고기 개체
      this.bubbles = [];
      this.pellets = [];         // 떨어지는 먹이
      this.fx = [];              // 반짝이 등 짧은 효과
      this.texts = [];           // 떠오르는 글자 (냠!)
      this.speech = new Map();   // 물고기 id → 채팅 말풍선 { text, age, life }
      this.quality = 1;          // 1 보통, 0 가볍게 (느린 컴퓨터에서 자동 전환)
      this._slowTime = 0;
      this.kelp = [];
      this.t = 0;
      this.selectedId = null;
      this.highlightId = null;
      this.running = false;

      this._onResize = () => this.resize();
      window.addEventListener('resize', this._onResize);
      if (this.opts.interactive) {
        this.overlay.addEventListener('pointerdown', (e) => this._onPointer(e));
        this.overlay.addEventListener('pointermove', (e) => this._onHover(e));
      }
      this._onVis = () => { if (!document.hidden && this.running) { this._last = performance.now(); } };
      document.addEventListener('visibilitychange', this._onVis);
      this.resize();
    }

    // ── 크기와 배경 ───────────────────────────
    resize() {
      const r = this.host.getBoundingClientRect();
      this.cssW = Math.max(1, r.width);
      this.cssH = Math.max(1, r.height);
      this.W = Math.ceil(this.cssW / PX);
      this.H = Math.ceil(this.cssH / PX);
      this.scene.width = this.W;
      this.scene.height = this.H;
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.overlay.width = Math.round(this.cssW * this.dpr);
      this.overlay.height = Math.round(this.cssH * this.dpr);
      this.sandY = Math.round(this.H * 0.86);
      this._buildBackground();
      this._buildKelp();
      for (const f of this.fish.values()) this._clampFish(f);
    }

    _buildBackground() {
      const c = document.createElement('canvas');
      c.width = this.W; c.height = this.H;
      const g = c.getContext('2d');
      // 계단식 물빛 띠
      const bandH = this.sandY / WATER_BANDS.length;
      WATER_BANDS.forEach((col, i) => {
        g.fillStyle = col;
        g.fillRect(0, Math.floor(i * bandH), this.W, Math.ceil(bandH) + 1);
        // 띠 경계에 디더링 한 줄
        if (i > 0) {
          g.fillStyle = WATER_BANDS[i - 1];
          const y = Math.floor(i * bandH);
          for (let x = (i % 2); x < this.W; x += 2) g.fillRect(x, y, 1, 1);
        }
      });
      // 모래 바닥: 울퉁불퉁한 윗선 + 점무늬
      for (let x = 0; x < this.W; x++) {
        const top = this.sandY + Math.round(Math.sin(x * 0.045) * 2 + Math.sin(x * 0.13) * 1);
        g.fillStyle = '#f5d98f';
        g.fillRect(x, top, 1, this.H - top);
        g.fillStyle = '#fbe9b4';
        g.fillRect(x, top, 1, 1);
      }
      const speck = ['#e3c172', '#d6ac55', '#fff1c4'];
      for (let i = 0; i < this.W * 1.2; i++) {
        g.fillStyle = speck[i % 3];
        g.fillRect(Math.floor(rand(0, this.W)), Math.floor(rand(this.sandY + 4, this.H)), 1, 1);
      }
      // 조약돌
      for (let i = 0; i < Math.max(4, this.W / 60); i++) {
        const x = Math.floor(rand(4, this.W - 8)), y = Math.floor(rand(this.sandY + 5, this.H - 4));
        const w = Math.random() < 0.5 ? 4 : 6;
        g.fillStyle = '#9fb4c2'; g.fillRect(x, y, w, 3);
        g.fillStyle = '#c9d8e2'; g.fillRect(x + 1, y, w - 2, 1);
        g.fillStyle = '#6f8698'; g.fillRect(x, y + 2, w, 1);
      }
      this.bg = c;
    }

    _buildKelp() {
      this.kelp = [];
      const n = Math.max(3, Math.round(this.W / 70));
      for (let i = 0; i < n; i++) {
        const x = Math.round((i + 0.5) * (this.W / n) + rand(-18, 18));
        const len = Math.round(rand(this.H * 0.18, this.H * 0.42));
        this.kelp.push({ x, len, phase: rand(0, 6.28), color: KELP_COLORS[i % KELP_COLORS.length], blades: Math.random() < 0.5 ? 2 : 1 });
      }
    }

    // ── 물고기 데이터 ─────────────────────────
    /** 서버에서 받은 물고기 목록으로 갱신 (위치는 유지) */
    setFish(list) {
      const seen = new Set();
      for (const d of list) {
        seen.add(d.id);
        let f = this.fish.get(d.id);
        if (!f) {
          f = {
            id: d.id, data: d,
            x: rand(this.W * 0.15, this.W * 0.85), y: rand(this.H * 0.2, this.sandY - 20),
            vx: 0, vy: 0, tx: 0, ty: 0, facing: Math.random() < 0.5 ? 1 : -1,
            speed: rand(16, 24), retarget: 0, frameT: rand(0, 1), frame: 0, bob: rand(0, 6.28),
            chase: null,
          };
          this.fish.set(d.id, f);
          f.data = d;
          const b = this._bounds(f);
          f.x = rand(b.minX, Math.max(b.minX, b.maxX));
          f.y = rand(Math.min(b.minY, b.maxY), b.maxY);
          this._newTarget(f);
        }
        f.data = d;
        this._clampFish(f);
      }
      for (const id of [...this.fish.keys()]) if (!seen.has(id)) this.fish.delete(id);
    }

    getFish(id) { const f = this.fish.get(id); return f && f.data; }

    _unit(f) { return fishUnit(this.cssW) * PA.STAGE_SCALE[f.data.stage || 1]; }

    _size(f) {
      const sp = PA.SPECIES[f.data.species] || PA.SPECIES.goldfish;
      const u = this._unit(f);
      return { w: sp.rows[0].length * u, h: sp.rows.length * u };
    }

    _bounds(f) {
      const s = this._size(f);
      const sad = f.data.status === 'sad';
      // 먹이를 쫓을 때는 어항 어디든 갈 수 있다
      if (f.chase) return { minX: 4 + s.w / 2, maxX: this.W - 4 - s.w / 2, minY: 8 + s.h / 2, maxY: this.sandY - s.h / 2 - 2 };
      // swimLeft: 0~1, 이 비율보다 왼쪽으로는 헤엄치지 않는다 (홈 히어로 글자 영역 비우기)
      const left = typeof this.opts.swimLeft === 'function' ? this.opts.swimLeft() : (this.opts.swimLeft || 0);
      // swimRight: 0~1, 오른쪽에서 이 비율만큼은 비운다 (채팅 패널 뒤로 숨지 않게)
      const right = typeof this.opts.swimRight === 'function' ? this.opts.swimRight() : (this.opts.swimRight || 0);
      // swimTop: 0~1, 위쪽에서 이 비율만큼은 비운다 (좁은 화면 홈에서 글자 영역)
      const top = typeof this.opts.swimTop === 'function' ? this.opts.swimTop() : (this.opts.swimTop || 0);
      return {
        minX: Math.max(4 + s.w / 2, this.W * left + s.w / 2),
        maxX: Math.max(4 + s.w / 2, this.W * (1 - right) - 4 - s.w / 2),
        minY: Math.max(sad ? this.sandY - s.h * 1.6 - 10 : 18 + s.h / 2, Math.min(this.H * top, this.sandY - s.h) + s.h / 2),
        maxY: this.sandY - s.h / 2 - 2,
      };
    }

    _clampFish(f) {
      const b = this._bounds(f);
      if (b.maxX < b.minX) b.maxX = b.minX;
      f.x = Math.min(b.maxX, Math.max(b.minX, f.x));
      f.y = Math.min(b.maxY, Math.max(Math.min(b.minY, b.maxY), f.y));
    }

    _newTarget(f) {
      const b = this._bounds(f);
      f.tx = rand(b.minX, Math.max(b.minX, b.maxX));
      f.ty = rand(Math.min(b.minY, b.maxY), b.maxY);
      f.retarget = rand(3, 7);
    }

    // ── 먹이 ─────────────────────────────────
    /** 화면 좌표(CSS px)에 먹이를 떨어뜨리고 fishId 물고기가 쫓아가 먹는다 */
    dropFood(cssX, cssY, fishId, onEaten) {
      // 동시에 떨어지는 먹이 수 제한: 넘치면 가장 오래된 것을 바로 먹은 것으로 처리
      if (this.pellets.length >= 6) this._eatPellet(this.pellets[0], this.fish.get(this.pellets[0].fishId));
      const p = { x: cssX / PX, y: Math.max(6, cssY / PX), vy: 6, fishId, onEaten, eaten: false, wobble: rand(0, 6) };
      this.pellets.push(p);
      const f = this.fish.get(fishId);
      if (f) f.chase = p;
      return p;
    }

    // ── 효과 ─────────────────────────────────
    sparkleBurst(fishId, count = 18) {
      const f = this.fish.get(fishId);
      if (!f) return;
      for (let i = 0; i < count && this.fx.length < this.opts.maxFx; i++) {
        const a = rand(0, Math.PI * 2), sp = rand(14, 40);
        this.fx.push({ kind: 'spark', x: f.x, y: f.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.6, 1.1), age: 0 });
      }
    }

    _eatPellet(p, f) {
      if (!p || p.eaten) return;
      p.eaten = true;
      if (f) {
        f.chase = null;
        this._newTarget(f);
        // 부스러기와 '냠!'
        for (let i = 0; i < 6 && this.fx.length < this.opts.maxFx; i++) {
          const a = rand(0, Math.PI * 2), sp = rand(8, 22);
          this.fx.push({ kind: 'crumb', x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 6, life: rand(0.4, 0.7), age: 0 });
        }
        this.floatText(f.id, '냠!');
      }
      if (p.onEaten) p.onEaten(f ? f.data : null);
    }

    /** 물고기 위로 글자가 떠올랐다 사라진다 */
    floatText(fishId, text) {
      const f = this.fish.get(fishId);
      if (!f) return;
      if (this.texts.length >= 8) this.texts.shift();
      const s = this._size(f);
      this.texts.push({ x: f.x, y: f.y - s.h / 2, text, age: 0, life: 1.1 });
    }

    /** 채팅 말풍선: 물고기 위에 잠깐 떴다가 사라진다 (물고기마다 하나, 새 말이 오면 바꿔 씀) */
    say(fishId, text, seconds) {
      if (!this.fish.has(fishId)) return;
      const t = String(text).replace(/\s+/g, ' ').trim();
      if (!t) return;
      const life = seconds || Math.min(7, 3.5 + t.length * 0.08); // 긴 말은 조금 더 오래
      this.speech.set(fishId, { text: t, age: 0, life });
    }

    /** 성장할 때 물고기가 하얗게 깜빡인다 */
    flash(fishId, seconds = 1.2) {
      const f = this.fish.get(fishId);
      if (f) f.flash = seconds;
    }

    /** 물고기의 화면 위치 (CSS px) */
    fishScreenPos(id) {
      const f = this.fish.get(id);
      return f ? { x: f.x * PX, y: f.y * PX } : null;
    }

    // ── 루프 ─────────────────────────────────
    start() {
      if (this.running) return;
      this.running = true;
      this._last = performance.now();
      const loop = (now) => {
        if (!this.running) return;
        const raw = (now - this._last) / 1000;
        const dt = Math.min(0.05, raw);
        this._last = now;
        // 프레임이 2초 넘게 느리면(약 30fps 미만) 가벼운 모드로: 거품, 빛줄기, 효과 줄이기
        if (!document.hidden && raw < 0.5) {
          this._slowTime = raw > 0.034 ? this._slowTime + raw : Math.max(0, this._slowTime - raw * 0.5);
          if (this.quality === 1 && this._slowTime > 2) {
            this.quality = 0;
            this.opts.maxBubbles = Math.min(this.opts.maxBubbles, 5);
            this.opts.maxFx = 24;
          }
        }
        if (!document.hidden) {
          this.update(reduceMotion ? dt * 0.4 : dt);
          this.draw();
        }
        this._raf = requestAnimationFrame(loop);
      };
      this._raf = requestAnimationFrame(loop);
    }

    stop() { this.running = false; cancelAnimationFrame(this._raf); }

    destroy() {
      this.stop();
      window.removeEventListener('resize', this._onResize);
      document.removeEventListener('visibilitychange', this._onVis);
      this.scene.remove(); this.overlay.remove();
    }

    update(dt) {
      this.t += dt;

      // 거품: 바닥과 수초에서 천천히 올라간다
      if (!reduceMotion && this.bubbles.length < this.opts.maxBubbles && Math.random() < dt * 2.2) {
        const k = this.kelp.length && Math.random() < 0.5 ? this.kelp[Math.floor(Math.random() * this.kelp.length)] : null;
        this.bubbles.push({ x: k ? k.x : rand(0, this.W), y: this.sandY - 2, r: Math.random() < 0.3 ? 2 : 1, vy: rand(10, 22), ph: rand(0, 6) });
      }
      for (const b of this.bubbles) { b.y -= b.vy * dt; b.ph += dt * 3; }
      this.bubbles = this.bubbles.filter((b) => b.y > 4);

      // 먹이: 천천히 가라앉는다
      for (const p of this.pellets) {
        if (p.eaten) continue;
        p.vy = Math.min(16, p.vy + dt * 5);
        p.y = Math.min(this.sandY - 3, p.y + p.vy * dt);
        p.wobble += dt * 4;
      }

      // 물고기
      for (const f of this.fish.values()) this._updateFish(f, dt);
      // 오래 못 먹은 먹이(12초)는 먹은 것으로 처리해서 화면이 서버 결과와 어긋나지 않게 한다
      for (const p of this.pellets) {
        p.age = (p.age || 0) + dt;
        if (!p.eaten && p.age > 12) this._eatPellet(p, this.fish.get(p.fishId));
      }
      this.pellets = this.pellets.filter((p) => !p.eaten);

      for (const [id, sp] of this.speech) {
        sp.age += dt;
        if (sp.age >= sp.life || !this.fish.has(id)) this.speech.delete(id);
      }
      for (const t of this.texts) t.age += dt;
      this.texts = this.texts.filter((t) => t.age < t.life);

      // 효과
      for (const e of this.fx) { e.age += dt; e.x += e.vx * dt; e.y += e.vy * dt; e.vx *= 0.94; e.vy *= 0.94; }
      this.fx = this.fx.filter((e) => e.age < e.life);
    }

    _updateFish(f, dt) {
      const st = f.data.status;
      const mood = st === 'sad' ? 0.35 : st === 'hungry' ? 0.65 : 1;
      let maxSp = f.speed * mood;
      let tx = f.tx, ty = f.ty;

      if (f.chase && !f.chase.eaten) {
        tx = f.chase.x; ty = f.chase.y;
        maxSp = f.speed * 2.6;
        const s = this._size(f);
        const mouthX = f.x + f.facing * s.w * 0.42;
        // 바닥에 가라앉은 먹이도 먹을 수 있게 세로 범위는 몸 높이의 절반 + 여유
        if (Math.abs(mouthX - tx) < 4 + s.w * 0.12 && Math.abs(f.y - ty) < 4 + s.h * 0.5) {
          this._eatPellet(f.chase, f);
        }
      } else {
        if (f.chase) f.chase = null;
        f.retarget -= dt;
        if (f.retarget <= 0 || Math.hypot(tx - f.x, ty - f.y) < 4) this._newTarget(f);
      }

      const dx = tx - f.x, dy = ty - f.y;
      const dist = Math.hypot(dx, dy) || 1;
      const accel = f.chase ? 90 : 26;
      f.vx += (dx / dist) * accel * dt;
      f.vy += (dy / dist) * accel * dt * 0.7;
      const sp = Math.hypot(f.vx, f.vy);
      if (sp > maxSp) { f.vx *= maxSp / sp; f.vy *= maxSp / sp; }
      f.vx *= 0.995; f.vy *= 0.97;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      if (f.vx > 1.5) f.facing = 1; else if (f.vx < -1.5) f.facing = -1;
      this._clampFish(f);

      // 꼬리 흔들기: 빨리 헤엄칠수록 자주
      f.frameT += dt * (1.6 + Math.hypot(f.vx, f.vy) / 6) * (reduceMotion ? 0.4 : 1);
      f.frame = Math.floor(f.frameT * 2) % 2;
      f.bob += dt * 2 * mood;
      if (f.flash > 0) f.flash -= dt;
    }

    draw() {
      const g = this.sctx;
      g.imageSmoothingEnabled = false;
      g.drawImage(this.bg, 0, 0);
      if (this.quality) this._drawRays(g);
      this._drawSurface(g);
      this._drawKelp(g, 0);

      for (const p of this.pellets) {
        if (p.eaten) continue;
        const ic = PA.icon('pellet');
        g.drawImage(ic, Math.round(p.x + Math.sin(p.wobble) * 1.5) - 3, Math.round(p.y) - 3, 6, 6);
      }

      const list = [...this.fish.values()].sort((a, b) => (a.data.stage || 1) - (b.data.stage || 1));
      for (const f of list) this._drawFish(g, f);
      this._drawKelp(g, 1);
      this._drawBubbles(g);

      for (const e of this.fx) {
        const k = 1 - e.age / e.life;
        if (e.kind === 'crumb') {
          g.fillStyle = k > 0.5 ? '#e8a04a' : '#b86e25';
          g.fillRect(Math.round(e.x), Math.round(e.y), 1, 1);
          continue;
        }
        g.fillStyle = k > 0.5 ? '#ffffff' : '#fff2a8';
        const s = k > 0.6 ? 2 : 1;
        g.fillRect(Math.round(e.x), Math.round(e.y), s, s);
      }

      this._drawOverlay();
    }

    _drawRays(g) {
      g.save();
      g.globalAlpha = 0.09;
      g.fillStyle = '#ffffff';
      for (let i = 0; i < 4; i++) {
        const base = (i + 0.4) * (this.W / 4) + Math.sin(this.t * 0.25 + i * 1.7) * 18;
        const w = 14 + i * 4;
        g.beginPath();
        g.moveTo(base, 0);
        g.lineTo(base + w, 0);
        g.lineTo(base + w * 2.6 - 40, this.sandY);
        g.lineTo(base + w * 1.2 - 40, this.sandY);
        g.closePath();
        g.fill();
      }
      g.restore();
    }

    _drawSurface(g) {
      g.fillStyle = '#d8fbf6';
      for (let x = 0; x < this.W; x += 2) {
        const y = Math.round(3 + Math.sin(x * 0.06 + this.t * 1.4) * 1.5 + Math.sin(x * 0.17 - this.t) * 0.8);
        g.fillRect(x, y, 2, 1);
      }
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(0, 0, this.W, 2);
    }

    /** layer 0: 뒤쪽 잎, layer 1: 앞쪽 잎 (물고기 앞을 살짝 가린다) */
    _drawKelp(g, layer) {
      for (let i = 0; i < this.kelp.length; i++) {
        const k = this.kelp[i];
        if ((i % 3 === 0 ? 1 : 0) !== layer) continue;
        const segs = Math.floor(k.len / 3);
        for (let blade = 0; blade < k.blades; blade++) {
          const off = blade * 5;
          for (let s = 0; s < segs; s++) {
            const tNorm = s / segs;
            const sway = Math.sin(this.t * 1.1 + k.phase + s * 0.22 + blade) * 5 * tNorm;
            const x = Math.round(k.x + off + sway);
            const y = this.sandY + 2 - s * 3;
            g.fillStyle = k.color;
            g.fillRect(x, y - 3, 3, 3);
            if (s % 4 === 2) { g.fillStyle = '#7fe0a8'; g.fillRect(x + (s % 8 === 2 ? 3 : -2), y - 2, 2, 1); }
          }
        }
      }
    }

    _drawBubbles(g) {
      for (const b of this.bubbles) {
        const x = Math.round(b.x + Math.sin(b.ph) * 2), y = Math.round(b.y);
        if (b.r === 1) {
          g.fillStyle = 'rgba(255,255,255,0.75)';
          g.fillRect(x, y, 2, 2);
        } else {
          g.fillStyle = 'rgba(255,255,255,0.8)';
          g.fillRect(x + 1, y, 2, 1); g.fillRect(x + 1, y + 3, 2, 1);
          g.fillRect(x, y + 1, 1, 2); g.fillRect(x + 3, y + 1, 1, 2);
          g.fillStyle = '#ffffff'; g.fillRect(x + 1, y + 1, 1, 1);
        }
      }
    }

    _drawFish(g, f) {
      const d = f.data;
      const blink = f.flash > 0 && Math.floor(f.flash * 10) % 2 === 0;
      const spr = PA.fishSprite({ species: d.species, color: d.color, accessory: d.accessory, stage: d.stage, faded: d.status === 'sad', frame: f.frame, white: blink });
      const u = this._unit(f);
      const w = spr.w * u, h = spr.h * u;
      const bob = Math.sin(f.bob) * (d.status === 'sad' ? 0.5 : 1.2);
      const x = Math.round(f.x - w / 2);
      const y = Math.round(f.y - (spr.bodyTop + spr.bodyH / 2) * u + bob);
      g.save();
      if (f.facing < 0) {
        g.translate(x + w, y);
        g.scale(-1, 1);
        g.drawImage(spr.canvas, 0, 0, w, h);
      } else {
        g.drawImage(spr.canvas, x, y, w, h);
      }
      g.restore();

      // 4단계: 반짝임
      if ((d.stage || 1) >= 4 && !reduceMotion) {
        for (let i = 0; i < 3; i++) {
          const ph = this.t * 2.2 + i * 2.1 + f.id;
          const tw = (Math.sin(ph) + 1) / 2;
          if (tw < 0.45) continue;
          const sx = Math.round(f.x + Math.cos(ph * 0.37 + i) * w * 0.55);
          const sy = Math.round(f.y + Math.sin(ph * 0.53 + i * 2) * h * 0.4);
          g.fillStyle = tw > 0.85 ? '#ffffff' : '#fff2a8';
          g.fillRect(sx, sy - 1, 1, 3); g.fillRect(sx - 1, sy, 3, 1);
        }
      }
      f._box = { x: f.x - w / 2, y: f.y - h / 2, w, h };
    }

    _drawOverlay() {
      const o = this.octx;
      const k = PX * this.dpr;
      o.setTransform(1, 0, 0, 1, 0, 0);
      o.clearRect(0, 0, this.overlay.width, this.overlay.height);
      o.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      o.textAlign = 'center';
      o.textBaseline = 'middle';

      for (const f of this.fish.values()) {
        if (!f._box) continue;
        const d = f.data;
        const cx = f.x * PX;
        const bottom = (f._box.y + f._box.h) * PX;
        const top = f._box.y * PX;

        if (this.opts.labels) {
          const label = d.ownerNickname || '';
          o.font = '12px Galmuri9, Galmuri11, monospace';
          const tw = o.measureText(label).width + 10;
          const isSel = f.id === this.selectedId || f.id === this.highlightId;
          o.fillStyle = isSel ? 'rgba(255,217,143,0.95)' : 'rgba(16,54,92,0.62)';
          o.fillRect(Math.round(cx - tw / 2), Math.round(bottom + 2), Math.round(tw), 18);
          o.fillStyle = isSel ? '#10365c' : '#effcf9';
          o.fillText(label, Math.round(cx), Math.round(bottom + 11.5));
        }

        const sp = this.speech.get(f.id);
        if (sp) {
          this._drawSpeech(o, cx, top, sp, f.id === this.selectedId);
        } else if (d.status === 'hungry' && !f.chase) {
          const msg = '배고파요';
          o.font = '12px Galmuri9, Galmuri11, monospace';
          const tw = o.measureText(msg).width + 14;
          const bx = Math.round(cx - tw / 2 + 10), by = Math.round(top - 26 + Math.sin(this.t * 2 + f.id) * 2);
          o.fillStyle = '#10365c';
          o.fillRect(bx - 2, by - 2, tw + 4, 24);
          o.fillStyle = '#ffffff';
          o.fillRect(bx, by, tw, 20);
          o.fillRect(bx + 6, by + 20, 6, 4);
          o.fillStyle = '#10365c';
          o.fillRect(bx + 4, by + 22, 2, 4);
          o.fillRect(bx + 12, by + 22, 2, 2);
          o.fillText(msg, bx + tw / 2, by + 10.5);
        }
        if (d.status === 'sad' && !sp) {
          o.font = '11px Galmuri9, monospace';
          o.fillStyle = 'rgba(16,54,92,0.7)';
          o.fillText('…', Math.round(cx + 16), Math.round(top - 4));
        }
      }
      // 떠오르는 글자
      o.font = '14px Galmuri11, monospace';
      for (const t of this.texts) {
        const p = t.age / t.life;
        const x = Math.round(t.x * PX), y = Math.round(t.y * PX - 10 - p * 26);
        o.globalAlpha = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
        o.fillStyle = '#10365c';
        for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) o.fillText(t.text, x + dx, y + dy);
        o.fillStyle = '#ffe066';
        o.fillText(t.text, x, y);
        o.globalAlpha = 1;
      }
      void k;
    }

    /** 글자를 maxW 안에 줄바꿈 (최대 3줄, 넘치면 …) */
    _wrap(o, text, maxW, maxLines) {
      // 띄어쓰기 단위로 줄을 나누고, 한 단어가 한 줄보다 길 때만 글자 단위로 자른다
      const lines = [];
      let line = '';
      let overflow = false;
      const push = (l) => { if (lines.length < maxLines) lines.push(l); else overflow = true; };
      for (const word of text.split(' ')) {
        const tryLine = line ? line + ' ' + word : word;
        if (o.measureText(tryLine).width <= maxW) { line = tryLine; continue; }
        if (line) { push(line); line = ''; }
        if (o.measureText(word).width <= maxW) { line = word; continue; }
        for (const ch of word) {
          if (o.measureText(line + ch).width > maxW && line) { push(line); line = ''; }
          line += ch;
        }
      }
      if (line) push(line);
      if (overflow && lines.length) {
        let last = lines[lines.length - 1];
        while (last && o.measureText(last + '…').width > maxW) last = last.slice(0, -1);
        lines[lines.length - 1] = last.replace(/\s+$/, '') + '…';
      }
      return lines;
    }

    _drawSpeech(o, cx, top, sp, selected) {
      o.font = '13px "IBM Plex Sans KR", "Malgun Gothic", sans-serif';
      const lines = this._wrap(o, sp.text, 170, 3);
      const lineH = 18;
      const w = Math.ceil(Math.max(...lines.map((l) => o.measureText(l).width))) + 18;
      const h = lines.length * lineH + 10;
      // 화면 밖으로 나가지 않게
      let bx = Math.round(Math.min(Math.max(6, cx - w / 2), this.cssW - w - 6));
      const by = Math.round(Math.max(6, top - h - 14));
      // 나타날 때 톡 튀고, 사라질 때 흐려짐
      const p = sp.age / sp.life;
      o.globalAlpha = p > 0.85 ? (1 - p) / 0.15 : 1;
      const pop = sp.age < 0.12 ? 3 : 0;
      // 픽셀 테두리 (모서리 한 칸 깎기)
      o.fillStyle = '#10365c';
      o.fillRect(bx + 2, by - 2 - pop, w - 4, h + 4);
      o.fillRect(bx, by - pop, w, h);
      o.fillStyle = selected ? '#fff2c2' : '#ffffff';
      o.fillRect(bx + 2, by - pop, w - 4, h);
      // 꼬리 (물고기 쪽을 가리킴)
      const tx = Math.round(Math.min(Math.max(bx + 10, cx - 4), bx + w - 18));
      o.fillStyle = '#10365c';
      o.fillRect(tx - 2, by + h - pop, 12, 4);
      o.fillRect(tx, by + h + 4 - pop, 6, 4);
      o.fillStyle = selected ? '#fff2c2' : '#ffffff';
      o.fillRect(tx, by + h - pop, 8, 2);
      o.fillRect(tx + 2, by + h + 2 - pop, 2, 4);
      // 글자
      o.fillStyle = '#10365c';
      o.textAlign = 'left';
      lines.forEach((l, i) => o.fillText(l, bx + 9, by + 5 + lineH / 2 + i * lineH - pop + 1));
      o.textAlign = 'center';
      o.globalAlpha = 1;
    }

    // ── 입력 ─────────────────────────────────
    _pointToScene(e) {
      const r = this.overlay.getBoundingClientRect();
      return { cssX: e.clientX - r.left, cssY: e.clientY - r.top, x: (e.clientX - r.left) / PX, y: (e.clientY - r.top) / PX };
    }

    fishAt(x, y) {
      const list = [...this.fish.values()].reverse();
      for (const f of list) {
        // 그리기와 상관없이 현재 위치와 크기로 판정
        const s = this._size(f);
        const b = { x: f.x - s.w / 2, y: f.y - s.h / 2, w: s.w, h: s.h };
        if (x >= b.x - 2 && x <= b.x + b.w + 2 && y >= b.y - 2 && y <= b.y + b.h + 2) return f;
      }
      return null;
    }

    _onPointer(e) {
      const p = this._pointToScene(e);
      const f = this.fishAt(p.x, p.y);
      if (f && this.opts.onFishClick) this.opts.onFishClick(f.data, p.cssX, p.cssY);
      else if (!f && this.opts.onWaterClick) this.opts.onWaterClick(p.cssX, p.cssY);
    }

    _onHover(e) {
      const p = this._pointToScene(e);
      const f = this.fishAt(p.x, p.y);
      this.highlightId = f ? f.id : null;
      this.overlay.style.cursor = f ? 'pointer' : (this.opts.waterCursor || 'default');
    }
  }

  TankScene.PX = PX;
  window.TankScene = TankScene;
})();
