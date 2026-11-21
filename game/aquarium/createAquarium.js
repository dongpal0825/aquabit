import 'pixi.js/unsafe-eval'; // CSP를 완화하지 않고 정적 셰이더 동기화 코드를 사용합니다.
import { Application, Assets, BlurFilter, ColorMatrixFilter, Container, Graphics, Rectangle, Sprite, Text } from 'pixi.js';
import { GlowFilter } from 'pixi-filters/glow';
import { AquariumSimulation, shrimpGroundY, isBottomSpecies, fishDisplayWidth } from './simulation.mjs';
import { SpriteAnimation } from './sprite-animation.mjs';
import { species, spriteFrames, spriteLayers } from '../domain/fish.mjs';
import growth from '../domain/growth.mjs';
import { fishGlowColor, hueMatrix } from '../domain/color.mjs';
import { normalizeEnvironment } from '../domain/environment.mjs';
import { BubbleField } from './bubbles.mjs';
import { gameAssetUrl } from '../asset-url.js';

const assetUrl = gameAssetUrl;
const textStyle = { fontFamily: 'Malgun Gothic, sans-serif', fontSize: 10, fill: '#e3f6ff',
  stroke: { color: '#0b1d3a', width: 3 } };

// 입력: 직렬화 가능한 물고기 목록 / 출력: 선택·먹이 이벤트만 전달합니다.
// API 호출, 로그인, localStorage, 경험치 계산은 이 렌더러의 책임이 아닙니다.
export async function createAquarium(host, { onSelect, onDoubleSelect, onEat, onDispense, onFeeding, canDispense, onFeedBlocked, canInsetRight = () => 0, showcase = false }) {
  const app = new Application();
  await app.init({ width: host.clientWidth, height: host.clientHeight, backgroundAlpha: 0,
    antialias: false, autoDensity: true, resolution: Math.min(window.devicePixelRatio || 1, 2),
    preference: 'webgl', roundPixels: true });

  const files = [...new Set(['bubble', 'bubble-dot', 'food-can', 'food-pellet', 'effect-sparkle',
    ...Object.keys(species).flatMap(key => spriteFrames(key).map(file => file.slice(7, -4))), 'accessory-bow', 'accessory-crown', 'accessory-flower'])];
  let textures;
  try {
    const loaded = await Assets.load(files.map(name => assetUrl(`assets/${name}.png`)));
    textures = Object.fromEntries(files.map(name => {
      const texture = loaded[assetUrl(`assets/${name}.png`)];
      texture.source.scaleMode = 'nearest';
      return [name, texture];
    }));
  } catch (error) {
    app.destroy({ removeView: true, releaseGlobalResources: false }, { children: true, texture: false, textureSource: false });
    throw error;
  }

  host.append(app.canvas);
  host.dataset.renderer = 'pixi';
  if (showcase) {
    app.canvas.setAttribute('role', 'img');
    app.canvas.setAttribute('aria-label', '우리 어항에서 불러온 물고기');
    app.stage.eventMode = 'none';
  } else {
    app.canvas.setAttribute('aria-label', '물고기와 밥통을 끌어 움직이는 픽셀 어항. 내 물고기를 누르면 꾸미기, 다른 물고기를 더블클릭하면 오른쪽 채팅창을 열어요.');
    app.canvas.style.touchAction = 'none';
  }
  const fishNodes = new Map(), pelletNodes = new Map(), popups = [];
  const foodCallbacks = new Map();
  const bubbleNodes = new Map(), bubbleField = new BubbleField();
  let environment = normalizeEnvironment();
  const inhabitants = new Container({ label: 'inhabitants' });
  const controls = new Container({ label: 'feeding controls', visible: !showcase });
  const bubbles = new Container();
  const ambient = new Container({ eventMode: 'none' });
  const ambientBubbles = Array.from({ length: 22 }, (_, index) => {
    const image = new Sprite(textures['bubble-dot']);
    image.anchor.set(.5);
    image.width = image.height = 5;
    image.alpha = index % 3 === 0 ? .65 : .35;
    ambient.addChild(image);
    return { image, x: ((index * .61803398875) % 1), phase: (index * .137) % 1,
      speed: 15 + index % 6 * 3 };
  });
  let sceneryTime = 0;
  const fishHalos = new Container(), fishes = new Container(), foods = new Container(), feedback = new Container();
  const can = new Sprite(textures['food-can']);
  can.anchor.set(.5);
  can.eventMode = 'static'; can.cursor = 'grab';
  // 레벨 업 반짝이 조각과 채팅 말풍선 (물고기 위에 그림)
  const sparks = new Container({ label: 'level-up sparks', eventMode: 'none' });
  const speech = new Container({ label: 'speech bubbles', eventMode: 'none' });
  inhabitants.addChild(ambient, fishHalos, fishes, foods, bubbles, sparks, speech);
  const speechNodes = new Map(), sparkList = [];
  const flashFilter = new ColorMatrixFilter(); flashFilter.brightness(2.6, false);
  controls.addChild(can, feedback);
  app.stage.addChild(inhabitants, controls);
  const model = new AquariumSimulation({ onDispense, canDispense, onFeedBlocked, onEat(id, position, pelletId) {
    const callback = foodCallbacks.get(pelletId);
    foodCallbacks.delete(pelletId);
    callback?.();
    Promise.resolve(onEat(id)).then(reward => {
      if (disposed || !reward?.gained) return;
      const text = new Text({ text: reward.leveledUp ? reward.after.name + '!' : '+' + reward.gained + ' XP', style: textStyle });
      text.anchor.set(.5);
      text.position.set(position.x, position.y);
      feedback.addChild(text);
      popups.push({ text, born: model.time, y: position.y });
    }).catch(() => {}); // 실패 안내는 Vue의 저장 계층에서 처리합니다.
  } });
  let disposed = false, feedingState = '', pointerId;

  function startDrag(kind, id, event) {
    if (showcase) return;
    if (event.button !== 0 || !model.pick(kind, id, event.global, event.pointerId)) return;
    pointerId = event.pointerId;
    app.canvas.setPointerCapture?.(pointerId);
  }
  can.on('pointerdown', event => startDrag('food', null, event));
  function pointerPosition(event) {
    const rect = app.canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * app.screen.width / rect.width,
      y: (event.clientY - rect.top) * app.screen.height / rect.height };
  }
  function move(event) { model.move(pointerPosition(event), event.pointerId); }
  let lastClick = null;
  function finish(event) {
    if (event && pointerId !== event.pointerId) return;
    const selected = model.release(pointerId);
    if (pointerId !== undefined && app.canvas.hasPointerCapture?.(pointerId)) app.canvas.releasePointerCapture(pointerId);
    pointerId = undefined;
    if (selected && event?.type !== 'pointercancel' && event?.type !== 'lostpointercapture') {
      const now = performance.now();
      if (lastClick?.id === selected && now - lastClick.time <= 450) {
        lastClick = null;
        onDoubleSelect?.(selected);
      } else {
        lastClick = { id: selected, time: now };
        onSelect(selected);
      }
    } else lastClick = null;
  }
  const cancel = () => { model.release(); pointerId = undefined; lastClick = null; };
  const hidden = () => { if (document.hidden) cancel(); };
  app.canvas.addEventListener('pointermove', move);
  app.canvas.addEventListener('pointerup', finish);
  app.canvas.addEventListener('pointercancel', finish);
  app.canvas.addEventListener('lostpointercapture', finish);
  window.addEventListener('blur', cancel);
  document.addEventListener('visibilitychange', hidden);

  function resize() {
    if (disposed) return;
    app.renderer.resize(host.clientWidth, host.clientHeight);
    model.resize(app.screen.width, app.screen.height, showcase);
    model.can.x = Math.max(model.view.canRadius + 12, Math.min(model.can.x, app.screen.width - canInsetRight() - model.view.canRadius - 12));
    can.width = model.view.canWidth; can.height = model.view.canHeight;
    for (const node of fishNodes.values()) sizeFish(node);
  }
  function sizeFish(node) {
    const width = fishDisplayWidth(model.view, node.species);
    if (node.halo) { node.halo.width = width; node.halo.height = width * node.halo.texture.orig.height / node.halo.texture.orig.width; }
    for (const image of node.images) { image.width = width; image.height = width * (image.isCreature ? image.texture.orig.height / image.texture.orig.width : 2 / 3); image.y = image.height * (image.assetOffsetY || 0) / 32; }
    node.root.hitArea = new Rectangle(-width / 2, -width / 3, width, width * 2 / 3 + 33);
    node.name.y = width / 3 + 5;
    node.level.y = width / 3 + 20;
    node.alert.position.set(width / 2 - 3, -width / 3 - 2);
  }
  function makeFish(id) {
    const root = new Container(), body = new Container();
    const name = new Text({ text: '', style: textStyle });
    const level = new Text({ text: '', style: { ...textStyle, fontSize: 8 } });
    const alert = new Text({ text: '!', style: { ...textStyle, fontSize: 25, fontWeight: 'bold', fill: '#ce6256' } });
    name.anchor.set(.5, 0); level.anchor.set(.5, 0); alert.anchor.set(.5);
    root.addChild(body, name, level, alert);
    root.eventMode = 'static'; root.cursor = 'grab';
    root.on('pointerdown', event => startDrag('fish', id, event));
    fishes.addChild(root);
    const node = { root, body, name, level, alert, images: [], filters: [], key: '', effect: null, halo: null, animation: null, previousX: null };
    fishNodes.set(id, node);
    return node;
  }
  function clearImages(node) {
    node.halo?.destroy(); node.halo = null;
    for (const image of node.images) image.destroy();
    for (const filter of node.filters) filter.destroy();
    node.images = []; node.filters = []; node.effect = null; node.animation = null;
  }
  function update(list, viewerId, unreadIds) {
    if (disposed) return;
    model.setViewer(viewerId);
    model.setFish(list);
    bubbleField.syncFish(list.map(f => f.id));
    for (const [id, node] of fishNodes) if (!model.fish.has(id)) {
      clearImages(node); node.root.destroy({ children: true }); fishNodes.delete(id);
    }
    for (const fish of list) {
      const node = fishNodes.get(fish.id) || makeFish(fish.id);
      node.species = fish.species;
      const layers = spriteLayers(fish), key = JSON.stringify(layers);
      if (node.key !== key) {
        clearImages(node);
        for (const layer of layers) {
          const textureName = layer.src.slice(7, -4);
          const image = new Sprite(textures[textureName]);
          image.assetOffsetY = layer.offsetY || 0;
          image.anchor.set(.5);
          if (layer.kind === 'fish') {
            image.isCreature = true;
            node.animation = { image, frames: spriteFrames(fish.species).map(src => textures[src.slice(7, -4)]), clock: new SpriteAnimation(fish.species) };
            const color = new ColorMatrixFilter(); color.matrix = hueMatrix(layer.hue);
            image.filters = [color]; node.filters.push(color);
            // 원본 몸 PNG로 빛만 별도 생성하므로 도트·장식·닉네임은 흐려지지 않습니다.
            const halo = new Sprite(textures[textureName]);
            halo.anchor.set(.5); halo.eventMode = 'none';
            const glow = new GlowFilter({ distance: 8, outerStrength: .8, innerStrength: 0,
              color: fishGlowColor(fish), alpha: .12, quality: .15, knockout: true });
            const soft = new BlurFilter({ strength: 1, quality: 1 });
            halo.filters = [glow, soft];
            node.filters.push(glow, soft); node.halo = halo;
            fishHalos.addChild(halo);
          }
          if (layer.kind === 'effect') {
            const color = new ColorMatrixFilter();
            image.filters = [color]; node.filters.push(color);
            node.effect = { image, color, aurora: layer.effect === 'aurora' };
          }
          node.body.addChild(image); node.images.push(image);
        }
        node.key = key;
      }
      node.name.text = fish.name + (fish.id === viewerId ? ' · 나' : '');
      node.level.text = Number.isInteger(fish.displayLevel) ? 'Lv.' + fish.displayLevel : growth.describe(fish.xp).name;
      node.alert.visible = unreadIds.includes(fish.id);
      sizeFish(node);
    }
  }
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── 채팅 말풍선: 보낸 사람 물고기 머리 위, 최대 3줄, 5초 ──
  const INK = 0x0b1d3a, PAPER = 0xffffff;
  const SPEECH_MS = 5000, SPEECH_FADE_MS = 500, SPEECH_MAX_CHARS = 36;
  function say(id, message) {
    const key = String(id);
    if (!fishNodes.has(key)) return;
    speechNodes.get(key)?.root.destroy({ children: true });
    const text = [...String(message).replace(/\s+/g, ' ').trim()];
    const body = text.length > SPEECH_MAX_CHARS ? text.slice(0, SPEECH_MAX_CHARS - 1).join('') + '…' : text.join('');
    const root = new Container();
    const label = new Text({ text: body, style: { fontFamily: 'Malgun Gothic, system-ui, sans-serif', fontSize: 12, fontWeight: '600',
      fill: '#0b1d3a', lineHeight: 16, wordWrap: true, breakWords: true, wordWrapWidth: 150 } });
    const padX = 8, padY = 5, w = Math.ceil(label.width) + padX * 2, h = Math.ceil(label.height) + padY * 2;
    const tail = Math.round(w / 2) - 5;
    const g = new Graphics();
    g.rect(3, 3, w, h).fill(INK);                                                      // 픽셀 그림자
    g.rect(0, 0, w, h).fill(PAPER).stroke({ width: 2, color: INK, alignment: 1 });    // 상자
    g.poly([tail, h - 2, tail + 10, h - 2, tail + 2, h + 7]).fill(PAPER).stroke({ width: 2, color: INK });
    g.rect(tail + 2, h - 2, 7, 2).fill(PAPER);                                        // 꼬리와 상자 사이 선 지우기
    label.position.set(padX, padY);
    root.addChild(g, label);
    root.pivot.set(w / 2, h + 8);
    speech.addChild(root);
    speechNodes.set(key, { root, w, h, born: performance.now() });
  }

  // ── 레벨 업 연출: 픽셀 반짝이가 터지듯 퍼지고 물고기가 하얗게 깜빡임 ──
  const SPARK_COLORS = [0xffd34e, 0xffffff, 0x4fd1e8, 0xffe6a3];
  function celebrate(id) {
    const key = String(id), node = fishNodes.get(key);
    if (!node) return;
    node.flashUntil = performance.now() + 540;
    if (reducedMotion) return;
    const px = app.screen.width < 600 ? 4 : 5, count = 26;
    for (let i = 0; i < count && sparkList.length < 80; i++) {
      const g = new Graphics().rect(-px / 2, -px / 2, px, px).fill(SPARK_COLORS[i % SPARK_COLORS.length]);
      const angle = Math.PI * 2 * i / count + Math.random() * .25, speed = 80 + Math.random() * 110;
      sparks.addChild(g);
      sparkList.push({ g, x: node.root.x, y: node.root.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 30,
        born: performance.now(), life: 750 + Math.random() * 450, px });
    }
  }
  function stepEffects(deltaMS) {
    const now = performance.now(), dt = Math.min(deltaMS, 50) / 1000;
    for (let i = sparkList.length - 1; i >= 0; i--) {
      const s = sparkList[i], age = (now - s.born) / s.life;
      if (age >= 1) { s.g.destroy(); sparkList.splice(i, 1); continue; }
      s.vy += 120 * dt; s.vx *= .985;
      s.x += s.vx * dt; s.y += s.vy * dt;
      s.g.position.set(Math.round(s.x / s.px) * s.px, Math.round(s.y / s.px) * s.px);
      s.g.alpha = age < .6 ? 1 : 1 - (age - .6) / .4;
    }
    for (const [key, node] of fishNodes) {
      const left = (node.flashUntil || 0) - now;
      const on = left > 0 && Math.floor(left / 90) % 2 === 0;
      if (on !== !!node.flashing) { node.body.filters = on ? [flashFilter] : null; node.flashing = on; }
      const bubble = speechNodes.get(key);
      if (!bubble) continue;
      const age = now - bubble.born;
      if (age >= SPEECH_MS) { bubble.root.destroy({ children: true }); speechNodes.delete(key); continue; }
      const top = node.root.y - fishDisplayWidth(model.view, node.species) / 3 - 4;
      const maxX = app.screen.width - canInsetRight() - bubble.w / 2 - 6;
      bubble.root.position.set(Math.round(Math.max(bubble.w / 2 + 6, Math.min(maxX, node.root.x))), Math.round(Math.max(bubble.h + 12, top)));
      bubble.root.alpha = age > SPEECH_MS - SPEECH_FADE_MS ? (SPEECH_MS - age) / SPEECH_FADE_MS : 1;
    }
    for (const [key, bubble] of speechNodes) if (!fishNodes.has(key)) { bubble.root.destroy({ children: true }); speechNodes.delete(key); }
  }

  function tick(ticker) {
    model.step(ticker.deltaMS);
    if (!model.paused) sceneryTime += Math.min(ticker.deltaMS, 50) / 1000;
    ambient.visible = environment.bubbles;
    const pixel = app.screen.width < 600 ? 4 : 5;
    for (const particle of ambientBubbles) {
      const travel = app.screen.height * .89 + pixel;
      particle.image.width = particle.image.height = pixel;
      particle.image.position.set(
        Math.round(particle.x * app.screen.width / pixel) * pixel,
        Math.floor((app.screen.height * .89 - ((particle.phase * travel + sceneryTime * particle.speed) % travel)) / pixel) * pixel);
    }
    bubbleField.step(ticker.deltaMS, model.fish, model.view, { paused: model.paused, enabled: environment.bubbles });
    const visibleBubbles = new Set();
    let surfaceBubbles = 0;
    for (const bubble of bubbleField.items) {
      const state = bubbleField.frame(bubble), point = model.toScene(state);
      visibleBubbles.add(bubble.id);
      if (state.state !== 'rising') surfaceBubbles++;
      let sprite = bubbleNodes.get(bubble.id);
      if (!sprite) { sprite = new Sprite(textures.bubble); sprite.anchor.set(.5); bubbles.addChild(sprite); bubbleNodes.set(bubble.id, sprite); }
      sprite.position.set(point.x, point.y);
      sprite.width = sprite.height = 16 * state.scale;
      sprite.alpha = state.alpha;
    }
    for (const [id, sprite] of bubbleNodes) if (!visibleBubbles.has(id)) { sprite.destroy(); bubbleNodes.delete(id); }
    const count = String(visibleBubbles.size), waiting = String(surfaceBubbles);
    if (host.dataset.bubbles !== count) host.dataset.bubbles = count;
    if (host.dataset.surfaceBubbles !== waiting) host.dataset.surfaceBubbles = waiting;
    for (const [id, node] of fishNodes) {
      const fish = model.fish.get(id), point = model.toScene(fish);
      const crawling = !isBottomSpecies(fish.species) || (Math.abs(fish.y - shrimpGroundY(model.view, fish.species)) < .00001 &&
        node.previousX !== null && Math.abs(fish.x - node.previousX) > .000001);
      if (node.animation) {
        const { image, frames, clock } = node.animation;
        const frame = clock.step(ticker.deltaMS, { paused: model.paused || reducedMotion, held: fish.held, moving: crawling });
        if (image.texture !== frames[frame]) {
          image.texture = frames[frame];
          if (node.halo) node.halo.texture = frames[frame];
        }
      }
      node.previousX = fish.x;
      node.root.position.set(point.x, point.y);
      node.body.scale.x = fish.vx > 0 ? -1 : 1;
      if (node.halo) { node.halo.position.copyFrom(node.root.position); node.halo.scale.x = Math.abs(node.halo.scale.x) * (fish.vx > 0 ? -1 : 1); }
      if (node.effect) {
        node.effect.image.alpha = reducedMotion ? .8 : .25 + .65 * (1 + Math.sin(model.time / 700)) / 2;
        if (node.effect.aurora) node.effect.color.matrix = hueMatrix(reducedMotion ? 130 : (model.time / 35) % 360);
      }
    }
    stepEffects(ticker.deltaMS);
    const active = new Set();
    for (const pellet of model.pellets) {
      active.add(pellet.id);
      let image = pelletNodes.get(pellet.id);
      if (!image) { image = new Sprite(textures['food-pellet']); foods.addChild(image); pelletNodes.set(pellet.id, image); }
      image.width = image.height = app.screen.width < 600 ? 8 : 10;
      const point = model.toScene(pellet);
      image.position.set(point.x, point.y);
      image.visible = model.time >= pellet.born;
    }
    for (const [id, image] of pelletNodes) if (!active.has(id)) { image.destroy(); pelletNodes.delete(id); }
    can.position.set(model.can.x, model.can.y);
    can.rotation = model.can.ready ? -115 * Math.PI / 180 : (model.drag?.kind === 'food' ? 0 : 12 * Math.PI / 180);
    const feeding = model.drag?.kind === 'food', key = `${feeding}:${model.can.ready}`;
    if (key !== feedingState) { feedingState = key; onFeeding({ active: feeding, ready: model.can.ready }); }
    for (let i = popups.length - 1; i >= 0; i--) {
      const popup = popups[i], progress = (model.time - popup.born) / 1100;
      if (progress >= 1) { popup.text.destroy(); popups.splice(i, 1); }
      else { popup.text.y = popup.y - 28 * progress; popup.text.alpha = 1 - progress; }
    }
  }
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  app.ticker.add(tick);

  return {
    update,
    fishScreenPos(id) {
      const point = model.fish.get(id);
      return point ? model.toScene(point) : { x: app.screen.width / 2, y: app.screen.height / 2 };
    },
    // forId: 이 알갱이를 먹을 물고기 (없으면 내 물고기). 팀원 물고기에게 먹이를 줄 때 쓴다.
    dropFood(x, y, callback, forId) {
      const id = ++model.nextPelletId, start = Math.max(.03, Math.min(.8, y / app.screen.height));
      if (callback) foodCallbacks.set(id, callback);
      model.pellets.push({ id, x: Math.max(.03, Math.min(.97, x / app.screen.width)), y: start, start, born: model.time, ...(forId != null && { forId: String(forId) }) });
    },
    /** 채팅 말풍선을 이 물고기 위에 띄운다 */
    say,
    /** 레벨 업 연출 (반짝이 + 깜빡임) */
    celebrate,
    setFoodCount(value) { model.setFoodCount(value); },
    setPaused(value) { model.paused = value; },
    setEnvironment(value) {
      environment = normalizeEnvironment(value);
      host.dataset.plant = environment.plant;
    },
    destroy() {
      if (disposed) return;
      disposed = true;
      observer.disconnect();
      app.ticker.remove(tick);
      cancel();
      app.canvas.removeEventListener('pointermove', move);
      app.canvas.removeEventListener('pointerup', finish);
      app.canvas.removeEventListener('pointercancel', finish);
      app.canvas.removeEventListener('lostpointercapture', finish);
      window.removeEventListener('blur', cancel);
      document.removeEventListener('visibilitychange', hidden);
      // 텍스트·필터의 텍스처를 지우기 전에 렌더러의 바인딩부터 해제합니다.
      // 개발 중 Vue가 다시 마운트될 때도 공유 PNG 텍스처는 캐시에 유지합니다.
      const children = app.stage.removeChildren();
      app.destroy({ removeView: true, releaseGlobalResources: false }, { children: true, texture: false, textureSource: false });
      for (const node of fishNodes.values()) clearImages(node);
      for (const child of children) child.destroy({ children: true, texture: false, textureSource: false });
    },
  };
}
