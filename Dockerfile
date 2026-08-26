# Etapa 1: Build do servidor
FROM node:20-alpine AS server-build
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci
COPY server/ .
RUN npx prisma generate
RUN npm run build

# Etapa 2: Build do cliente
FROM node:20-alpine AS client-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ .
RUN npm run build

# Etapa 3: Imagem de produção
FROM node:20-alpine
WORKDIR /app

# Instala ffmpeg para conversão de áudio
RUN apk add --no-cache ffmpeg

# Copia servidor
COPY --from=server-build /app/server/dist ./server/dist
COPY --from=server-build /app/server/node_modules ./server/node_modules
COPY --from=server-build /app/server/package.json ./server/
COPY --from=server-build /app/server/prisma ./server/prisma

# Copia cliente
COPY --from=client-build /app/client/dist ./client/dist

# Copia configs raiz
COPY package.json ./

# Cria pasta de uploads e temp
RUN mkdir -p server/uploads server/temp

ENV NODE_ENV=production
ENV PORT=3001
ENV DATABASE_URL="file:./dev.db"

EXPOSE 3001

WORKDIR /app/server
CMD ["npx", "prisma", "db", "push", "--skip-generate", "&&", "node", "dist/index.js"]
