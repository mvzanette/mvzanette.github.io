// Configuração da área restrita.
// Com os dois campos abaixo vazios, a área funciona em MODO DEMONSTRAÇÃO:
// os dados ficam apenas no navegador em uso e os e-mails não são enviados.
//
// Valores do projeto no Supabase: Project Settings → API Keys → Project URL e a chave
// "Publishable" (sb_publishable_…) ou, nos projetos antigos, a "anon public".
// Essa chave pode ficar pública: o acesso aos dados é protegido pelo login e pelas regras do banco.
// NUNCA coloque aqui a chave "Secret" (sb_secret_…) nem a "service_role".
export const SUPABASE_URL = "https://dhhwxzvcvzgvxejnyczn.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_QJgPoVJAh3AXR0roEQUboA_DO0Y_SxE";
