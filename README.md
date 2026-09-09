# JMonitora+

Plataforma de monitoria escolar para registrar observações pedagógicas e acompanhar alunos. Esta versão utiliza PostgreSQL, autenticação por perfil e uma aplicação Express/TypeScript compatível com a Vercel.

## O que foi reformulado

- conflitos de Git removidos e contrato da API unificado;
- persistência em arquivos JSON substituída por PostgreSQL;
- relacionamento real entre alunos, relatórios e autores;
- autenticação em cookie `HttpOnly`, sessão de 8 horas e três perfis de acesso;
- proteção por perfil, origem, limite de requisições, Helmet e validação com Zod;
- frontend responsivo sem CDN e com endereço de API relativo;
- cadastro e edição de alunos;
- cadastro e ativação/desativação de usuários pelo administrador;
- pesquisa de relatórios por nome, RA, autor e observação;
- scripts de migração, criação do administrador e importação dos JSON antigos;
- testes de validação e verificação completa do TypeScript.

## Perfis

| Perfil | Permissões |
| --- | --- |
| Monitor | Consultar alunos ativos e registrar observações |
| Professor | Consultar relatórios e gerenciar alunos |
| Administrador | Todas as permissões e gerenciamento de usuários |

## Requisitos locais

- Node.js 20 ou superior;
- PostgreSQL 15 ou superior, local ou hospedado;
- uma string de conexão `DATABASE_URL`.

## Instalação local

```bash
npm install
cp .env.example .env
```

Edite `.env` e preencha pelo menos:

```dotenv
DATABASE_URL=postgresql://usuario:senha@host:5432/jmonitora?sslmode=require
JWT_SECRET=uma-chave-aleatoria-com-pelo-menos-32-caracteres
ADMIN_NAME=Administrador JMonitora
ADMIN_EMAIL=admin@suaescola.com
ADMIN_PASSWORD=uma-senha-forte
```

Crie as tabelas e o primeiro usuário:

```bash
npm run db:migrate
npm run db:seed
```

Opcionalmente, importe os seis relatórios que estavam no projeto antigo:

```bash
npm run db:import-json
```

Inicie o sistema:

```bash
npm run dev
```

Acesse `http://localhost:3000`.

## Verificações

```bash
npm run check
npm audit
```

`npm run check` executa a validação do TypeScript e os testes automatizados.

## Deploy na Vercel com Neon PostgreSQL

O antigo produto Vercel Postgres não aceita novos bancos. Para um projeto novo, crie uma integração PostgreSQL no Marketplace da Vercel. Neon é uma opção simples, mas o código aceita qualquer provedor que entregue uma URL PostgreSQL padrão.

1. Suba esta pasta para um repositório GitHub.
2. Na Vercel, escolha **Add New > Project** e importe o repositório.
3. Em **Storage/Marketplace**, conecte um banco PostgreSQL ao projeto.
4. Confirme que a integração criou `DATABASE_URL` nos ambientes Production e Preview.
5. Em **Settings > Environment Variables**, adicione como Secret:
   - `JWT_SECRET` com pelo menos 32 caracteres;
   - `ADMIN_NAME`;
   - `ADMIN_EMAIL`;
   - `ADMIN_PASSWORD`.
6. Faça o primeiro deploy.
7. No computador, instale a CLI e conecte a pasta ao projeto:

   ```bash
   npm install -g vercel
   vercel link
   vercel env pull .env
   npm run db:migrate
   npm run db:seed
   ```

8. Faça um novo deploy ou abra o endereço já publicado e entre com o administrador configurado.
9. No menu **Usuários**, crie as contas de monitor e professor.

Não execute `db:seed` como parte automática de cada build. Migrações e criação de usuário devem ser operações conscientes e separadas do deploy.

## Organização

```text
db/schema.sql             Estrutura do PostgreSQL
legacy-data/              Cópia dos dados JSON antigos
public/                   Interface entregue pela CDN da Vercel
scripts/dev-server.ts     Servidor local
scripts/migrate.ts        Criação idempotente das tabelas
scripts/seed.ts           Criação/atualização do administrador
scripts/import-json.ts    Importação opcional dos relatórios antigos
src/app.ts                Aplicação Express exportada para a Vercel
src/routes/               Rotas de autenticação, alunos, relatórios e usuários
tests/                    Testes automatizados
```

## API principal

| Método | Endpoint | Acesso |
| --- | --- | --- |
| POST | `/api/auth/login` | Público com limite de tentativas |
| POST | `/api/auth/logout` | Sessão atual |
| GET | `/api/auth/me` | Autenticado |
| GET | `/api/alunos` | Todos os perfis |
| POST/PATCH | `/api/alunos` | Professor e administrador |
| POST | `/api/relatorios` | Monitor, professor e administrador |
| GET | `/api/relatorios` | Professor e administrador |
| GET/POST/PATCH | `/api/usuarios` | Administrador |
| GET | `/api/health` | Verificação da API e do banco |

## Segurança e uso real

- Nunca envie `.env` para o GitHub.
- Guarde `DATABASE_URL`, `JWT_SECRET` e senhas como Secrets na Vercel.
- Crie senhas únicas para cada pessoa e desative acessos que não forem mais utilizados.
- Use apenas dados necessários ao acompanhamento pedagógico e estabeleça regras de retenção conforme a política da escola e a LGPD.
- Para uma implantação institucional, recomenda-se ainda adicionar recuperação de senha, trilha de auditoria, política de consentimento/retenção e backups monitorados.
