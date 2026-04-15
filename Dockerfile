FROM node:20-alpine AS base

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

# Dummy ENVs estrictamente necesarios para que Next.js no tire error en "Collecting page data".
# NO SE USAN LLAVES REALES AQUÍ POR SEGURIDAD. Easypanel inyectará las reales en el contenedor al correr.
ENV NEXT_PUBLIC_SUPABASE_URL="https://dummy.supabase.co"
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY="dummy-anon-key-para-que-compile"
ENV SUPABASE_SERVICE_ROLE_KEY="dummy-service-key-para-que-compile"

# Next.js requiere algunas variables durante el build, pero en un CI deberíamos pasarlas
# mediante Build Args. En Easypanel puedes mapearlas; por ahora Next fallback a .env local si no lo pasas
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
