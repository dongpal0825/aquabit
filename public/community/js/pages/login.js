(function () {
  'use strict';
  const next = Aqua.qs('next');
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/community/tanks.html';

  // 이미 로그인 상태면 바로 이동
  const dest = (u) => (u && u.isAdmin && !next ? '/community/admin.html' : safeNext);
  Aqua.currentUser().then((u) => { if (u) location.replace(dest(u)); });

  // 배경 어항은 랜딩페이지와 같은 /js/aquarium.js가 #aquarium-canvas에 그린다

  const tabs = { login: document.getElementById('tabLogin'), register: document.getElementById('tabRegister') };
  const forms = { login: document.getElementById('loginForm'), register: document.getElementById('registerForm') };

  function show(mode) {
    for (const k of ['login', 'register']) {
      tabs[k].setAttribute('aria-selected', String(k === mode));
      forms[k].hidden = k !== mode;
    }
    document.title = (mode === 'login' ? '로그인' : '회원가입') + ' | AQUABIT';
    forms[mode].querySelector('input').focus();
  }
  tabs.login.addEventListener('click', () => show('login'));
  tabs.register.addEventListener('click', () => show('register'));
  show(Aqua.qs('mode') === 'register' ? 'register' : 'login');

  async function submit(form, path) {
    const err = form.querySelector('[data-error]');
    const btn = form.querySelector('button[type=submit]');
    err.textContent = '';
    const body = Object.fromEntries(new FormData(form));
    btn.disabled = true;
    try {
      const { user } = await Aqua.api(path, { method: 'POST', body });
      location.href = dest(user);
    } catch (e) {
      err.textContent = e.message;
      btn.disabled = false;
    }
  }

  forms.login.addEventListener('submit', (e) => { e.preventDefault(); submit(forms.login, '/auth/login'); });
  forms.register.addEventListener('submit', (e) => { e.preventDefault(); submit(forms.register, '/auth/register'); });
})();
