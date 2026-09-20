# Evolução do banco

Execute `npm run db:migrate`. O diretório `migrations/` é a fonte de verdade do schema.

- `001_initial.sql`: estrutura anterior, preservada para migração de instalações existentes.
- `002_ra_workflow.sql`: RA como chave primária, vínculo de monitores, aprovação, devolutivas, auditoria, índices e versões.

O runner registra checksum e data em `schema_migrations`, verifica alterações em arquivos aplicados, mantém tudo na mesma conexão e faz rollback se houver erro. Não execute `002` repetidamente de forma manual e não edite uma migração publicada.

O antigo `schema.sql` foi substituído pelas migrações para evitar duas definições divergentes do banco. Leia [arquitetura](../docs/arquitetura.md) e [operação](../docs/operacao.md).
