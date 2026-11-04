const SUPABASE_URL = "https://wzjopvvrallnaueecfnk.supabase.co";
const SUPABASE_KEY = "sb_publishable_u0T3tEkGAjpuCXT5UKFlQA_-y3j9vNV";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

async function verificarAcesso() {
  const { data, error } = await supabaseClient.auth.getSession();

  if (error || !data.session) {
    window.location.replace("login.html");
    return null;
  }

  return data.session;
}

async function sairDaConta() {
  const { error } = await supabaseClient.auth.signOut();

  if (error) {
    alert("Não foi possível sair da conta: " + error.message);
    return;
  }

  window.location.replace("login.html");
}
