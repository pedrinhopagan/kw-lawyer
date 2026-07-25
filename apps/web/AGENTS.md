# AGENTS.md — apps/web

> Antes de mudança visual, consultar a skill `frontend-design`.

## Rotas

- Código local da rota fica em pastas prefixadas com `-`, ignoradas pelo TanStack Router: `-components/`, `-hooks/`, `-consts/`.
- Elevar para `src/components`, `src/hooks`, `src/types` ou `src/consts` só quando mais de uma rota usar.

## oRPC + Query

- Invalidation por namespace: `queryClient.invalidateQueries({ queryKey: orpc.x.key() })`.
- Invalidation específica: `orpc.x.y.queryKey({ input })`.
- Subscription padrão usa Event Iterator do oRPC sobre HTTP, não WebSocket.
- `experimental_liveOptions({ retry: true })` quando a tela precisa do estado atual.
- `experimental_streamedOptions({ queryFnOptions: { refetchMode: "reset", maxChunks: N }, retry: true })` só quando o array de eventos é dado de negócio: logs, chat ou timeline.
- Nome do endpoint expressa o recurso: `sync.progress`, `jobs.progress`, `notifications.live`. Evitar `subscribe`.
- Tipos derivados via `RouterOutputs` / `RouterInputs` de `@/lib/orpc`.
- Contador exibido ao lado de uma lista usa o mesmo recorte que a lista consulta. Número que não bate com o que a tela mostra é bug de dado, não de layout.
- Errors de mutation/query exibidos via `toast.error(...)` do `sonner`, mensagem em pt-br.

## Forms

- `react-hook-form` + `@hookform/resolvers/arktype`.
- Nunca TanStack Form, nunca Zod.

## useEffect

- `useEffect` é proibido em código novo para derivar estado, reagir a evento ou buscar dados.
- Exceções legítimas: integração com API imperativa como focus, scroll, canvas, WebSocket ou event emitter externo. Comentar o WHY nesses casos.

## Jotai

- Atoms em `src/state/<feature>.ts`, declarados module-level.
- Para persistência, `atomWithStorage` do `jotai/utils`.
- Sem `<JotaiProvider>` no root.

## UI

- Sempre `cn()` de `@/lib/cn` para classes condicionais.
- Ícones sempre de `lucide-react`.
- Dark mode via `useTheme()` de `next-themes` e classes Tailwind `dark:*`.
