import { createClient } from '@supabase/supabase-js';
import { envConfig } from '../../config/env.config';

export const supabase = createClient(envConfig.SUPABASE_URL, envConfig.SUPABASE_KEY);
