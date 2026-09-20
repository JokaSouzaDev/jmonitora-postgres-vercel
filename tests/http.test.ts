import assert from "node:assert/strict";
import test from "node:test";
import request from "supertest";
import app from "../src/app.js";

test("entrega a tela de login e cabeçalhos de segurança", async () => {
  const response = await request(app).get("/");
  assert.equal(response.status, 200);
  assert.match(response.text, /Entrar \| JM Monitora/);
  assert.match(
    String(response.headers["content-security-policy"]),
    /default-src 'self'/,
  );
  assert.equal(response.headers["x-powered-by"], undefined);
});

test("protege as rotas de alunos sem autenticação", async () => {
  const response = await request(app).get("/api/alunos");
  assert.equal(response.status, 401);
  assert.equal(response.body.codigo, "UNAUTHORIZED");
});

test("rejeita login malformado antes de consultar o banco", async () => {
  const response = await request(app)
    .post("/api/auth/login")
    .send({ email: "invalido", password: "123" });
  assert.equal(response.status, 400);
  assert.equal(response.body.codigo, "VALIDATION_ERROR");
});

test("retorna JSON padronizado para rota inexistente", async () => {
  const response = await request(app).get("/api/inexistente");
  assert.equal(response.status, 404);
  assert.equal(response.body.codigo, "NOT_FOUND");
});

test("JSON malformado e corpo excessivo retornam erros de cliente", async () => {
  assert.equal(
    (
      await request(app)
        .post("/api/auth/login")
        .set("Content-Type", "application/json")
        .send("{broken")
    ).status,
    400,
  );
  assert.equal(
    (
      await request(app)
        .post("/api/auth/login")
        .send({ x: "a".repeat(40000) })
    ).status,
    413,
  );
});
test("origem externa e forwarded host forjado não autorizam escrita", async () => {
  const r = await request(app)
    .post("/api/auth/logout")
    .set("Origin", "https://evil.example")
    .set("X-Forwarded-Host", "evil.example");
  assert.equal(r.status, 403);
});
