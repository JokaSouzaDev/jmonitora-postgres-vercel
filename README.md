# JM Monitora

**Acompanhamento pedagógico, do primeiro registro à devolutiva do professor.**

O JM Monitora é uma plataforma web para organizar a monitoria escolar. O monitor localiza o aluno pelo **RA**, registra uma observação e acompanha a resposta do professor. A equipe escolar mantém um histórico único de cada aluno, identifica dificuldades e registra os próximos passos.

A versão 2.0 foi projetada primeiro para celulares, com navegação inferior, formulários adaptados ao toque e consultas paginadas. A interface também se adapta a tablets e computadores.

## Para que serve?

Imagine que um aluno encontrou dificuldade em uma atividade de lógica:

1. A escola cadastra o aluno com seu RA, nome, curso, semestre e turma.
2. O monitor entra com **RA ou e-mail + senha**, procura o RA do aluno e registra a observação.
3. O professor lê o registro, acrescenta uma devolutiva e muda a situação para **Em acompanhamento**.
4. O monitor consulta sua observação e vê a orientação recebida.
5. Quando o acompanhamento termina, o professor marca **Concluído**. O histórico continua disponível.

O sistema organiza observações pedagógicas. Não substitui diário oficial, boletim, sistema de matrícula ou atendimento emergencial.

## Quem pode fazer o quê?

| Ação | Monitor | Professor | Administrador |
| --- | --- | --- | --- |
| Localizar aluno ativo pelo RA ou nome | Sim; sem contatos pessoais | Sim | Sim |
| Registrar observação | Sim | Sim | Sim |
| Ler observações e devolutivas | Apenas as próprias observações | Todas da escola | Todas da escola |
| Acrescentar devolutiva e atualizar situação | Não | Sim | Sim |
| Cadastrar, editar e inativar alunos | Não | Sim | Sim |
| Aprovar cadastros e gerenciar contas | Não | Não | Sim |
| Alterar a própria senha | Sim | Sim | Sim |

**Importante:** esta instalação atende uma escola. Professores e administradores têm visão de todos os registros dessa escola; ainda não existe separação por escola ou por turma atribuída ao professor.

## Primeiro acesso

- Abra a tela de entrada e toque em **Solicitar cadastro**.
- Informe nome, e-mail, senha e perfil solicitado.
- Para **Monitor**, informe um RA que já esteja no cadastro de alunos da escola.
- Professores podem deixar o RA vazio quando não possuem um.
- A solicitação começa **pendente**, sem acesso aos dados. O administrador confere a identidade e aprova em **Acessos → Analisar solicitação**.
- Nunca há cadastro público de administrador.

Já existe uma conta antiga de monitor sem RA? O acesso por e-mail é preservado. O administrador deve vinculá-la ao cadastro correto em **Acessos → Gerenciar acesso**. Nenhum RA é inventado durante a migração.

## Como o RA funciona

- O **RA é a chave primária da tabela `students`** e a referência operacional usada nas telas, pesquisas e vínculos dos alunos.
- RA é **texto**, não número: `000123` permanece `000123`.
- Letras são convertidas para maiúsculas; espaços externos são removidos. São aceitos letras, números, ponto e hífen, até 40 caracteres.
- `reports.student_ra` liga a observação ao aluno; `app_users.ra` vincula a conta do monitor.
- Ao corrigir um RA, os vínculos são atualizados pelo banco em cascata, sem perder o histórico.
- UUIDs continuam existindo para relatórios, contas, auditoria e compatibilidade técnica. Eles não substituem o RA na identificação do aluno. Professores sem RA continuam identificados por sua conta e e-mail.

## Funcionalidades da versão 2.0

- Login por RA ou e-mail, com sessão em cookie `HttpOnly`.
- Cadastro público com aprovação administrativa e acesso por perfil.
- Cadastro e consulta de alunos por RA, nome e turma; inativação sem apagar histórico.
- Observações com confirmação do aluno, autor e data registrados no servidor.
- Situações **Novo → Em acompanhamento → Concluído**, com possibilidade de reabertura e devolutivas preservadas.
- Monitor acompanha os próprios registros; professor e administrador acompanham todos.
- Filtros por texto, RA exato, situação e período; datas escolares em `America/Sao_Paulo`.
- Listas de 20 itens por página, limite máximo de 100 na API.
- Proteção contra envio duplicado de observações e contra sobrescrita de edições simultâneas.
- Alteração da própria senha, redefinição administrativa e revogação de sessões ao alterar acessos.
- Impressão do acompanhamento, histórico de devolutivas e auditoria técnica das alterações.
- Formulários mantidos em memória quando há erro de rede. **Não há gravação offline nem sincronização automática**; o usuário reconecta e tenta novamente.

## Tecnologias e organização

O frontend usa HTML, CSS e JavaScript nativos. Não exige React, biblioteca de componentes, fontes externas ou imagens pesadas. O servidor usa Express 5 + TypeScript; o banco de produção é PostgreSQL.

| Pasta/arquivo | Responsabilidade |
| --- | --- |
| `public/index.html`, `login.js` | Entrada por RA/e-mail |
| `public/cadastro.html`, `cadastro.js` | Solicitação de cadastro |
| `public/app.html`, `app.js` | Painel, registros, alunos, acessos e devolutivas |
| `public/common.js`, `styles.css` | Cliente HTTP, feedback e layout mobile first |
| `src/app.ts` | Configuração HTTP, cabeçalhos e tratamento de erros |
| `src/auth.ts`, `schemas.ts` | Sessões, permissões, limites e validação |
| `src/routes/` | Regras da API por área |
| `src/db.ts`, `audit.ts`, `pagination.ts` | Transações, auditoria e paginação |
| `db/migrations/` | Evolução versionada do banco, com checksum |
| `scripts/` | Desenvolvimento, migração, administrador e importação |
| `tests/` | Testes de validação, HTTP e integração SQL |
| `docs/` | Arquitetura, API, operação e evidências de verificação |
| `vercel.json` | Build e cabeçalhos dos arquivos servidos pela CDN |

## Executar no computador

Pré-requisitos: **Node.js 22**, npm e PostgreSQL (16 ou superior recomendado).

```bash
git clone https://github.com/JokaSouzaDev/jmonitora-postgres-vercel.git
cd jmonitora-postgres-vercel
npm ci
cp .env.example .env
```

No Windows PowerShell, use `Copy-Item .env.example .env` no lugar de `cp`.

Edite `.env` e configure `DATABASE_URL`, `JWT_SECRET`, `ADMIN_NAME`, `ADMIN_EMAIL` e `ADMIN_PASSWORD`. Gere uma chave privada para `JWT_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Use uma senha de administrador própria, com pelo menos 8 caracteres e no máximo 72 bytes. Depois:

```bash
npm run db:migrate
npm run db:seed
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000) e entre com o e-mail e a senha configurados. `db:seed` também permite recuperar o administrador: atualiza sua senha e revoga sessões anteriores. Execute somente quando necessário.

## Banco existente e deploy na Vercel

**Nunca substitua o banco existente por dados de exemplo.** Antes da primeira atualização, mantenha um backup ou ponto de restauração do provedor.

A Vercel reconhece `src/app.ts` como a aplicação Express e serve `public/` pela CDN. A configuração versionada executa `npm run build:vercel`:

1. Verifica os tipos TypeScript.
2. Em **produção**, executa as migrações dentro de uma transação, antes de promover a nova aplicação.
3. Em **preview**, não altera banco automaticamente, exceto quando `RUN_DB_MIGRATIONS=true` estiver explicitamente definido para um banco isolado.

Configure as variáveis do `.env.example` no projeto existente. O conector de banco pode usar `DATABASE_URL`, `STORAGE_URL`, `POSTGRES_URL`, `NEON_DATABASE_URL` ou as variantes já suportadas em `src/db.ts`. Prefira uma URL com pooling na aplicação. O código não contém credenciais.

A migração transforma a chave do aluno em RA, preserva UUIDs antigos, relatórios e contas, cria os novos vínculos, índices e tabelas. Se houver RAs inválidos ou duplicados após normalização, ela falha e reverte a transação; os dados devem ser corrigidos conscientemente, sem eliminar alunos.

**Não reutilize a base de produção em previews.** Para mais de uma URL no mesmo projeto, deixe `APP_ORIGIN` vazio ou configure-o por ambiente. Quando preenchido, ele deve ser a origem exata, como `https://escola.exemplo.br`.

Confira `/api/health`: a resposta esperada contém `status: "online"`, `database: "connected"` e `version: "2.0.0"`. A disponibilidade real depende também das variáveis e da conectividade com PostgreSQL.

## Verificar alterações

```bash
npm run check
npm audit --omit=dev
```

`check` executa TypeScript e os testes. A integração usa um PostgreSQL embarcado (PGlite) isolado e dados fictícios, sem consultar o banco da escola. A validação local não substitui a verificação de produção nem um teste de carga.

O GitHub Actions executa as mesmas verificações nos pushes e pull requests. Consulte [a matriz de validação](docs/validacao.md) para saber exatamente o que foi verificado.

## Importar arquivos antigos

Os JSONs antigos com observações foram removidos da árvore atual do repositório. **Isso não apaga o histórico do Git.** Arquivos da escola devem ficar fora do código público.

Cadastre primeiro os alunos com os RAs corretos. Depois execute, de forma explícita:

```bash
npm run db:import-json -- /caminho/privado/relatorios.json
```

O importador valida o arquivo inteiro, exige alunos existentes, preserva os IDs e as datas originais, ignora registros idênticos já importados e cancela a transação se encontrar inconsistências. Não cria alunos fictícios para preencher lacunas. Veja [operação e importação](docs/operacao.md).

## Documentação

- [Arquitetura e modelo de dados](docs/arquitetura.md)
- [Referência da API](docs/api.md)
- [Instalação, backup e operação](docs/operacao.md)
- [Testes, resultados e limitações](docs/validacao.md)

## Próximas evoluções

Separação por escola e turma atribuída, notificações institucionais, recuperação de senha por e-mail verificado e testes de carga com o volume real da escola. Essas funções **não estão implementadas nesta versão**.

Licença: [MIT](LICENSE).
