# AGENTS.md

## Produto

Usuária principal: a advogada titular que acompanha os próprios processos todo dia. Toda decisão de
produto se resolve perguntando o que serve ao dia a dia dela, não ao advogado genérico. Quando houver
dúvida entre uma feature genérica e uma que encurta o trabalho dela, ganha a segunda. Em seeds e
fixtures ela aparece como Ana Luisa Ferreira Campos, OAB/SP 999001: nome e inscrição fictícios.

O app acompanha os processos em andamento e existe para o momento em que ela precisa agir. Cada
ato do processo aparece como uma ação a tomar, com todo o material necessário já reunido: nada de
abrir três sistemas para juntar a decisão, a prova e o prazo.

O que o app faz com o que já aconteceu no processo:

- Lê o histórico (publicações do DJEN, movimentos do DataJud, documentos) e o organiza sozinho.
- Agrupa o material do processo em eixos de trabalho, cada um com link para o documento original:
  **Provas**, **Decisões**, **Recorrer** (o que é recorrível, com prazo e cabimento) e **Agravos**.
  Cada eixo é uma aba de `/processos/$cnj`; `/prazos/$id` é o hub de ação de um prazo.
- Transforma cada eixo em ponto de partida de uma ação, não em arquivo morto.

A descoberta é por inscrição na OAB, não por advogado: o DJEN só sabe responder assim. Quem atua num
processo cuja intimação sai no nome do sócio não recebe nada, então cada advogado pode acompanhar
outras inscrições além da sua (`/inscricoes`) e o sync varre todas com o mesmo dono.

Consequências para quem escreve código aqui:

- Nada de tela que só lista. Toda tela responde "e agora, o que eu faço?".
- Documento sem link para o original é entrega incompleta.
- Prazo e ato exigem rastro: de qual publicação vieram, por qual regra, com que confiança.
- Prazo que não é dela (perito, serventia, parte contrária) não pode competir com o que é dela.

Roteiro por feature em `.koworker/tasks/`. O contrato jurídico da contagem de prazos está em
`.koworker/tasks/agenda-de-prazos--566e967d/.../regras-de-contagem.md`.

## Regras locais

- Mensagens de erro em pt-br: toasts, oRPC errors e logs do observability.

## Comandos

- `bun check` — typecheck de todos os workspaces (tsgo).
- `bun lint` — oxlint no repo inteiro.
- `bun format` — oxfmt escreve mudanças.
- `bun cases:scan [--force]` — reclassifica decisões, provas e incidentes por processo.
- `bun test` — integration tests (tx rollback, workspace `@juicerq/tests`).
- `bun test:e2e` — E2E browser tests (Playwright, workspace `@juicerq/e2e`).
- `bun check:lobomfz` — runner extra com tsgo, oxlint custom, knip, jscpd e checks `@lobomfz/check`.
- `bun agent-api <list|show|call> <path> [--input '<json>'] [--as <id>] [--pretty]` — invoca procedures oRPC in-process (sem HTTP, sem auth). Via [@juicerq/agent-api](https://github.com/juicerq/agent-api); config em `apps/api/agent-api.config.ts`.
