/* 햄버거 메뉴
 * <head>에서 바로 실행되어 html에 'js' 클래스를 붙인다.
 * (JS가 꺼져 있으면 휴대폰에서도 메뉴가 항상 펼쳐져 보인다)
 */
(function () {
  'use strict';
  document.documentElement.classList.add('js');

  document.addEventListener('DOMContentLoaded', function () {
    var toggle = document.querySelector('.nav-toggle');
    var nav = document.getElementById('site-nav');
    if (!toggle || !nav) return;
    var label = toggle.querySelector('.visually-hidden');
    var mobile = window.matchMedia('(max-width: 900px)');

    function setOpen(open) {
      toggle.setAttribute('aria-expanded', String(open));
      nav.classList.toggle('is-open', open);
      if (label) label.textContent = open ? '메뉴 닫기' : '메뉴 열기';
    }

    toggle.addEventListener('click', function () {
      setOpen(toggle.getAttribute('aria-expanded') !== 'true');
    });

    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) setOpen(false);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
        setOpen(false);
        toggle.focus();
      }
    });

    // 메뉴 바깥을 누르면 닫기
    document.addEventListener('click', function (e) {
      if (!mobile.matches) return;
      if (!nav.contains(e.target) && !toggle.contains(e.target)) setOpen(false);
    });

    // PC 화면으로 넓어지면 상태 초기화
    mobile.addEventListener('change', function () { setOpen(false); });
  });
})();
