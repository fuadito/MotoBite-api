// This is the single connection to your Supabase database.
// Every route file imports from here instead of creating
// its own connection.


import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY // Service key has full DB access - never expose this to frontend
);

export default supabase;