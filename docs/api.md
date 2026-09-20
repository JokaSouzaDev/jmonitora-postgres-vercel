# API 2.0

Todas as rotas ficam em `/api`, recebem/enviam JSON e usam cookie `jmonitora_session`. A autenticação dura até oito horas. Requisições de escrita do navegador devem vir da mesma origem. APIs retornam `Cache-Control: no-store`.

## Autenticação

| Método e rota | Acesso | Corpo ou resultado |
| --- | --- | --- |
| `POST /auth/login` | Público, com limite de tentativas | `{ "identifier": "000123", "password": "..." }`; aceita o campo legado `email` |
| `POST /auth/register` | Público | `name`, `email`, `password`, `role` MONITOR/PROFESSOR e `ra`; retorna 202, sem sessão |
| `GET /auth/me` | Autenticado | `user`: id, nome, e-mail, perfil e RA opcional |
| `POST /auth/logout` | Mesma origem | Limpa cookie; retorna 204 |
| `POST /auth/password` | Autenticado | `currentPassword`, `newPassword`; revoga sessões; retorna 204 |

Cadastro público não aceita `ADMIN`, `active` nem `approvalStatus`. O RA deve corresponder a um aluno ativo, quando informado. A aprovação é manual e não constitui verificação automática da titularidade do e-mail ou RA.

## Alunos

| Método e rota | Acesso | Uso |
| --- | --- | --- |
| `GET /alunos` | Todos autenticados | `busca`, `pagina`, `limite`, `inativos=true` (apenas equipe autorizada) |
| `GET /alunos/ra/:ra` | Todos autenticados | RA exato; monitor só encontra aluno ativo, sem e-mail/telefone |
| `POST /alunos` | Professor/admin | `ra`, `name`, `course`, `semester`; `className`, `email`, `phone` opcionais |
| `PATCH /alunos/ra/:ra` | Professor/admin | Campos a alterar, `active` opcional e `version` obrigatória |

RA usado na URL deve ser codificado com `encodeURIComponent`. O `id` legado pode aparecer em respostas administrativas, mas não é o identificador de busca usado pela interface.

## Relatórios

| Método e rota | Acesso | Uso |
| --- | --- | --- |
| `GET /relatorios/resumo` | Autenticado | Contagens total/new/reviewing/resolved, respeitando o perfil |
| `GET /relatorios` | Autenticado | `busca`, `ra`, `status`, `de`, `ate`, `pagina`, `limite` |
| `POST /relatorios` | Autenticado | `studentRa`, `observation`, `requestKey` UUID opcional; aceita `studentId` legado |
| `GET /relatorios/:id` | Autenticado | Relatório e array `events`; monitor só vê os próprios |
| `PATCH /relatorios/:id` | Professor/admin | `status`, `note`, `version`; acrescenta devolutiva |

Situações: `NEW`, `IN_REVIEW`, `RESOLVED`. Período em datas `AAAA-MM-DD`, com início inclusivo e fim inclusivo no fuso de São Paulo (implementado como início do próximo dia, exclusivo). Relatórios são ordenados por data e UUID descendentes, para desempate estável.

Uma criação normal retorna 201; reenvio idempotente confirmado retorna 200 com o mesmo ID. `requestKey` é recomendada e utilizada pela interface; consumidores que a omitirem não possuem garantia de deduplicação.

## Usuários

| Método e rota | Acesso | Uso |
| --- | --- | --- |
| `GET /usuarios` | Admin | `busca`, `pendentes=true`, `pagina`, `limite`; nunca retorna hash |
| `POST /usuarios` | Admin | `name`, `email`, `password`, `role`, `ra` obrigatório para monitor |
| `PATCH /usuarios/:id` | Admin | `name`, `password`, `role`, `ra`, `active`, `approvalStatus` e `version` |

`approvalStatus` pode ser APPROVED ou REJECTED nas alterações. Aprovar uma solicitação permite ativá-la; recusar mantém a conta inativa. Toda alteração administrativa incrementa a versão da sessão. O administrador não pode remover o próprio acesso administrativo. Uma trava transacional protege a manutenção de um administrador ativo.

## Paginação e erros

Resposta de lista:

```json
{
  "items": [],
  "page": 1,
  "limit": 20,
  "total": 0
}
```

`pagina`: 1 a 100.000; `limite`: 1 a 100; `busca`: até 120 caracteres. Não são cursores; grandes offsets podem ser mais caros.

Erro padronizado:

```json
{
  "erro": "O cadastro foi alterado por outra pessoa. Atualize e tente novamente.",
  "codigo": "VERSION_CONFLICT"
}
```

| HTTP | Significado |
| --- | --- |
| 400 | Dados, RA, datas, corpo JSON ou referência inválidos |
| 401 | Sem sessão, sessão expirada ou credenciais incorretas |
| 403 | Sem permissão, origem inválida ou conta pendente/inativa |
| 404 | Recurso inexistente ou fora da visibilidade do usuário |
| 409 | Duplicidade, versão desatualizada ou chave de reenvio conflitante |
| 413 | Corpo superior a 32 KB |
| 429 | Limite de requisições/tentativas atingido |
| 503 | Banco/autenticação indisponível ou estrutura ainda não migrada |

`GET /health` verifica a existência das colunas necessárias no PostgreSQL e retorna a versão da aplicação. Não expõe credenciais, nomes de alunos ou detalhes de conexão.
