export async function onRequestGet({ request, env }) {
  try {
    const url = new URL(request.url);
    const search = url.searchParams.get("search")?.trim();

    if (!search) {
      return Response.json({ error: "Informe o nome de um jogo." }, { status: 400 });
    }

    if (!env.TWITCH_CLIENT_ID || !env.TWITCH_CLIENT_SECRET) {
      return Response.json({ error: "Credenciais da IGDB não configuradas." }, { status: 500 });
    }

    const tokenResponse = await fetch("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.TWITCH_CLIENT_ID,
        client_secret: env.TWITCH_CLIENT_SECRET,
        grant_type: "client_credentials"
      })
    });

    if (!tokenResponse.ok) {
      return Response.json({ error: "Falha na autenticação com a Twitch." }, { status: 502 });
    }

    const tokenData = await tokenResponse.json();

    const gamesResponse = await fetch("https://api.igdb.com/v4/games", {
      method: "POST",
      headers: {
        "Client-ID": env.TWITCH_CLIENT_ID,
        "Authorization": `Bearer ${tokenData.access_token}`,
        "Content-Type": "text/plain"
      },
      body: `search "${search.replace(/["\\]/g, "")}"; fields name,cover.url,first_release_date,summary,platforms.name,genres.name; limit 20;`
    });

    if (!gamesResponse.ok) {
      return Response.json({ error: "Falha ao consultar o catálogo de jogos." }, { status: 502 });
    }

    const games = await gamesResponse.json();

    return Response.json(games, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=300"
      }
    });

  } catch (error) {
    return Response.json({ error: "Erro interno ao buscar jogos." }, { status: 500 });
  }
}
