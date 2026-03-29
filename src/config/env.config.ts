import { z } from 'zod';
import * as dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('3000'),
  OPENAI_API_KEY: z.string().optional(),
  SUPABASE_URL: z.string().url('Supabase URL is required'),
  SUPABASE_KEY: z.string().min(1, 'Supabase Key is required'),
  REDIS_URL: z.string().optional(),
  DATABASE_URL: z.string().optional(),
  EVOLUTION_API_URL: z.string().optional(),
  EVOLUTION_API_KEY: z.string().optional(),
  EVOLUTION_INSTANCE: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),
  MOCK_MODE: z.string().optional().default('false').transform(v => v === 'true'),
  AGENT_TIMEOUT_MS: z.string().optional().default('45000').transform(Number),
  ADMIN_TOKEN: z.string().optional(), // Token para todas las rutas administrativas protegidas
});

type EnvConfig = z.infer<typeof envSchema>;

let parsedEnv: EnvConfig;

try {
  parsedEnv = envSchema.parse(process.env);
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error('❌ Environment validation error:', error.flatten().fieldErrors);
  }
  process.exit(1);
}

export const envConfig = parsedEnv;
