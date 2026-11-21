/* FAQ 아코디언: 하나를 열면 나머지는 닫는다.
 * 기본 동작은 <details>라서 JS가 없어도 열고 닫을 수 있다.
 * (최신 브라우저는 name 속성만으로도 같은 동작을 하지만, 오래된 브라우저를 위해 보완)
 */
(function () {
  'use strict';
  var items = document.querySelectorAll('.faq-item');
  items.forEach(function (item) {
    item.addEventListener('toggle', function () {
      if (!item.open) return;
      items.forEach(function (other) {
        if (other !== item && other.open) other.open = false;
      });
    });
  });
})();
