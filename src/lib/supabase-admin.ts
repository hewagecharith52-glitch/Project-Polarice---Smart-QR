import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// 1. Standard Client for Browser / Front-end Views
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder'
);

// 2. Admin Client strictly for Server Actions (Bypasses RLS)
const adminKey = serviceRoleKey || supabaseAnonKey;

export const supabaseAdmin = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  adminKey || 'placeholder',
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);