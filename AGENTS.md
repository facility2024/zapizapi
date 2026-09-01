# AGENTS.md

## Projeto

Zapizapi — disparo e agendamento de WhatsApp via W-API (wapi.chat). `server/` (Express + Prisma + SQLite) + `client/` (React + Vite + Tailwind). Monorepo manual sem workspaces.

## Comandos

```bash
# Instalar — NÃO é workspace, instale nas 3 pastas (ordem importa: raiz tem concurrently)
npm install && cd server && npm install && cd ../client && npm install

# Env + banco — rode ANTES do primeiro dev (gera Prisma Client + cria SQLite)
cp server/.env.example server/.env  # preencha WAPI_* e DATABASE_URL
cd server && npx prisma generate && npx prisma db push
# atalhos: npm run db:generate / npm run db:push

# Dev — raiz sobe ambos via concurrently (server :3001 + client :5173)
npm run dev              # ou start_dev.bat no Windows
cd server && npm run dev # só API (tsx watch src/index.ts:6)
cd client && npm run dev # só Vite (proxy /api e /uploads -> :3001 em client/vite.config.ts:40)

# Build — só o client é compilado; server roda .ts direto via tsx
npm run build            # = npm run build:client -> client/dist
npm start                # cd server && tsx src/index.ts (também usado no Docker CMD)
```

Não há `npm test`, lint ou format — não procure. `server/package.json:11` `db:seed` aponta para `prisma/seed.ts` inexistente — não use. Caminho do repo contém espaços (`projeto   teste1`) — sempre cite paths com aspas no PowerShell.

## Variáveis de Ambiente

`server/.env.example:1` -> `server/.env` (gitignore). Obrigatórias:
- `WAPI_INSTANCE_ID`, `WAPI_TOKEN`, `WAPI_BASE_URL` (padrão `https://api.w-api.app`), `DATABASE_URL="file:./dev.db"` (local) / `file:/app/data/dev.db` (Docker), `PORT=3001`.
- Sem `WAPI_*` a fila checa `wapiClient.ts:88` `checkStatus()` e pausa a campanha (`queue.ts:119`).

## Arquitetura

- **Entrypoints**: `server/src/index.ts:21` (Express + socket.io, serve `client/dist` com fallback `server/src/index.ts:45` que exclui `/api|/uploads|socket.io`), `server/src/db.ts:10` (singleton Prisma), `client/src/main.tsx`.
- **Banco**: Prisma SQLite `server/prisma/schema.prisma:5` (`DATABASE_URL` env). Arquivo local `server/prisma/dev.db` criado por `db:push`. Espelho Postgres em `server/supabase.sql`.
- **Fila**: em memória + persistência Prisma, sem Redis (`server/src/services/queue.ts:19`). `queue.ts:29` `onStatusUpdate` registrado em `index.ts:61` emite `campaign-update` via socket.io para o dashboard.
- **Services testáveis** `server/src/services/`: `messageParser.ts`, `wapiClient.ts`, `queue.ts`, `excelParser.ts`, `audioConverter.ts`.
- **Deploy = 1 serviço**: Express serve API + SPA na mesma porta. `Dockerfile:42` `CMD cd server && npx prisma db push && npm start`. Não crie segundo serviço nem proxy extra.

## Convenções (que quebram se ignoradas)

- **Imports do server com `.js`** mesmo em `.ts` (`module: NodeNext` em `server/tsconfig.json:4`). Ex.: `from "./db.js"` em `server/src/index.ts:18` — manter `.js` ou quebra em runtime via `tsx`.
- **Server roda `.ts` via `tsx`** (`server/package.json:6` `tsx watch`/`tsx src/index.ts`). Não rode `tsc` para produção; só o client é buildado.
- Código/comentários em português.
- Spintax `{a|b}` resolvido DEPOIS de `{{var}}` (`messageParser.ts:113` `processarMensagem`).
- Saudações: `{{ola}}` dinâmico por horário (`messageParser.ts:14`), `{{bom_dia}}`/`{{boa_tarde}}`/`{{boa_noite}}` fixos; `{{numero}}`/`{{nome}}`/`{{empresa}}`/`{{cidade}}` + qualquer coluna extra da planilha via `extras` JSON.
- Delay aleatório `delayEntreMsgMin/Max` entre envios + `delayImagemTexto` entre imagem e texto (`queue.ts:40`).
- Tema Tailwind `client/tailwind.config.js:6` `bg #0A0A0A`, `accent #8B00FF/#A100FF`.

## Gotchas

- Planilha precisa coluna de número — aliases `server/src/services/excelParser.ts:25` (`numero, telefone, whatsapp, phone, celular...`); números normalizados com DDI 55 (`excelParser.ts:34`). Upload `server/src/routes/upload.ts:17` aceita `.xlsx/.xls/.csv` (10 MB), mídia `upload.ts:20` `jpg/png/gif/webp/mp3/wav/m4a/ogg/opus` (16 MB) salva em `server/uploads` servida em `index.ts:35` `/uploads`.
- `audioConverter.ts:13` usa `ffmpeg-static` localmente (sem `ffmpeg` global funciona); `Dockerfile:4` ainda instala `apk add ffmpeg` para fallback.
- W-API não é oficial — payloads em `wapiClient.ts:152` e diante podem mudar.
- Sempre regenere após editar schema: `npx prisma generate`.

## Deploy (Docker / Easypanel)

Imagem única `Dockerfile:1` `node:20-alpine`. Build instala raiz/server/client, roda `npx prisma generate` + `npm run build` (client). Volumes obrigatórios `docker-compose.yml:13` `db-data:/app/data` e `uploads:/app/server/uploads` com `DATABASE_URL=file:/app/data/dev.db` — **nunca** monte `/app/server` inteiro (sobrescreve código). Para Postgres/Supabase troque `DATABASE_URL` e adapte `db.ts`/`schema.prisma`.
