(() => {
const SUPABASE_URL = "https://wzjopvvrallnaueecfnk.supabase.co";
const SUPABASE_KEY = "sb_publishable_u0T3tEkGAjpuCXT5UKFlQA_-y3j9vNV";

 window.mnSupabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  window.verificarAcesso = async function () {
    const { data, error } = await window.mnSupabaseClient.auth.getSession();

    if (error || !data.session) {
      window.location.replace("login.html");
      return null;
    }

    return data.session;
  };

  window.sairDaConta = async function () {
    const { error } = await window.mnSupabaseClient.auth.signOut();

    if (error) {
      alert("Não foi possível sair da conta: " + error.message);
      return;
    }

    window.location.replace("login.html");
  };
})();
