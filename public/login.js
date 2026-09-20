import { $, api, busy, feedback, togglePasswords } from "./common.js";
togglePasswords();
api("/api/auth/me")
  .then(() => location.replace("/app.html"))
  .catch(() => {});
$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  feedback("#feedback");
  await busy(event.currentTarget, async () => {
    try {
      await api("/api/auth/login", {
        method: "POST",
        body: {
          identifier: $("#identifier").value,
          password: $("#password").value,
        },
      });
      location.replace("/app.html");
    } catch (error) {
      feedback("#feedback", error.message);
    }
  });
});
