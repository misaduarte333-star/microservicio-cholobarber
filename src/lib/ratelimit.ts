import { redis } from '@/lib/ai/debouncer.service'

/**
 * Rate limiter ligero usando Redis (sliding window counter).
 *
 * @param key     - Identificador único de la acción (ej: `login:1.2.3.4`)
 * @param limit   - Máximo de intentos permitidos en la ventana
 * @param windowS - Tamaño de la ventana en segundos
 * @returns true si el request está dentro del límite, false si debe bloquearse
 */
export async function checkRateLimit(
    key: string,
    limit: number,
    windowS: number
): Promise<{ allowed: boolean; remaining: number; retryAfterS: number }> {
    const redisKey = `rl:${key}`

    // Si Redis no está disponible, permitir siempre (fail open para no bloquear usuarios legítimos)
    if (redis.status !== 'ready') {
        return { allowed: true, remaining: limit, retryAfterS: 0 }
    }

    try {
        // INCR + EXPIRE en pipeline atómico para evitar race condition
        const pipeline = redis.pipeline()
        pipeline.incr(redisKey)
        pipeline.ttl(redisKey)
        const results = await pipeline.exec()

        const count = (results?.[0]?.[1] as number) ?? 1
        const ttl   = (results?.[1]?.[1] as number) ?? -1

        // Si la clave es nueva (TTL = -1) o no tiene expiración, establecerla
        if (ttl < 0) {
            await redis.expire(redisKey, windowS)
        }

        const remaining    = Math.max(0, limit - count)
        const retryAfterS  = ttl > 0 ? ttl : windowS

        return {
            allowed:      count <= limit,
            remaining,
            retryAfterS,
        }
    } catch {
        // Si Redis falla en el comando, fail open
        return { allowed: true, remaining: limit, retryAfterS: 0 }
    }
}
