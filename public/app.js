import {
  $,
  $$,
  api,
  busy,
  feedback,
  escapeHtml as esc,
  formatDate,
} from "./common.js";
const roleLabels = {
  MONITOR: "Monitor",
  PROFESSOR: "Professor",
  ADMIN: "Administrador",
};
const statuses = {
  NEW: "Novo",
  IN_REVIEW: "Em acompanhamento",
  RESOLVED: "Concluído",
};
const state = {
  user: null,
  view: "",
  pages: { reports: 1, students: 1, users: 1 },
  seq: {},
  student: null,
  editStudent: null,
  editUser: null,
  report: null,
  raFilter: "",
  submission: null,
};
const canManage = () => state.user.role !== "MONITOR";
const badge = (status) =>
  `<span class="badge status-${status}">${statuses[status] || esc(status)}</span>`;
function showError(error) {
  if (error.status === 401) $("#session-alert").classList.remove("hidden");
  feedback("#global-feedback", error.message);
}
function safe(fn) {
  return (...args) =>
    Promise.resolve()
      .then(() => fn(...args))
      .catch(showError);
}
function debounce(fn) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(
      safe(() => fn(...args)),
      300,
    );
  };
}
function connection() {
  const el = $("#connection");
  el.textContent = navigator.onLine ? "Conexão disponível" : "Sem conexão";
  el.classList.toggle("offline", !navigator.onLine);
}
window.addEventListener("online", connection);
window.addEventListener("offline", connection);
$("#boot-retry").addEventListener("click", () => location.reload());
async function boot() {
  try {
    state.user = (await api("/api/auth/me")).user;
    $("#user-name").textContent = state.user.name.split(" ")[0];
    $("#avatar").textContent = state.user.name
      .split(/\s+/)
      .slice(0, 2)
      .map((v) => v[0])
      .join("")
      .toUpperCase();
    $$("[data-roles]").forEach((el) =>
      el.classList.toggle(
        "hidden",
        !el.dataset.roles.split(" ").includes(state.user.role),
      ),
    );
    $("#my-account-info").textContent =
      `${state.user.name} · ${roleLabels[state.user.role]} · ${state.user.ra ? `RA ${state.user.ra} · ` : ""}${state.user.email}`;
    $("#today").textContent = new Intl.DateTimeFormat("pt-BR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "America/Sao_Paulo",
    }).format(new Date());
    $("#greeting").textContent =
      `Olá, ${state.user.name.split(" ")[0]}. Vamos acompanhar?`;
    if (!canManage()) {
      $("#report-intro").textContent =
        "Acompanhe suas observações e as devolutivas dos professores.";
      $("#stat-scope").textContent = "Seus registros";
    }
    bindEvents();
    connection();
    $("#boot").classList.add("hidden");
    $("#app").classList.remove("hidden");
    await openView(location.hash.slice(1) || "relatorios");
  } catch (error) {
    if (error.status === 401) {
      location.replace("/");
      return;
    }
    $("#boot-message").textContent = error.message;
    $("#boot-retry").classList.remove("hidden");
  }
}
function bindEvents() {
  $$(".nav-item").forEach((b) =>
    b.addEventListener(
      "click",
      safe(() => openView(b.dataset.view)),
    ),
  );
  $$("[data-go]").forEach((b) =>
    b.addEventListener(
      "click",
      safe(() => openView(b.dataset.go)),
    ),
  );
  window.addEventListener(
    "hashchange",
    safe(() => openView(location.hash.slice(1))),
  );
  $("#account-open").addEventListener("click", () =>
    $("#account-dialog").showModal(),
  );
  $$(".close-dialog").forEach((b) =>
    b.addEventListener("click", () => b.closest("dialog").close()),
  );
  $("#logout").addEventListener("click", async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
      location.replace("/");
    } catch (e) {
      feedback("#logout-feedback", e.message);
    }
  });
  $("#password-form").addEventListener("submit", changePassword);
  $("#report-form").addEventListener("submit", createReport);
  $("#find-student").addEventListener("click", safe(findStudent));
  $("#report-ra").addEventListener("input", () => {
    state.student = null;
    $("#selected-student").classList.add("hidden");
  });
  $("#lookup-search").addEventListener("input", debounce(lookupStudents));
  $("#observation").addEventListener(
    "input",
    () =>
      ($("#observation-count").textContent =
        `${$("#observation").value.length} / 2000`),
  );
  $("#clear-report").addEventListener("click", () => {
    if (
      !$("#observation").value ||
      confirm("Limpar a observação que ainda não foi salva?")
    )
      resetReport();
  });
  $("#report-search").addEventListener(
    "input",
    debounce(() => {
      state.pages.reports = 1;
      return loadReports();
    }),
  );
  ["#report-status", "#report-from", "#report-to"].forEach((s) =>
    $(s).addEventListener(
      "change",
      safe(() => {
        state.pages.reports = 1;
        return loadReports();
      }),
    ),
  );
  $("#report-refresh").addEventListener("click", safe(loadReports));
  $("#clear-report-filters").addEventListener(
    "click",
    safe(() => {
      [
        "#report-search",
        "#report-status",
        "#report-from",
        "#report-to",
      ].forEach((s) => ($(s).value = ""));
      state.raFilter = "";
      state.pages.reports = 1;
      return loadReports();
    }),
  );
  $("#student-search").addEventListener(
    "input",
    debounce(() => {
      state.pages.students = 1;
      return loadStudents();
    }),
  );
  $("#show-inactive-students").addEventListener(
    "change",
    safe(() => {
      state.pages.students = 1;
      return loadStudents();
    }),
  );
  $("#new-student").addEventListener("click", () => openStudent());
  $("#student-form").addEventListener("submit", saveStudent);
  $("#user-search").addEventListener(
    "input",
    debounce(() => {
      state.pages.users = 1;
      return loadUsers();
    }),
  );
  $("#pending-users").addEventListener(
    "change",
    safe(() => {
      state.pages.users = 1;
      return loadUsers();
    }),
  );
  $("#new-user").addEventListener("click", () => openUser());
  $("#user-form").addEventListener("submit", saveUser);
  $("#account-role").addEventListener(
    "change",
    () => ($("#account-ra").required = $("#account-role").value === "MONITOR"),
  );
  $("#review-form").addEventListener("submit", saveReview);
  $("#print-report").addEventListener("click", () => window.print());
  $$("[data-page]").forEach((b) =>
    b.addEventListener(
      "click",
      safe(() => {
        const type = b.dataset.page;
        state.pages[type] += Number(b.dataset.direction);
        return loaders[type]();
      }),
    ),
  );
}
const loaders = {
  reports: loadReports,
  students: loadStudents,
  users: loadUsers,
};
async function openView(view) {
  const allowed = [
    "relatorios",
    "registrar",
    ...(canManage() ? ["alunos"] : []),
    ...(state.user.role === "ADMIN" ? ["usuarios"] : []),
  ];
  if (!allowed.includes(view)) view = "relatorios";
  state.view = view;
  $$(".view").forEach((el) =>
    el.classList.toggle("hidden", el.id !== `view-${view}`),
  );
  $$(".nav-item").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === view);
    if (b.dataset.view === view) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  history.replaceState(null, "", `#${view}`);
  $("#page-title").textContent = {
    relatorios: "Visão geral",
    registrar: "Nova observação",
    alunos: "Alunos",
    usuarios: "Gestão de acessos",
  }[view];
  feedback("#global-feedback");
  try {
    if (view === "relatorios") await loadReports();
    if (view === "alunos") await loadStudents();
    if (view === "usuarios") await loadUsers();
  } catch (e) {
    showError(e);
  }
}
function empty(text) {
  return `<div class="empty"><span class="empty-mark" aria-hidden="true">◎</span><h3>${text}</h3><p>Tente ajustar a busca ou os filtros.</p></div>`;
}
function renderPagination(type, data) {
  const max = Math.max(1, Math.ceil(data.total / data.limit));
  $(`#${type}-page`).textContent =
    `${data.total} ${data.total === 1 ? "registro" : "registros"} · ${data.page} / ${max}`;
  $$(`[data-page="${type}"]`).forEach(
    (b) =>
      (b.disabled =
        Number(b.dataset.direction) < 0 ? data.page <= 1 : data.page >= max),
  );
}
async function loadList(type, url, render) {
  const seq = (state.seq[type] || 0) + 1;
  state.seq[type] = seq;
  const el = $(`#${type}-list`);
  el.setAttribute("aria-busy", "true");
  $$(`[data-page="${type}"]`).forEach((b) => (b.disabled = true));
  try {
    const data = await api(url);
    if (state.seq[type] !== seq) return;
    el.replaceChildren();
    render(data.items, el);
    renderPagination(type, data);
  } catch (e) {
    if (state.seq[type] !== seq) return;
    el.innerHTML = empty("Não foi possível carregar a lista.");
    throw e;
  } finally {
    if (state.seq[type] === seq) el.removeAttribute("aria-busy");
  }
}
async function loadReports() {
  const params = new URLSearchParams({
    pagina: state.pages.reports,
    limite: 20,
    busca: $("#report-search").value,
    status: $("#report-status").value,
    de: $("#report-from").value,
    ate: $("#report-to").value,
  });
  if (state.raFilter) params.set("ra", state.raFilter);
  $("#ra-filter").textContent =
    `Histórico do RA ${state.raFilter}. Use “Limpar filtros” para voltar a todos.`;
  $("#ra-filter").classList.toggle("hidden", !state.raFilter);
  const summarySeq = (state.seq.summary || 0) + 1;
  state.seq.summary = summarySeq;
  await Promise.all([
    loadList("reports", `/api/relatorios?${params}`, (items, list) => {
      if (!items.length) {
        list.innerHTML = empty("Nenhuma observação encontrada.");
        return;
      }
      items.forEach((r) => {
        const card = document.createElement("article");
        card.className = "record report-card";
        card.innerHTML = `<div class="record-main"><div class="record-top"><span class="ra-tag">RA ${esc(r.studentRa)}</span>${badge(r.status)}</div><h3>${esc(r.studentName)}</h3><p class="record-course">${esc(r.className || r.course)}</p><p class="record-excerpt">${esc(r.observation)}</p><div class="record-meta"><span>${esc(r.authorName)}</span><time>${formatDate(r.createdAt)}</time></div></div><button class="button subtle" type="button">Ver acompanhamento →</button>`;
        card.querySelector("button").addEventListener(
          "click",
          safe(() => showReport(r.id)),
        );
        list.append(card);
      });
    }),
    api("/api/relatorios/resumo").then((data) => {
      if (state.seq.summary === summarySeq)
        Object.entries(data).forEach(([key, value]) => {
          const el = $(`#stat-${key}`);
          if (el) el.textContent = value;
        });
    }),
  ]);
}
async function loadStudents() {
  const params = new URLSearchParams({
    pagina: state.pages.students,
    limite: 20,
    busca: $("#student-search").value,
    inativos: $("#show-inactive-students").checked,
  });
  await loadList("students", `/api/alunos?${params}`, (items, list) => {
    if (!items.length) {
      list.innerHTML = empty("Nenhum aluno encontrado.");
      return;
    }
    items.forEach((s) => {
      const card = document.createElement("article");
      card.className = "record person-card";
      card.innerHTML = `<div class="record-main"><div class="record-top"><span class="ra-tag">RA ${esc(s.ra)}</span><span class="badge ${s.active ? "status-RESOLVED" : "inactive"}">${s.active ? "Ativo" : "Inativo"}</span></div><h3>${esc(s.name)}</h3><p>${esc(s.course)} · ${s.semester}º semestre</p><p class="muted">${esc(s.className || "Turma não informada")}</p></div><div class="record-actions"><button type="button" class="button subtle">Ver histórico</button><button type="button" class="button">Editar cadastro</button></div>`;
      const buttons = card.querySelectorAll("button");
      buttons[0].addEventListener(
        "click",
        safe(() => {
          state.raFilter = s.ra;
          state.pages.reports = 1;
          $("#report-search").value = "";
          $("#report-status").value = "";
          $("#report-from").value = "";
          $("#report-to").value = "";
          return openView("relatorios");
        }),
      );
      buttons[1].addEventListener("click", () => openStudent(s));
      list.append(card);
    });
  });
}
async function loadUsers() {
  const params = new URLSearchParams({
    pagina: state.pages.users,
    limite: 20,
    busca: $("#user-search").value,
    pendentes: $("#pending-users").checked,
  });
  await loadList("users", `/api/usuarios?${params}`, (items, list) => {
    if (!items.length) {
      list.innerHTML = empty("Nenhum acesso encontrado.");
      return;
    }
    items.forEach((u) => {
      const pending = u.approvalStatus === "PENDING";
      const card = document.createElement("article");
      card.className = "record person-card";
      card.innerHTML = `<div class="record-main"><div class="record-top"><span class="ra-tag">${u.ra ? `RA ${esc(u.ra)}` : roleLabels[u.role]}</span><span class="badge ${pending ? "status-NEW" : u.active ? "status-RESOLVED" : "inactive"}">${pending ? "Aguardando aprovação" : u.approvalStatus === "REJECTED" ? "Recusado" : u.active ? "Ativo" : "Inativo"}</span></div><h3>${esc(u.name)}</h3><p>${esc(u.email)}</p><small class="muted">${roleLabels[u.role]}${u.role === "MONITOR" && !u.ra ? " · RA ainda não vinculado" : ""}</small></div><button type="button" class="button ${pending ? "primary" : ""}">${pending ? "Analisar solicitação" : "Gerenciar acesso"}</button>`;
      card.querySelector("button").addEventListener("click", () => openUser(u));
      list.append(card);
    });
  });
}
function selectStudent(student) {
  state.student = student;
  $("#report-ra").value = student.ra;
  $("#selected-student").replaceChildren();
  const strong = document.createElement("strong");
  strong.textContent = student.name;
  const small = document.createElement("small");
  small.textContent = `RA ${student.ra} · ${student.className || student.course}`;
  $("#selected-student").append(strong, small);
  $("#selected-student").classList.remove("hidden");
  $("#lookup-results").replaceChildren();
  $("#lookup-search").value = "";
}
async function findStudent() {
  const ra = $("#report-ra").value.trim();
  if (!ra) {
    feedback("#report-feedback", "Informe o RA do aluno.");
    return;
  }
  const original = ra;
  $("#find-student").disabled = true;
  try {
    const s = await api(`/api/alunos/ra/${encodeURIComponent(ra)}`);
    if ($("#report-ra").value.trim() === original) {
      selectStudent(s);
      feedback("#report-feedback");
    }
  } catch (e) {
    state.student = null;
    feedback("#report-feedback", e.message);
    if (e.status === 401) showError(e);
  } finally {
    $("#find-student").disabled = false;
  }
}
async function lookupStudents() {
  const seq = (state.seq.lookup || 0) + 1;
  state.seq.lookup = seq;
  const search = $("#lookup-search").value.trim();
  $("#lookup-results").replaceChildren();
  if (search.length < 2) return;
  const data = await api(
    `/api/alunos?limite=10&busca=${encodeURIComponent(search)}`,
  );
  if (state.seq.lookup !== seq) return;
  if (!data.items.length) {
    $("#lookup-results").textContent = "Nenhum aluno encontrado.";
    return;
  }
  data.items.forEach((s) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "lookup-option";
    b.textContent = `${s.name} · RA ${s.ra}`;
    b.addEventListener("click", () => selectStudent(s));
    $("#lookup-results").append(b);
  });
  if (data.total > 10) {
    const hint = document.createElement("small");
    hint.textContent =
      "Há mais resultados. Digite um nome mais completo ou o RA.";
    $("#lookup-results").append(hint);
  }
}
function resetReport() {
  state.student = null;
  state.submission = null;
  $("#report-form").reset();
  $("#selected-student").classList.add("hidden");
  $("#lookup-results").replaceChildren();
  $("#observation-count").textContent = "0 / 2000";
  feedback("#report-feedback");
}
async function createReport(event) {
  event.preventDefault();
  const form = event.currentTarget;
  await busy(form, async () => {
    try {
      if (!state.student) await findStudent();
      if (!state.student) return;
      const body = {
        studentRa: state.student.ra,
        observation: $("#observation").value,
      };
      const fingerprint = JSON.stringify(body);
      if (state.submission?.fingerprint !== fingerprint)
        state.submission = { fingerprint, key: crypto.randomUUID() };
      await api("/api/relatorios", {
        method: "POST",
        body: { ...body, requestKey: state.submission.key },
      });
      resetReport();
      feedback(
        "#report-feedback",
        "Observação salva. Você pode acompanhar a devolutiva em “Acompanhar”.",
        "success",
      );
    } catch (e) {
      feedback("#report-feedback", e.message);
      if (e.status === 401) showError(e);
    }
  });
}
function openStudent(s = null) {
  state.editStudent = s;
  $("#student-form").reset();
  $("#student-dialog-title").textContent = s ? "Editar aluno" : "Novo aluno";
  for (const [id, key] of [
    ["name", "name"],
    ["ra", "ra"],
    ["class", "className"],
    ["course", "course"],
    ["email", "email"],
    ["phone", "phone"],
  ])
    $(`#student-${id}`).value = s?.[key] || "";
  $("#student-semester").value = s?.semester || 1;
  $("#student-active").checked = s?.active ?? true;
  $("#student-active-wrap").classList.toggle("hidden", !s);
  feedback("#student-feedback");
  $("#student-dialog").showModal();
}
async function saveStudent(event) {
  event.preventDefault();
  await busy(event.currentTarget, async () => {
    try {
      const old = state.editStudent;
      const body = {
        name: $("#student-name").value,
        ra: $("#student-ra").value,
        className: $("#student-class").value,
        course: $("#student-course").value,
        semester: Number($("#student-semester").value),
        email: $("#student-email").value,
        phone: $("#student-phone").value,
      };
      if (old) {
        body.version = old.version;
        body.active = $("#student-active").checked;
        if (
          old.ra !== body.ra.trim().toUpperCase() &&
          !confirm(
            "Corrigir o RA? O histórico e os acessos vinculados acompanharão essa alteração.",
          )
        )
          return;
      }
      await api(
        old ? `/api/alunos/ra/${encodeURIComponent(old.ra)}` : "/api/alunos",
        { method: old ? "PATCH" : "POST", body },
      );
      $("#student-dialog").close();
      feedback("#global-feedback", "Cadastro salvo com sucesso.", "success");
      await loadStudents();
    } catch (e) {
      feedback("#student-feedback", e.message);
      if (e.status === 401) showError(e);
    }
  });
}
function openUser(u = null) {
  state.editUser = u;
  $("#user-form").reset();
  $("#user-dialog-title").textContent =
    u?.approvalStatus === "PENDING"
      ? "Analisar solicitação"
      : u
        ? "Gerenciar acesso"
        : "Criar acesso";
  for (const key of ["name", "email", "ra"])
    $(`#account-${key}`).value = u?.[key] || "";
  $("#account-email").readOnly = !!u;
  $("#account-role").value = u?.role || "MONITOR";
  $("#account-ra").required = $("#account-role").value === "MONITOR";
  $("#account-active").checked = u?.active ?? true;
  $("#account-active-wrap").classList.toggle(
    "hidden",
    !u || u.approvalStatus === "PENDING",
  );
  $("#account-approval-wrap").classList.toggle(
    "hidden",
    !u || u.approvalStatus === "APPROVED",
  );
  $("#account-password").required = !u;
  $("#account-password-hint").textContent = u
    ? "Deixe a senha em branco para manter a atual. Alterações de acesso encerram as sessões dessa conta."
    : "Compartilhe a senha inicial somente com a pessoa cadastrada.";
  feedback("#user-feedback");
  $("#user-dialog").showModal();
}
async function saveUser(event) {
  event.preventDefault();
  await busy(event.currentTarget, async () => {
    try {
      const u = state.editUser;
      const body = {
        name: $("#account-name").value,
        ra: $("#account-ra").value,
        role: $("#account-role").value,
      };
      if (u) {
        body.version = u.version;
        body.active = $("#account-active").checked;
        if ($("#account-approval").value) {
          body.approvalStatus = $("#account-approval").value;
          body.active = body.approvalStatus === "APPROVED";
        }
        if ($("#account-password").value)
          body.password = $("#account-password").value;
      } else {
        body.email = $("#account-email").value;
        body.password = $("#account-password").value;
      }
      await api(u ? `/api/usuarios/${u.id}` : "/api/usuarios", {
        method: u ? "PATCH" : "POST",
        body,
      });
      $("#user-dialog").close();
      feedback("#global-feedback", "Acesso atualizado.", "success");
      if (u?.id === state.user.id) {
        location.replace("/");
        return;
      }
      await loadUsers();
    } catch (e) {
      feedback("#user-feedback", e.message);
      if (e.status === 401) showError(e);
    }
  });
}
async function showReport(id) {
  const r = await api(`/api/relatorios/${id}`);
  state.report = r;
  $("#detail-student").textContent = r.studentName;
  $("#detail-meta").textContent =
    `RA ${r.studentRa} · ${r.authorName} · ${formatDate(r.createdAt, true)}`;
  $("#detail-status").textContent = statuses[r.status];
  $("#detail-status").className = `badge status-${r.status}`;
  $("#detail-observation").textContent = r.observation;
  $("#report-events").replaceChildren();
  if (!r.events.length)
    $("#report-events").innerHTML =
      '<p class="muted">Ainda não há devolutivas para esta observação.</p>';
  r.events.forEach((e) => {
    const item = document.createElement("article");
    item.className = "timeline-item";
    item.innerHTML = `${badge(e.status)}<p class="event-note">${esc(e.note)}</p><small>${esc(e.actorName)} · ${formatDate(e.createdAt, true)}</small>`;
    $("#report-events").append(item);
  });
  $("#review-form").classList.toggle("hidden", !canManage());
  $("#review-form").reset();
  $("#review-status").value = r.status;
  feedback("#review-feedback");
  if (!$("#report-dialog").open) $("#report-dialog").showModal();
}
async function saveReview(event) {
  event.preventDefault();
  await busy(event.currentTarget, async () => {
    try {
      await api(`/api/relatorios/${state.report.id}`, {
        method: "PATCH",
        body: {
          status: $("#review-status").value,
          note: $("#review-note").value,
          version: state.report.version,
        },
      });
      await showReport(state.report.id);
      feedback("#review-feedback", "Acompanhamento registrado.", "success");
      await loadReports();
    } catch (e) {
      feedback("#review-feedback", e.message);
      if (e.status === 401) showError(e);
    }
  });
}
async function changePassword(event) {
  event.preventDefault();
  if ($("#new-password").value !== $("#confirm-new-password").value) {
    feedback("#password-feedback", "As novas senhas não coincidem.");
    return;
  }
  await busy(event.currentTarget, async () => {
    try {
      await api("/api/auth/password", {
        method: "POST",
        body: {
          currentPassword: $("#current-password").value,
          newPassword: $("#new-password").value,
        },
      });
      location.replace("/");
    } catch (e) {
      feedback("#password-feedback", e.message);
    }
  });
}
window.addEventListener("beforeunload", (event) => {
  if ($("#observation").value || $("#review-note").value) {
    event.preventDefault();
    event.returnValue = "";
  }
});
boot();
