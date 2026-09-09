import assert from 'node:assert/strict';
import test from 'node:test';
import { loginSchema, reportCreateSchema, studentCreateSchema, studentUpdateSchema, userCreateSchema } from '../src/schemas.js';

test('login normaliza o e-mail', () => {
  const result = loginSchema.parse({ email: ' PROF@ESCOLA.COM ', password: 'senha-segura' });
  assert.equal(result.email, 'prof@escola.com');
});

test('relatório exige UUID e observação com 10 caracteres', () => {
  assert.equal(reportCreateSchema.safeParse({ studentId: '123', observation: 'curta' }).success, false);
  assert.equal(reportCreateSchema.safeParse({ studentId: '5558cba9-41d0-4c7e-8f09-670c93cdcc8a', observation: 'Observação válida.' }).success, true);
});

test('aluno rejeita semestre fora do limite', () => {
  const data = { ra: '123', name: 'Ana Souza', course: 'DS', semester: 21 };
  assert.equal(studentCreateSchema.safeParse(data).success, false);
});

test('atualização parcial do aluno não cria campos ausentes', () => {
  const result = studentUpdateSchema.parse({ active: false });
  assert.deepEqual(result, { active: false });
});

test('usuário exige perfil conhecido e senha segura', () => {
  assert.equal(userCreateSchema.safeParse({ name: 'Maria', email: 'maria@escola.com', password: '123', role: 'PROFESSOR' }).success, false);
  assert.equal(userCreateSchema.safeParse({ name: 'Maria', email: 'maria@escola.com', password: 'senha123', role: 'PROFESSOR' }).success, true);
});
