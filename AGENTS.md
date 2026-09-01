# AGENTS.md

## Projeto

Zapizapi — disparo/agendamento WhatsApp via W-API (wapi.chat). `server/` Express + Prisma SQLite + `client/` React+Vite+Tailwind. Monorepo manual **sem workspaces** — `npm install` em 3 lugares (raiz, `server/`, `client/`).

## Comandos

```bash
# Instalar — ordem importa (raiz tem concurrently)
npm install && cd server && npm install && cd ../client && npm install

# Env + banco — ANTES do primeiro dev
cp server/.env.example server/.env   # preencha WAPI_* e DATABASE_URL
cd server && npx prisma generate && npx prisma db push
# atalhos: npm run db:generate / npm run db:push

# Dev — raiz sobe ambos via concurrently (server :3001 + client :5173)
npm run dev              # ou start_dev.bat no Windows
cd server && npm run dev # só API — tsx watch src/index.ts
cd client && npm run dev # só Vite — proxy /api e /uploads -> :3001 (client/vite.config.ts:39)

# Build — só client é compilado; server roda .ts via tsx
npm run build            # = build:client -> client/dist
npm start                # cd server && tsx src/index.ts (usado no Docker CMD)
```

Sem testes/lint/format/CI — não procure (`server/package.json:11` `db:seed` aponta p/ `prisma/seed.ts` inexistente). Repo tem espaços no caminho (`projeto   teste1`) — use aspas no PowerShell.

## Variáveis de Ambiente

`server/.env.example` -> `server/.env` (gitignore). Chaves:
- `WAPI_INSTANCE_ID`, `WAPI_TOKEN` obrigatórios; `WAPI_BASE_URL` default `https://api.w-api.app` em `server/src/services/wapiClient.ts:14` e `.env.example:3` (mas `docker-compose.yml:9` usa `https://api.wapi.chat`).
- `DATABASE_URL="file:./dev.db"` local / `file:/app/data/dev.db` Docker, `PORT=3001`.
- `SMTP_HOST/PORT/USER/PASSWORD/NOTIFY_TO` Hostinger (`server/src/services/emailService.ts`) — opcional fora de prod.
- Sem `WAPI_*`, `queue.ts:119` checa `wapiClient.ts:88` `checkStatus()` e pausa campanha (`status=pausada` + evento `conexao_perdida`).

## Arquitetura

- **Entrypoints**: `server/src/index.ts:21` (Express + socket.io; serve `client/dist` com fallback `server/src/index.ts:50` excluindo `/api|/uploads|socket.io`), `server/src/db.ts:10` singleton Prisma, `client/src/main.tsx`.
- **Banco**: Prisma SQLite `server/prisma/schema.prisma:5`. `server/prisma/dev.db` criado por `db:push`. `server/supabase.sql` é espelho Postgres não usado local.
- **Fila**: in-memory + persistência Prisma, sem Redis (`server/src/services/queue.ts:19`). `queue.ts:29` `onStatusUpdate` registrado em `index.ts:66` emite `campaign-update` via socket.io.
- **Scheduler**: `server/src/services/scheduler.ts:269` `iniciarScheduler()` — `setInterval` 30s + cron `* * * * *`, boot após 5s. Janela 08–22 BRT (`server/src/services/agendamentoService.ts:25`), fuso `America/Sao_Paulo` via `luxon` (nunca offset manual), recorrência `nenhuma|diaria|semanal|mensal`, retry backoff `agendamentoService.ts:124` (2min*2^(n-1), max 3), `scheduler.ts:26` `processingIds` lock só in-memory.
- **Services**: `server/src/services/` `messageParser.ts`, `wapiClient.ts`, `queue.ts`, `excelParser.ts`, `audioConverter.ts`, `agendamentoService.ts`, `scheduler.ts`, `emailService.ts`.
- **Deploy = 1 serviço**: Express serve API+SPA na mesma porta. `Dockerfile:42` `CMD cd server && npx prisma db push && npm start`. Não crie segundo serviço/proxy.

## Convenções (que quebram se ignoradas)

- **Imports server com `.js`** mesmo em `.ts` (`server/tsconfig.json:4` `module: NodeNext`). Ex: `from "./db.js"` em `server/src/index.ts:18` — sem `.js` quebra no `tsx`.
- **Server roda `.ts` via `tsx`** (`server/package.json:6`); `build: tsc` só checagem.
- Código/comentários em português.
- **Spintax `{a|b}` depois de `{{var}}`** (`messageParser.ts:113` `processarMensagem`); `{{ola}}` saudação por horário, `{{bom_dia|boa_tarde|boa_noite}}` fixas; `{{numero|nome|empresa|cidade}}` + extras da planilha via `extras` JSON, fallback `variavelFallback`.
- Delays: `delayEntreMsgMin/Max` aleatório entre envios + `delayImagemTexto` entre imagem e texto (`queue.ts:40`); `queue.ts:105` delay inicial 10–20s.
- Datas sempre UTC no banco, conversão BRT via `agendamentoService.ts:33` `paraUTC`/`paraBRT` com `luxon` TZ `America/Sao_Paulo`; valida passado e janela antes de agendar.
- Tailwind `client/tailwind.config.js:6` `bg #0A0A0A`, `accent #8B00FF/#A100FF`.

## Gotchas

- Planilha exige coluna de número — aliases `excelParser.ts:25` (`numero, telefone, whatsapp, phone, celular, número, num`), demais `nome/name/contato`, `empresa/company`, `cidade/city`; normaliza p/ `55`+DDD (`excelParser.ts:34`, `upload.ts:130`). Upload `server/src/routes/upload.ts:16` `.xlsx/.xls/.csv` 10 MB (memória); mídia `upload.ts:19` `jpg/jpeg/png/gif/webp/mp3/wav/m4a/ogg/opus` 16 MB → `server/uploads` servido em `index.ts:38` `/uploads`. Manual `POST /api/upload/manual` aceita `numero|nome` por linha (`upload.ts:90`).
- `audioConverter.ts:13` usa `ffmpeg-static` local; `Dockerfile:4` instala `apk add ffmpeg` p/ fallback.
- W-API não oficial — payloads `wapiClient.ts:152`+ podem mudar; `wapiClient.ts:54` `toBase64DataUrl` converte `/uploads/*` locais p/ `data:` URL antes de enviar.
- Sempre `npx prisma generate` após editar `schema.prisma`; `PORT` default 3001 em `index.ts:30` e `Dockerfile:19`.

## Deploy (Docker / Easypanel)

Imagem única `Dockerfile:1` `node:20-alpine3.18` + `npm install` raiz/server/client, `npx prisma generate` e `npm run build`. Volumes obrigatórios `docker-compose.yml:13` `db-data:/app/data` e `uploads:/app/server/uploads` com `DATABASE_URL=file:/app/data/dev.db` — **nunca** monte `/app/server` inteiro. Para Postgres troque `DATABASE_URL` e adapte `schema.prisma`/`db.ts`.
