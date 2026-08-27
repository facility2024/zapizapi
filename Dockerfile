FROM node:20-alpine

# ffmpeg é necessário para conversão de áudio (fluent-ffmpeg)
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Instala dependências (raiz, server e client)
COPY package*.json ./
RUN npm install
COPY server/package*.json ./server/
RUN cd server && npm install
COPY client/package*.json ./client/
RUN cd client && npm install

# Código-fonte
COPY . .

# Garante o diretório de uploads
RUN mkdir -p server/uploads

# Gera o client Prisma e builda o frontend (client/dist)
RUN cd server && npx prisma generate
RUN npm run build

ENV PORT=3001
EXPOSE 3001

# Cria o banco SQLite (se não existir) e sobe o servidor (API + frontend na mesma porta)
CMD ["sh", "-c", "cd server && npx prisma db push && npm start"]
