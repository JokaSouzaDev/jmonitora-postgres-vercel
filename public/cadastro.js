import { $, api, busy, feedback, togglePasswords } from "./common.js";
togglePasswords();
$("#role").addEventListener("change", () => {
  $("#ra").required = $("#role").value === "MONITOR";
  $("#ra-hint").textContent = $("#ra").required
    ? "Obrigatório para monitores"
    : "Opcional para professores";
});
$("#register-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  feedback("#feedback");
  if ($("#password").value !== $("#confirm-password").value) {
    feedback("#feedback", "As senhas não coincidem.");
    $("#confirm-password").focus();
    return;
  }
  await busy(event.currentTarget, async () => {
    try {
      const data = await api("/api/auth/register", {
        method: "POST",
        body: {
          name: $("#name").value,
          ra: $("#ra").value,
          email: $("#email").value,
          role: $("#role").value,
          password: $("#password").value,
        },
      });
      $("#register-form").reset();
      $("#register-form").classList.add("hidden");
      $("#success-message").textContent = data.message;
      $("#registration-success").classList.remove("hidden");
    } catch (error) {
      feedback("#feedback", error.message);
    }
  });
});
