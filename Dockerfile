# Etapa 1: Builder — dependencias completas + compilación (producción) o tsx watch (dev)
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
COPY tsconfig.json ./

# Instalar TODAS las dependencias (incluidas las de compilación/tsx)
RUN npm ci --legacy-peer-deps

# Copiar el código fuente
COPY src ./src
COPY public ./public

# Compilar TypeScript (solo se usa en producción; en dev se omite con target: builder)
RUN npm run build

# Etapa 2: Producción (Ligera)
FROM node:20-alpine AS runner
WORKDIR /app

# Asignar modo producción
ENV NODE_ENV=production

# Copiar dependencias de package.json
COPY package*.json ./

# Instalar SOLO las dependencias necesarias para ejecución
RUN npm ci --only=production --legacy-peer-deps

# Copiar la carpeta compilada (dist) desde la etapa builder
COPY --from=builder /app/dist ./dist

# Copiar archivos estáticos (interfaz de chat)
COPY public ./public

# No correr como root
RUN addgroup -S cholobot && adduser -S cholobot -G cholobot
USER cholobot

# Exponer el puerto
EXPOSE 3001

# Health check — EasyPanel lo usa para saber si el servicio está sano
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

# Comando para inciar la aplicación compilada
CMD ["npm", "start"]
