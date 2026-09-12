import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// 1. Standard Client for Browser / Front-end Views (Cashier, Kitchen, Menu, Analytics)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// 2. Admin Client strictly for Server Actions & Administrative operations (Bypasses RLS)
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export const supabaseAdmin = createClient(
  supabaseUrl,
  serviceRoleKey || supabaseAnonKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);