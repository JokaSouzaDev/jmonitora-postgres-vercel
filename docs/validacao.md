# Validação da versão 2.0

Data: 19 de setembro de 2026. Ambiente isolado, dados inteiramente fictícios. As evidências se referem à versão implementada nesta revisão; não são certificação de segurança ou teste de carga da escola.

## Verificações automatizadas

`npm run check`: compilação TypeScript sem erros e **24 testes aprovados**.

| Área | Evidência |
| --- | --- |
| Migração | Base antiga com aluno/relatório preservados; RA confirmado como chave primária; execução repetida sem reaplicar |
| Cadastro | RA validado, zeros preservados, duplicidade recusada, conta pendente sem acesso |
| Autorização | Cadastro público não cria ADMIN; monitor não administra alunos/contas nem lê relatório alheio |
| Fluxo | Aprovação, login por RA, envio, acompanhamento e conclusão |
| Integridade | Reenvio com a mesma chave sem duplicação; UUID/RA inconsistentes rejeitados |
| Concorrência | Versões antigas de aluno/relatório recusadas com 409 |
| Vínculos | RA corrigido em cascata nos relatórios e na conta do monitor |
| Consulta | Paginação em 25 relatórios, filtros de status/data e busca com curingas escapados |
| Sessões | Desativar/reativar não ressuscita sessão antiga; mudança de senha revoga sessão |
| Administração | Não permite remover o próprio acesso administrativo |
| Banco | Transação com erro reverte dados; FK impede exclusão de aluno com histórico |
| HTTP | Cabeçalhos, rotas protegidas, JSON inválido, corpo excessivo e origem externa |

A integração usa o núcleo PostgreSQL embarcado no PGlite, exposto por socket ao driver `pg`. Isso valida as consultas e transações em ambiente reproduzível, mas não substitui concorrência com múltiplas instâncias de um servidor PostgreSQL real nem comportamento do provedor em produção.

`npm audit --omit=dev`: **zero vulnerabilidades conhecidas reportadas** no conjunto de dependências de produção no momento da revisão. A consulta ao catálogo pode mudar com novas publicações.

## Navegador

Verificação automatizada com Chromium e dados fictícios:

- Entrada e dashboard com cookie de sessão.
- Cadastro de aluno pelo formulário no celular.
- Solicitação pública, análise e aprovação administrativa.
- Entrada do monitor por RA, localização do aluno e envio de observação.
- Devolutiva do professor visível ao monitor, sem formulário de edição para ele.
- Falha de conexão mantém os campos; reconexão permite concluir o envio.
- Ausência de rolagem horizontal em **16 combinações**: quatro telas principais × larguras 320, 390, 768 e 1440 pixels.
- Nenhum erro JavaScript de página nos fluxos percorridos.

Emulação de viewport não equivale a teste em aparelhos físicos. Safari/iOS, leitores de tela, impressão em todas as plataformas e desempenho em conexões móveis reais ainda precisam de homologação da escola.

## Tamanho do frontend

Aproximadamente 71 KB sem compressão e 18 KB com gzip, somando HTML do painel, JavaScript do painel, utilitário HTTP e CSS. O valor com gzip é uma medição local dos arquivos, não uma garantia de transferência da CDN. O login usa menos JavaScript e compartilha o CSS. Não há fontes externas, imagens grandes ou bibliotecas JS de interface.

A paginação reduz o lote inicial de relatórios de até 1.000 para 20. Não foi medido um ganho percentual de latência com a base real. Busca ampla `ILIKE`, contagens e offsets altos são os pontos a observar conforme os dados cresçam.

## Limites que permanecem

- Sem separação entre escolas ou por turma atribuída a professor.
- Sem recuperação automática de senha por e-mail e sem validação automática de titularidade de RA/e-mail.
- Sem notificações, anexos, boletins ou sincronização offline.
- Sem backup agendado, restauração de produção ou teste de carga configurados nesta revisão.
- Auditoria no próprio banco, sem serviço externo imutável.
- Relatórios em commits antigos do Git não são removidos ao limpar a árvore atual.
- Conexão administrativa da Vercel desta sessão não autoriza o escopo do projeto; o deploy automático é acompanhado pelo GitHub quando disponível.
