export const $ = (selector) => document.querySelector(selector);
export const $$ = (selector) => [...document.querySelectorAll(selector)];
export function feedback(selector, message = "", type = "error") {
  const element = $(selector);
  element.textContent = message;
  element.className = `alert ${message ? type : "hidden"}`;
}
export async function api(url, { method = "GET", body } = {}) {
  let response;
  try {
    response = await fetch(url, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
      headers: {
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new Error(
      navigator.onLine
        ? "Não foi possível confirmar a operação. Tente novamente; os dados do formulário foram mantidos."
        : "Você está sem conexão. Reconecte e tente novamente.",
    );
  }
  const data =
    response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(
      data?.erro || "Não foi possível concluir a operação.",
    );
    error.status = response.status;
    error.code = data?.codigo;
    throw error;
  }
  return data;
}
export async function busy(form, work) {
  const button = form.querySelector('button[type="submit"]');
  const label = button.textContent;
  if (button.disabled) return;
  button.disabled = true;
  button.textContent = "Aguarde…";
  form.setAttribute("aria-busy", "true");
  try {
    await work();
  } finally {
    button.disabled = false;
    button.textContent = label;
    form.removeAttribute("aria-busy");
  }
}
export function escapeHtml(value) {
  const e = document.createElement("span");
  e.textContent = value ?? "";
  return e.innerHTML;
}
export function formatDate(value, full = false) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    ...(full ? { timeStyle: "short" } : {}),
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}
export function togglePasswords() {
  $$("[data-password]").forEach((button) =>
    button.addEventListener("click", () => {
      const field = $(button.dataset.password);
      field.type = field.type === "password" ? "text" : "password";
      button.textContent = field.type === "password" ? "Mostrar" : "Ocultar";
      button.setAttribute("aria-label", `${button.textContent} senha`);
    }),
  );
}
