import assert from "node:assert/strict";
import test from "node:test";
import {
  loginSchema,
  reportCreateSchema,
  studentCreateSchema,
  studentUpdateSchema,
  userCreateSchema,
  userUpdateSchema,
  raSchema,
  passwordSchema,
} from "../src/schemas.js";
test("login legado normaliza e-mail e login novo aceita RA", () => {
  assert.equal(
    loginSchema.parse({ email: " PROF@ESCOLA.COM ", password: "senha-segura" })
      .email,
    "prof@escola.com",
  );
  assert.equal(
    loginSchema.parse({ identifier: "000123", password: "senha-segura" })
      .identifier,
    "000123",
  );
});
test("relatório exige identificação e observação válida", () => {
  assert.equal(
    reportCreateSchema.safeParse({ studentId: "123", observation: "curta" })
      .success,
    false,
  );
  assert.equal(
    reportCreateSchema.safeParse({
      studentRa: "000123",
      observation: "Observação válida.",
    }).success,
    true,
  );
});
test("RA preserva zeros, normaliza letras e rejeita espaços internos", () => {
  assert.equal(raSchema.parse(" 00ab-1 "), "00AB-1");
  assert.equal(raSchema.safeParse("00 12").success, false);
});
test("aluno rejeita semestre inválido e update parcial não cria campos ausentes", () => {
  assert.equal(
    studentCreateSchema.safeParse({
      ra: "123",
      name: "Ana",
      course: "DS",
      semester: 21,
    }).success,
    false,
  );
  assert.deepEqual(studentUpdateSchema.parse({ active: false, version: 1 }), {
    active: false,
    version: 1,
  });
  assert.deepEqual(userUpdateSchema.parse({ active: false, version: 1 }), {
    active: false,
    version: 1,
  });
});
test("contas de monitor exigem RA e senha respeita o limite real do bcrypt", () => {
  assert.equal(
    userCreateSchema.safeParse({
      name: "Maria",
      email: "maria@escola.com",
      password: "senha123",
      role: "PROFESSOR",
    }).success,
    true,
  );
  assert.equal(
    userCreateSchema.safeParse({
      name: "Maria",
      email: "maria@escola.com",
      password: "senha123",
      role: "MONITOR",
    }).success,
    false,
  );
  assert.equal(passwordSchema.safeParse("á".repeat(37)).success, false);
});
