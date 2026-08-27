# AGENTS.md

## Projeto

Zapizapi — app de disparo e agendamento de mensagens WhatsApp via W-API (wapi.chat).

## Comandos

```bash
# Instalar dependências (raiz + server + client — NÃO é workspace, instale em cada pasta)
npm install && cd server && npm install && cd ../client && npm run install

# Rodar tudo (server :3001 + client :5173 via concurrently)
npm run dev

# Só o server (tsx watch, porta 3001)
cd server && npm run dev

# Só o client (Vite, porta 5173)
cd client && npm run dev

# Prisma: gerar cliente e criar o banco SQLite (rode ANTES de subir o server)
cd server && npm run db:generate && npm run db:push
# atalhos equivalentes aos comandos acima:
cd server && npx prisma generate && npx prisma db push

# Buildar só o frontend (server NÃO é compilado — roda via tsx)
npm run build:client
```

Não há `npm test`, lint nem format configurados — não procure esses comandos.

## Variáveis de Ambiente

Copie `server/.env.example` para `server/.env` e preencha:
- `WAPI_INSTANCE_ID` — ID da instância W-API
- `WAPI_TOKEN` — Token de autenticação
- `WAPI_BASE_URL` — URL base (padrão no `.env.example`: https://api.w-api.app)
- `DATABASE_URL="file:./dev.db"` — SQLite local

Nunca commite o `.env` (está no `.gitignore`).

## Arquitetura

- **Monorepo manual** (sem `workspaces`): `server/` (Express + Prisma + SQLite) e `client/` (React + Vite + Tailwind).
- **Banco**: Prisma + SQLite local (`server/prisma/dev.db`, criado via `db:push`). `server/supabase.sql` é espelho para Supabase na nuvem.
- **Fila**: em memória com persistência via Prisma (sem Redis no MVP).
- **WebSocket**: socket.io emite `campaign-update` para o dashboard em tempo real (`queue.ts` registra o callback em `index.ts`).
- **Proxy de dev**: Vite roteia `/api` e `/uploads` para `localhost:3001` (`client/vite.config.ts`).
- **Deploy = 1 serviço**: o Express serve a API e também o `client/dist` (SPA fallback) na mesma porta. Não crie dois serviços nem proxy extra.

## Convenções

- Código e comentários em português.
- Services isolados e testáveis em `server/src/services/`: `messageParser.ts`, `wapiClient.ts`, `queue.ts`, `excelParser.ts`, `audioConverter.ts`.
- **Imports do server usam extensão `.js`** mesmo em arquivos `.ts` (module `NodeNext`/`ESM`). Ao editar imports, mantenha o `.js` — senão quebra em runtime.
- **O server roda `.ts` direto via `tsx`** (scripts `dev`/`start`). Não rode `tsc` no server para produção; o Docker/build só compila o client.
- Spintax: `{op1|op2|op3}` é resolvido DEPOIS das variáveis `{{var}}`.
- Saudações (`messageParser.ts`): `{{ola}}` é dinâmico (Bom dia/tarde/noite pelo horário); `{{bom_dia}}`/`{{boa_tarde}}`/`{{boa_noite}}` são fixos. `{{numero}}`, `{{nome}}`, `{{empresa}}`, `{{cidade}}` e qualquer coluna extra da planilha funcionam.
- Delay entre envios é aleatório dentro de um range configurável (não fixo).
- Tema: fundo `#0A0A0A`, accent `#8B00FF`/`#A100FF`.

## Gotchas

- `fluent-ffmpeg` exige `ffmpeg` no sistema (o `Dockerfile` já instala via `apk add ffmpeg`).
- W-API não é oficial — payloads podem mudar; consulte a doc antes de alterar `wapiClient.ts`.
- Planilha (`xlsx`) precisa de coluna de número (aliases: numero, telefone, whatsapp, phone).
- Números são normalizados com DDI 55 automaticamente.
- O script `db:seed` existe no `package.json` mas aponta para `prisma/seed.ts` que NÃO existe — não use.

## Deploy (Docker / Easypanel)

Imagem única (raiz `Dockerfile`): builda o client e sobe o server servindo API + frontend.

- **Build**: `npx prisma generate && npx prisma db push && npm run build`
- **Start**: `npm start` (sobe o server via `tsx`)
- **Porta**: `PORT` (padrão 3001)
- **Env**: `WAPI_INSTANCE_ID`, `WAPI_TOKEN`, `WAPI_BASE_URL`, `DATABASE_URL="file:./dev.db"`, `PORT`
- **Persistência**: o SQLite grava em `/app/data/dev.db` e há uploads em `server/uploads` — monte volumes em `/app/data` e `/app/server/uploads` (NUNCA monte o `/app/server` inteiro, senão o volume vazio sobrescreve o código do server). Defina `DATABASE_URL=file:/app/data/dev.db` na deploy. Para Postgres/Supabase, troque `DATABASE_URL` e adapte `db.ts`/`schema.prisma` (espelho em `server/supabase.sql`).
