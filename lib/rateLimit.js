'use strict';

// 같은 IP의 문의 접수 횟수를 메모리에서 센다. (기본: 10분에 5건)
// 서버를 다시 켜면 초기화되지만, 실습 환경의 스팸 방지에는 충분하다.

function createRateLimiter({ windowMs, max }) {
  const hits = new Map(); // ip -> 접수 시각 배열

  function recent(ip, now) {
    const list = (hits.get(ip) || []).filter((t) => now - t < windowMs);
    if (list.length) hits.set(ip, list);
    else hits.delete(ip);
    return list;
  }

  // 오래된 기록 정리
  setInterval(() => {
    const now = Date.now();
    for (const ip of hits.keys()) recent(ip, now);
  }, windowMs).unref();

  return {
    isLimited(ip) {
      return recent(ip, Date.now()).length >= max;
    },
    hit(ip) {
      const now = Date.now();
      const list = recent(ip, now);
      list.push(now);
      hits.set(ip, list);
    },
  };
}

module.exports = { createRateLimiter };
