# Operação e manutenção

## Configuração

| Variável | Uso |
| --- | --- |
| `DATABASE_URL` | URL PostgreSQL; use uma base isolada em desenvolvimento e preview |
| `JWT_SECRET` | Chave privada aleatória com pelo menos 32 caracteres; não publicar |
| `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Administrador inicial/recuperação via seed; nunca inserir no frontend |
| `NODE_ENV` | `production` exige cookie seguro por HTTPS |
| `PORT` | Porta local, padrão 3000 |
| `PG_POOL_MAX` | Limite de conexões por instância, padrão 5; dimensionar com o provedor |
| `APP_ORIGIN` | Opcional: origem canônica exata para validação de escrita |
| `RUN_DB_MIGRATIONS` | `true` força migração em um build não produtivo; usar apenas com banco isolado |

São mantidas as variantes de URL utilizadas pelo projeto anterior: `DATABASE_URL_DATABASE_URL`, `DATABASE_URL_POSTGRES_URL`, `DATABASE_URL_UNPOOLED`, `STORAGE_URL`, `POSTGRES_URL`, `NEON_DATABASE_URL` e detecção de chaves com sufixos de URL PostgreSQL. Em ambientes com mais de um banco, prefira configurar `DATABASE_URL` explicitamente para evitar ambiguidade.

O pool possui timeout de conexão de dez segundos e timeout de instrução de quinze segundos. Cada transação usa uma conexão dedicada até COMMIT/ROLLBACK. Valores maiores de pool não tornam automaticamente o sistema mais rápido e multiplicam conexões pelas instâncias do servidor.

## Rotina da escola

1. Administrador configura a instalação e cadastra/valida os usuários responsáveis.
2. Professor ou administrador cadastra alunos com RA, nome, curso, semestre e turma.
3. Administrador analisa solicitações e confere identidade/vínculo antes de aprovar. O sistema não consulta a secretaria de educação para validar RAs.
4. Monitores registram observações objetivas; professores acrescentam devolutivas e acompanham pendências.
5. Ao final do vínculo escolar, a equipe inativa o aluno e, quando necessário, sua conta. A inativação de um aluno vinculado a um monitor bloqueia o uso dessa conta enquanto estiver inativo.
6. A escola revisa os acessos periodicamente e define a guarda dos registros conforme suas próprias regras.

## Backup e atualização

Antes de alterar uma base real, crie um ponto de restauração no provedor ou exporte um backup PostgreSQL para armazenamento privado e criptografado. Não faça commit de dumps ou relatórios reais.

Exemplo de terminal, usando uma variável já configurada localmente:

```bash
pg_dump --format=custom --file=jm-monitora-backup.dump "$DATABASE_URL"
```

Verifique a restauração em um banco isolado; a existência de um arquivo não comprova que a recuperação funciona. Não foram configurados agendamento de backup nem testes de restauração do banco de produção nesta revisão.

A publicação em produção executa as migrações transacionais através de `build:vercel`. Um erro de validação ou timeout de lock impede a promoção do novo build e reverte a transação. Em bases grandes, uma janela de manutenção pode ser necessária para as alterações de constraints/índices. Nunca edite migrações já registradas.

Após o deploy, confira `/api/health`, login de um usuário autorizado, consulta por RA, envio de uma observação e leitura de uma devolutiva. Use registros de validação autorizados pela escola; não acrescente exemplos à base real sem necessidade.

Para reverter somente o código, use um commit reversor ou um deploy anterior, verificando sua compatibilidade com o schema atual. Não apague tabelas para simular um rollback. Um rollback de dados exige um procedimento de restauração próprio e pode perder registros posteriores ao backup.

## Importação validada

Arquivo fora do repositório, contendo uma lista JSON com este formato fictício:

```json
[
  {
    "id": "944b1f7e-6430-4c1a-8c48-4f362d95a111",
    "ra": "000123",
    "observacao": "Exemplo fictício de observação pedagógica.",
    "criadoEm": "2026-09-19T12:00:00.000Z"
  }
]
```

O limite é dez mil registros por arquivo. RAs precisam existir previamente; IDs e datas são preservados. A autoria técnica da importação será a conta administrativa indicada por `ADMIN_EMAIL`, porque o formato antigo não comprova o autor individual. Isso deve ser considerado ao interpretar o histórico.

A importação é uma transação: ausência de aluno, ID usado com conteúdo diferente ou validação inválida cancela tudo. Registros idênticos são ignorados, e importações novas ficam na auditoria. Os JSONs removidos da árvore atual ainda podem existir em commits antigos; não foi feita reescrita do histórico Git.

## Senhas e segurança

Sessões em cookie `HttpOnly`, `SameSite=Strict`, com flag `Secure` em produção. JWT assinado com HS256 e emissor validado. A cada requisição autenticada, a conta e a versão da sessão são conferidas no banco. Desativação, redefinição de senha ou alteração administrativa invalidam sessões anteriores.

Senha é armazenada como hash bcrypt (custo 12). A criação/alteração limita a senha a 72 bytes, respeitando o limite do algoritmo, inclusive para caracteres acentuados. A recuperação de senha é administrativa, com confirmação de identidade fora do sistema; não há recuperação automática por e-mail.

O limite de autenticação fica no banco: doze tentativas por identificador em quinze minutos, trinta cadastros por IP no mesmo período. A chave é armazenada com HMAC, sem texto aberto. O limite geral de API (600 por minuto/IP) é em memória por instância; não substitui controle distribuído de tráfego em larga escala. Em redes escolares com IP compartilhado, é preciso monitorar o dimensionamento.

Formulários não são gravados em localStorage. Em erro de rede permanecem em memória enquanto a aba estiver aberta; fechar ou recarregar a página perde o rascunho. Não existe acesso offline aos registros. A impressão é local e depende do diálogo do navegador.

## Problemas comuns

| Situação | O que verificar |
| --- | --- |
| Banco não configurado/503 | Variável correta no ambiente, conectividade, schema migrado e logs do deploy |
| Cadastro pendente | Aprovação em Acessos; confirmar identidade e RA |
| Login por RA falha | Zeros à esquerda, vínculo entre conta e aluno, aluno ativo e senha |
| Sessão encerrou após alteração de acesso | Comportamento esperado: entre novamente |
| 409 ao salvar | Outra pessoa alterou o registro; reabra para conferir a versão atual |
| Observação não confirmou o envio | Mantenha a aba e tente novamente com a conexão restabelecida |
| Migração rejeita RA | Corrigir o cadastro legado; não excluir dados para contornar a validação |
| 403 de origem | Verificar `APP_ORIGIN` e o domínio do ambiente |

## Referências técnicas

- [Express na Vercel](https://vercel.com/docs/frameworks/backend/express): detecção da aplicação e arquivos estáticos.
- [PostgreSQL ALTER TABLE](https://www.postgresql.org/docs/current/sql-altertable.html): alterações de schema e constraints.
- Documentação incluída nos pacotes instalados: Express, node-postgres, bcryptjs, PGlite e pglite-socket.
