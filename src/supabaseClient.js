import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Falha cedo e com mensagem clara em vez de um erro genérico do cliente Supabase.
  console.error(
    "Faltam VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Configura o ficheiro .env (ver .env.example)."
  );
}

export const supabase = createClient(url, anonKey);
