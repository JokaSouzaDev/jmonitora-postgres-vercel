(() => {
  'use strict';
  const state = { user: null, students: [], reports: [], users: [], currentView: '' };
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const roleLabels = { MONITOR: 'Monitor', PROFESSOR: 'Professor', ADMIN: 'Administrador' };

  document.addEventListener('DOMContentLoaded', boot);

  async function boot() {
    try {
      const data = await api('/api/auth/me');
      state.user = data.user;
      configureUser();
      bindEvents();
      $('#boot').classList.add('hidden');
      $('#app').classList.remove('hidden');
      const firstView = state.user.role === 'MONITOR' ? 'registrar' : 'relatorios';
      await openView(firstView);
    } catch {
      window.location.replace('/');
    }
  }

  function configureUser() {
    const user = state.user;
    $('#user-name').textContent = user.name;
    $('#user-role').textContent = roleLabels[user.role];
    $('#avatar').textContent = initials(user.name);
    $$('[class*="role-"]').forEach((element) => {
      const allowed = element.classList.contains(`role-${user.role.toLowerCase()}`);
      element.classList.toggle('hidden', !allowed);
    });
  }

  function bindEvents() {
    $$('.nav-item').forEach((button) => button.addEventListener('click', () => openView(button.dataset.view)));
    $('#menu-toggle').addEventListener('click', () => $('.sidebar').classList.toggle('open'));
    $('#logout').addEventListener('click', logout);
    $('#report-form').addEventListener('submit', createReport);
    $('#observation').addEventListener('input', updateCount);
    $('#report-form').addEventListener('reset', () => setTimeout(updateCount));
    $('#report-search').addEventListener('input', debounce(loadReports, 250));
    $('#report-refresh').addEventListener('click', loadReports);
    $('#student-search').addEventListener('input', debounce(loadStudentsTable, 250));
    $('#show-inactive-students').addEventListener('change', loadStudentsTable);
    $('#new-student').addEventListener('click', () => openStudentDialog());
    $('#student-form').addEventListener('submit', saveStudent);
    $('#new-user').addEventListener('click', () => $('#user-dialog').showModal());
    $('#user-form').addEventListener('submit', createUser);
    $$('.close-dialog').forEach((button) => button.addEventListener('click', () => button.closest('dialog').close()));
  }

  async function openView(name) {
    state.currentView = name;
    $$('.view').forEach((view) => view.classList.add('hidden'));
    $(`#view-${name}`).classList.remove('hidden');
    $$('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.view === name));
    $('.sidebar').classList.remove('open');
    const titles = { registrar: 'Nova observação', relatorios: 'Relatórios', alunos: 'Alunos', usuarios: 'Usuários' };
    $('#page-title').textContent = titles[name];
    try {
      if (name === 'registrar') await loadStudentSelect();
      if (name === 'relatorios') await loadReports();
      if (name === 'alunos') await loadStudentsTable();
      if (name === 'usuarios') await loadUsers();
    } catch (error) {
      notify(error.message, 'error');
    }
  }

  async function loadStudentSelect() {
    const students = await api('/api/alunos');
    state.students = students;
    const select = $('#report-student');
    select.replaceChildren(option('', students.length ? 'Selecione um aluno' : 'Nenhum aluno ativo cadastrado'));
    students.forEach((student) => select.append(option(student.id, `${student.name} — RA ${student.ra}`)));
  }

  async function createReport(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('[type="submit"]');
    setButton(submit, true, 'Salvando...');
    showLocal('#report-feedback', '', '');
    try {
      await api('/api/relatorios', {
        method: 'POST',
        body: { studentId: $('#report-student').value, observation: $('#observation').value },
      });
      form.reset();
      showLocal('#report-feedback', 'Observação registrada com sucesso.', 'success');
    } catch (error) {
      showLocal('#report-feedback', error.message, 'error');
    } finally {
      setButton(submit, false, 'Salvar observação');
    }
  }

  async function loadReports() {
    const search = $('#report-search').value.trim();
    state.reports = await api(`/api/relatorios${search ? `?busca=${encodeURIComponent(search)}` : ''}`);
    $('#report-total').textContent = `${state.reports.length} ${state.reports.length === 1 ? 'registro' : 'registros'}`;
    const rows = $('#report-rows');
    rows.replaceChildren();
    state.reports.forEach((report) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td><strong>${escapeHtml(report.studentName)}</strong></td><td>${escapeHtml(report.studentRa)}</td><td class="cell-observation">${escapeHtml(report.observation)}</td><td>${escapeHtml(report.authorName)}</td><td>${formatDate(report.createdAt)}</td><td><button class="table-action" type="button">Detalhes</button></td>`;
      tr.querySelector('button').addEventListener('click', () => showReport(report));
      rows.append(tr);
    });
    $('#report-empty').classList.toggle('hidden', state.reports.length !== 0);
  }

  function showReport(report) {
    $('#detail-student').textContent = report.studentName;
    $('#detail-ra').textContent = report.studentRa;
    $('#detail-author').textContent = report.authorName;
    $('#detail-date').textContent = formatDate(report.createdAt, true);
    $('#detail-observation').textContent = report.observation;
    $('#report-dialog').showModal();
  }

  async function loadStudentsTable() {
    const params = new URLSearchParams();
    if ($('#student-search').value.trim()) params.set('busca', $('#student-search').value.trim());
    if ($('#show-inactive-students').checked) params.set('inativos', 'true');
    state.students = await api(`/api/alunos${params.size ? `?${params}` : ''}`);
    const rows = $('#student-rows');
    rows.replaceChildren();
    state.students.forEach((student) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td><strong>${escapeHtml(student.name)}</strong></td><td>${escapeHtml(student.ra)}</td><td>${escapeHtml(student.course)}</td><td>${student.semester}º</td><td><span class="badge ${student.active ? '' : 'inactive'}">${student.active ? 'Ativo' : 'Inativo'}</span></td><td><button class="table-action" type="button">Editar</button></td>`;
      tr.querySelector('button').addEventListener('click', () => openStudentDialog(student));
      rows.append(tr);
    });
    $('#student-empty').classList.toggle('hidden', state.students.length !== 0);
  }

  function openStudentDialog(student = null) {
    $('#student-form').reset();
    $('#student-id').value = student?.id || '';
    $('#student-dialog-title').textContent = student ? 'Editar aluno' : 'Novo aluno';
    $('#student-name').value = student?.name || '';
    $('#student-ra').value = student?.ra || '';
    $('#student-email').value = student?.email || '';
    $('#student-phone').value = student?.phone || '';
    $('#student-course').value = student?.course || '';
    $('#student-semester').value = student?.semester || 1;
    $('#student-active').checked = student?.active ?? true;
    $('#student-active-wrap').classList.toggle('hidden', !student);
    showLocal('#student-feedback', '', '');
    $('#student-dialog').showModal();
  }

  async function saveStudent(event) {
    event.preventDefault();
    const id = $('#student-id').value;
    const body = {
      name: $('#student-name').value,
      ra: $('#student-ra').value,
      email: $('#student-email').value,
      phone: $('#student-phone').value,
      course: $('#student-course').value,
      semester: Number($('#student-semester').value),
    };
    if (id) body.active = $('#student-active').checked;
    const submit = event.currentTarget.querySelector('[type="submit"]');
    setButton(submit, true, 'Salvando...');
    try {
      await api(id ? `/api/alunos/${id}` : '/api/alunos', { method: id ? 'PATCH' : 'POST', body });
      $('#student-dialog').close();
      notify(id ? 'Aluno atualizado.' : 'Aluno cadastrado.', 'success');
      await loadStudentsTable();
    } catch (error) {
      showLocal('#student-feedback', error.message, 'error');
    } finally {
      setButton(submit, false, 'Salvar aluno');
    }
  }

  async function loadUsers() {
    state.users = await api('/api/usuarios');
    const rows = $('#user-rows');
    rows.replaceChildren();
    state.users.forEach((user) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td><strong>${escapeHtml(user.name)}</strong></td><td>${escapeHtml(user.email)}</td><td>${roleLabels[user.role]}</td><td><span class="badge ${user.active ? '' : 'inactive'}">${user.active ? 'Ativo' : 'Inativo'}</span></td><td><button class="table-action" type="button" ${user.id === state.user.id ? 'disabled' : ''}>${user.active ? 'Desativar' : 'Ativar'}</button></td>`;
      tr.querySelector('button').addEventListener('click', () => toggleUser(user));
      rows.append(tr);
    });
  }

  async function createUser(event) {
    event.preventDefault();
    const submit = event.currentTarget.querySelector('[type="submit"]');
    setButton(submit, true, 'Criando...');
    try {
      await api('/api/usuarios', { method: 'POST', body: { name: $('#account-name').value, email: $('#account-email').value, password: $('#account-password').value, role: $('#account-role').value } });
      event.currentTarget.reset();
      $('#user-dialog').close();
      notify('Usuário criado com sucesso.', 'success');
      await loadUsers();
    } catch (error) {
      showLocal('#user-feedback', error.message, 'error');
    } finally {
      setButton(submit, false, 'Criar usuário');
    }
  }

  async function toggleUser(user) {
    if (!confirm(`${user.active ? 'Desativar' : 'Ativar'} o acesso de ${user.name}?`)) return;
    try {
      await api(`/api/usuarios/${user.id}`, { method: 'PATCH', body: { active: !user.active } });
      await loadUsers();
      notify('Acesso atualizado.', 'success');
    } catch (error) { notify(error.message, 'error'); }
  }

  async function logout() {
    try { await api('/api/auth/logout', { method: 'POST' }); } catch {}
    window.location.replace('/');
  }

  async function api(url, options = {}) {
    const config = { method: options.method || 'GET', headers: { Accept: 'application/json' } };
    if (options.body !== undefined) {
      config.headers['Content-Type'] = 'application/json';
      config.body = JSON.stringify(options.body);
    }
    const response = await fetch(url, config);
    if (response.status === 401 && !url.endsWith('/me') && !url.endsWith('/login')) {
      window.location.replace('/');
      throw new Error('Sua sessão expirou.');
    }
    const data = response.status === 204 ? null : await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.erro || `Erro HTTP ${response.status}.`);
    return data;
  }

  function notify(message, type = 'success') {
    const alert = $('#global-feedback');
    alert.textContent = message;
    alert.className = `alert ${type}`;
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => alert.classList.add('hidden'), 4500);
  }

  function showLocal(selector, message, type) {
    const element = $(selector);
    element.textContent = message;
    element.className = `alert ${message ? type : 'hidden'}`;
  }

  function setButton(button, loading, text) { button.disabled = loading; button.textContent = text; }
  function updateCount() { $('#observation-count').textContent = `${$('#observation').value.length} / 2000`; }
  function option(value, label) { const node = document.createElement('option'); node.value = value; node.textContent = label; return node; }
  function initials(name) { return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase(); }
  function formatDate(value, complete = false) { return new Intl.DateTimeFormat('pt-BR', complete ? { dateStyle: 'short', timeStyle: 'short' } : { dateStyle: 'short' }).format(new Date(value)); }
  function escapeHtml(value) { const div = document.createElement('div'); div.textContent = value ?? ''; return div.innerHTML; }
  function debounce(fn, wait) { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), wait); }; }
})();
