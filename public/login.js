(() => {
  'use strict';
  const form = document.querySelector('#login-form');
  const email = document.querySelector('#email');
  const password = document.querySelector('#password');
  const feedback = document.querySelector('#feedback');
  const button = document.querySelector('#login-button');
  const toggle = document.querySelector('#toggle-password');

  fetch('/api/auth/me').then((response) => {
    if (response.ok) window.location.replace('/app.html');
  }).catch(() => {});

  toggle.addEventListener('click', () => {
    const showing = password.type === 'text';
    password.type = showing ? 'password' : 'text';
    toggle.textContent = showing ? 'Mostrar' : 'Ocultar';
    toggle.setAttribute('aria-label', showing ? 'Mostrar senha' : 'Ocultar senha');
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    show('', '');
    button.disabled = true;
    button.textContent = 'Entrando...';
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.value.trim(), password: password.value }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.erro || 'Não foi possível entrar.');
      window.location.replace('/app.html');
    } catch (error) {
      show('error', error.message || 'Não foi possível conectar ao servidor.');
    } finally {
      button.disabled = false;
      button.textContent = 'Entrar no JMonitora+';
    }
  });

  function show(type, message) {
    feedback.className = `alert ${type || 'hidden'}`;
    feedback.textContent = message;
  }
})();
