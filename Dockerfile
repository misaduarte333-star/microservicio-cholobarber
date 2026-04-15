FROM public.ecr.aws/docker/library/node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json package-lock.json* ./
RUN npm ci --legacy-peer-deps

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Forzamos un límite bajo de RAM a Node (Max 1.5GB) para evitar un OOM Kill
ENV NODE_OPTIONS="--max-old-space-size=1536"

# IMPORTANTE: Next.js inyecta (quema) TODAS las variables "NEXT_PUBLIC_" en el código de 
# interfaz (JS) durante EL BUILD (npm run build). Si ponemos valores falsos aquí, el cliente 
# del navegador tratará de conectarse a esos falsos y crasheará.
# Estas llaves "NEXT_PUBLIC" SON SEGURAS de exponer por diseño, no disparan advertencias de seguridad.
ENV NEXT_PUBLIC_SUPABASE_URL=https://zzkryfmfoucxxmimrhyh.supabase.co
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp6a3J5Zm1mb3VjeHhtaW1yaHloIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDY4MjI4OSwiZXhwIjoyMDg2MjU4Mjg5fQ.sGjaJYWmXfDVRXbFsta0eJ9Y7yW4hKTKuSpGfPASisE

# Esta SÍ es secreta. No tiene el prefijo NEXT_PUBLIC_ así que no se quema en el código JS.
# Le ponemos un string de mentira para que el SDK de Supabase no crashee con "supabaseKey is required"
# durante el build. Easypanel la sobreescribirá en producción.
ENV SUPABASE_SERVICE_ROLE_KEY="dummy-service-key-para-que-compile"

RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3001

ENV PORT=3001
ENV HOSTNAME="0.0.0.0"

# Health check — EasyPanel lo usa para saber si el servicio está sano
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/api/admin/health || exit 1

CMD ["node", "server.js"]
