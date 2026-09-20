import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import bcrypt from "bcryptjs";
import request from "supertest";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import app from "../src/app.js";
import { query, closePool, transaction } from "../src/db.js";
import { migrate } from "../scripts/migrate.js";

const legacyStudent = randomUUID(),
  adminId = randomUUID(),
  legacyReport = randomUUID();
const password = "Apenas-para-testes-2026";
let db: PGlite;
let socket: PGLiteSocketServer;
const admin = request.agent(app),
  monitor = request.agent(app),
  teacher = request.agent(app);
let registeredId: string;
let createdReport: string;
process.env.JWT_SECRET = "test-only-secret-not-used-in-any-real-environment";
process.env.NODE_ENV = "test";
process.env.PG_POOL_MAX = "1";
delete process.env.ADMIN_EMAIL;
delete process.env.APP_ORIGIN;
before(async () => {
  // Always use an isolated database; never read real school records.
  db = await PGlite.create();
  socket = new PGLiteSocketServer({ db, port: 55433, host: "127.0.0.1" });
  await socket.start();
  process.env.DATABASE_URL =
    "postgresql://postgres:postgres@127.0.0.1:55433/postgres?sslmode=disable";
  await query(
    await readFile(
      new URL("../db/migrations/001_initial.sql", import.meta.url),
      "utf8",
    ),
  );
  await query(
    `INSERT INTO app_users(id,name,email,password_hash,role) VALUES($1,'Admin Teste','admin@example.test',$2,'ADMIN')`,
    [adminId, await bcrypt.hash(password, 4)],
  );
  await query(
    `INSERT INTO students(id,ra,name,course,semester) VALUES($1,'000123','Aluno Legado','DS',1)`,
    [legacyStudent],
  );
  await query(
    `INSERT INTO reports(id,student_id,author_id,observation) VALUES($1,$2,$3,'Observação anterior preservada.')`,
    [legacyReport, legacyStudent, adminId],
  );
  await migrate();
  await migrate();
  assert.equal(
    (
      await admin
        .post("/api/auth/login")
        .send({ identifier: "admin@example.test", password })
    ).status,
    200,
  );
});
after(async () => {
  await closePool();
  if (socket) await socket.stop();
  if (db) await db.close();
});

test("migração preserva dados, transforma RA em PK e é repetível", async () => {
  const row = (
    await query(
      "SELECT student_ra,student_id,status FROM reports WHERE id=$1",
      [legacyReport],
    )
  ).rows[0]!;
  assert.equal(row.student_ra, "000123");
  assert.equal(row.student_id, legacyStudent);
  assert.equal(row.status, "NEW");
  const constraint = (
    await query(
      "SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid='students'::regclass AND contype='p'",
    )
  ).rows[0]!;
  assert.equal(constraint.def, "PRIMARY KEY (ra)");
  assert.equal(
    (await query("SELECT COUNT(*)::int AS n FROM schema_migrations")).rows[0]!
      .n,
    2,
  );
});
test("cadastro de aluno valida RA, mantém zeros e evita duplicidade", async () => {
  const body = {
    ra: "000124",
    name: "Monitor Teste",
    course: "DS",
    className: "3 A",
    semester: 3,
  };
  const r = await admin.post("/api/alunos").send(body);
  assert.equal(r.status, 201);
  assert.equal(r.body.ra, "000124");
  assert.equal((await admin.post("/api/alunos").send(body)).status, 409);
  assert.equal(
    (await admin.post("/api/alunos").send({ ...body, ra: "com espaço" }))
      .status,
    400,
  );
  assert.equal(
    (await admin.get("/api/alunos/ra/000124")).body.name,
    "Monitor Teste",
  );
});
test("cadastro público exige RA de monitor e nunca permite ADMIN ou autoaprovação", async () => {
  const body = {
    name: "Monitor Teste",
    email: "monitor@example.test",
    password,
    role: "MONITOR",
  };
  assert.equal(
    (await request(app).post("/api/auth/register").send(body)).status,
    400,
  );
  assert.equal(
    (
      await request(app)
        .post("/api/auth/register")
        .send({ ...body, role: "ADMIN" })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(app)
        .post("/api/auth/register")
        .send({ ...body, ra: "000124", active: true })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(app)
        .post("/api/auth/register")
        .send({ ...body, ra: "000124" })
    ).status,
    202,
  );
  assert.equal(
    (
      await request(app)
        .post("/api/auth/register")
        .send({ ...body, ra: "000124" })
    ).status,
    202,
  );
  const pending = await admin.get("/api/usuarios?pendentes=true");
  assert.equal(pending.body.total, 1);
  registeredId = pending.body.items[0].id;
  assert.equal(pending.body.items[0].active, false);
  assert.equal(pending.body.items[0].password_hash, undefined);
  assert.equal(
    (
      await monitor
        .post("/api/auth/login")
        .send({ identifier: "000124", password })
    ).body.codigo,
    "PENDING_APPROVAL",
  );
});
test("admin aprova a solicitação; monitor entra por RA e tem acesso limitado", async () => {
  const approve = await admin
    .patch(`/api/usuarios/${registeredId}`)
    .send({ approvalStatus: "APPROVED", version: 1 });
  assert.equal(approve.status, 200, JSON.stringify(approve.body));
  assert.equal(approve.body.ra, "000124");
  assert.equal(
    (
      await monitor
        .post("/api/auth/login")
        .send({ identifier: "000124", password })
    ).status,
    200,
  );
  assert.equal((await monitor.get("/api/usuarios")).status, 403);
  assert.equal((await monitor.post("/api/alunos").send({})).status, 403);
  const students = await monitor.get("/api/alunos");
  assert.equal(students.status, 200);
  assert.equal(students.body.items[0].email, undefined);
  assert.equal(students.body.items[0].phone, undefined);
  assert.equal(
    (await monitor.get(`/api/relatorios/${legacyReport}`)).status,
    404,
  );
  assert.equal((await monitor.get("/api/relatorios")).body.total, 0);
});
test("envio por RA é idempotente e rejeita associação inconsistente", async () => {
  const body = {
    studentRa: "000123",
    observation: "Participou das atividades de lógica.",
    requestKey: randomUUID(),
  };
  const first = await monitor.post("/api/relatorios").send(body);
  assert.equal(first.status, 201, JSON.stringify(first.body));
  createdReport = first.body.id;
  const retry = await monitor.post("/api/relatorios").send(body);
  assert.equal(retry.status, 200);
  assert.equal(retry.body.id, createdReport);
  assert.equal(
    (
      await monitor
        .post("/api/relatorios")
        .send({ ...body, observation: "Outra observação de acompanhamento." })
    ).status,
    409,
  );
  assert.equal(
    (
      await monitor
        .post("/api/relatorios")
        .send({ ...body, studentId: randomUUID(), requestKey: randomUUID() })
    ).status,
    400,
  );
  assert.equal((await monitor.get("/api/relatorios")).body.total, 1);
  assert.equal(
    (
      await monitor
        .patch(`/api/relatorios/${createdReport}`)
        .send({ status: "RESOLVED", note: "Teste", version: 1 })
    ).status,
    403,
  );
});
test("professor acompanha, monitor vê a devolutiva e edição antiga gera conflito", async () => {
  const account = await admin
    .post("/api/usuarios")
    .send({
      name: "Professora Teste",
      email: "teacher@example.test",
      password,
      role: "PROFESSOR",
    });
  assert.equal(account.status, 201);
  assert.equal(
    (
      await teacher
        .post("/api/auth/login")
        .send({ identifier: "teacher@example.test", password })
    ).status,
    200,
  );
  assert.equal((await teacher.get("/api/usuarios")).status, 403);
  const body = {
    status: "IN_REVIEW",
    note: "Vamos reforçar os exercícios na próxima aula.",
    version: 1,
  };
  assert.equal(
    (await teacher.patch(`/api/relatorios/${createdReport}`).send(body)).status,
    200,
  );
  assert.equal(
    (await teacher.patch(`/api/relatorios/${createdReport}`).send(body)).status,
    409,
  );
  const detail = await monitor.get(`/api/relatorios/${createdReport}`);
  assert.equal(detail.body.events.length, 1);
  assert.equal(detail.body.events[0].note, body.note);
  assert.equal(
    (
      await teacher
        .patch(`/api/relatorios/${createdReport}`)
        .send({
          status: "RESOLVED",
          note: "Objetivo alcançado após a revisão.",
          version: 2,
        })
    ).status,
    200,
  );
  assert.equal(
    (await monitor.get("/api/relatorios?status=RESOLVED")).body.total,
    1,
  );
});
test("correção de RA preserva relatório e impede sobrescrita por versão antiga", async () => {
  const before = (await admin.get("/api/alunos/ra/000123")).body;
  const result = await admin
    .patch("/api/alunos/ra/000123")
    .send({ ra: "000999", version: before.version });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(
    (await monitor.get(`/api/relatorios/${createdReport}`)).body.studentRa,
    "000999",
  );
  assert.equal(
    (
      await admin
        .patch("/api/alunos/ra/000999")
        .send({ name: "Nome concorrente", version: before.version })
    ).status,
    409,
  );
  assert.equal(
    (await query("SELECT student_ra FROM reports WHERE id=$1", [legacyReport]))
      .rows[0]!.student_ra,
    "000999",
  );
});
test("paginação, busca literal e filtros retornam dados completos em lotes pequenos", async () => {
  for (let i = 0; i < 23; i++)
    await query(
      "INSERT INTO reports(id,student_id,author_id,observation) VALUES($1,$2,$3,$4)",
      [
        randomUUID(),
        legacyStudent,
        adminId,
        `Relatório complementar de teste ${i}.`,
      ],
    );
  const p1 = (await teacher.get("/api/relatorios?limite=20")).body;
  const p2 = (await teacher.get("/api/relatorios?limite=20&pagina=2")).body;
  assert.equal(p1.items.length, 20);
  assert.equal(p2.items.length, 5);
  assert.equal(p1.total, 25);
  assert.equal(new Set([...p1.items, ...p2.items].map((r) => r.id)).size, 25);
  assert.equal((await teacher.get("/api/relatorios?busca=%25")).body.total, 0);
  assert.equal(
    (await teacher.get("/api/relatorios?de=2026-02-30")).status,
    400,
  );
  assert.equal(
    (await teacher.get("/api/relatorios?de=2026-12-31&ate=2026-01-01")).status,
    400,
  );
  assert.equal((await teacher.get("/api/relatorios?limite=101")).status, 400);
  assert.equal(
    (await teacher.get("/api/relatorios?status=INVALID")).status,
    400,
  );
});
test("RA do monitor é atualizado em cascata e login usa o novo RA", async () => {
  assert.equal(
    (
      await admin
        .patch("/api/alunos/ra/000124")
        .send({ ra: "000125", version: 1 })
    ).status,
    200,
  );
  assert.equal((await monitor.get("/api/auth/me")).body.user.ra, "000125");
  assert.equal(
    (
      await monitor
        .post("/api/auth/login")
        .send({ identifier: "000125", password })
    ).status,
    200,
  );
});
test("desativar e reativar não ressuscita sessões antigas", async () => {
  const user = (await admin.get("/api/usuarios?busca=monitor")).body.items[0];
  const disabled = await admin
    .patch(`/api/usuarios/${registeredId}`)
    .send({ active: false, version: user.version });
  assert.equal(disabled.status, 200);
  assert.equal((await monitor.get("/api/auth/me")).status, 401);
  const enabled = await admin
    .patch(`/api/usuarios/${registeredId}`)
    .send({ active: true, version: disabled.body.version });
  assert.equal(enabled.status, 200);
  assert.equal((await monitor.get("/api/auth/me")).status, 401);
  assert.equal(
    (
      await monitor
        .post("/api/auth/login")
        .send({ identifier: "000125", password })
    ).status,
    200,
  );
});
test("mudança de senha revoga sessões e senha anterior deixa de funcionar", async () => {
  const r = await monitor
    .post("/api/auth/password")
    .send({
      currentPassword: password,
      newPassword: "Nova-senha-de-teste-2026",
    });
  assert.equal(r.status, 204);
  assert.equal((await monitor.get("/api/auth/me")).status, 401);
  assert.equal(
    (
      await monitor
        .post("/api/auth/login")
        .send({ identifier: "000125", password })
    ).status,
    401,
  );
  assert.equal(
    (
      await monitor
        .post("/api/auth/login")
        .send({ identifier: "000125", password: "Nova-senha-de-teste-2026" })
    ).status,
    200,
  );
});
test("admin não remove o próprio acesso; auditoria não contém observações ou senhas", async () => {
  assert.equal(
    (
      await admin
        .patch(`/api/usuarios/${adminId}`)
        .send({ active: false, version: 1 })
    ).status,
    400,
  );
  assert.equal(
    (
      await admin
        .patch(`/api/usuarios/${adminId}`)
        .send({ role: "PROFESSOR", version: 1 })
    ).status,
    400,
  );
  const logs = await query("SELECT * FROM audit_log");
  assert.ok(logs.rows.length > 5);
  const json = JSON.stringify(logs.rows);
  assert.ok(!json.includes(password));
  assert.ok(!json.includes("Participou das atividades"));
});
test("transação com erro reverte alterações e FK protege o histórico", async () => {
  await assert.rejects(() =>
    transaction(async (client) => {
      await client.query(
        "UPDATE students SET name='NÃO PERSISTIR' WHERE ra='000999'",
      );
      throw new Error("rollback");
    }),
  );
  assert.equal(
    (await query("SELECT name FROM students WHERE ra='000999'")).rows[0]!.name,
    "Aluno Legado",
  );
  await assert.rejects(() => query("DELETE FROM students WHERE ra='000999'"));
  assert.equal((await request(app).get("/api/health")).status, 200);
});
