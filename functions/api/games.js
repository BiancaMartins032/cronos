
export async function onRequestGet({ request, env }) {
  try {
    const url = new URL(request.url);
    const search = url.searchParams.get("search")?.trim();

    if (!search) {
      return Response.json(
        { error: "Digite o nome de um jogo para pesquisar." },
        { status: 400 }
      );
    }

    if (!env.TWITCH_CLIENT_ID || !env.TWITCH_CLIENT_SECRET) {
      return Response.json(
        { error: "A conexão com o catálogo de jogos não está configurada." },
        { status: 500 }
      );
    }

    const tokenResponse = await fetch(
      "https://id.twitch.tv/oauth2/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          client_id: env.TWITCH_CLIENT_ID,
          client_secret: env.TWITCH_CLIENT_SECRET,
          grant_type: "client_credentials"
        })
      }
    );

    if (!tokenResponse.ok) {
      return Response.json(
        { error: "Não foi possível conectar ao catálogo de jogos." },
        { status: 502 }
      );
    }

    const tokenData = await tokenResponse.json();

    const termo = search.replace(/["\\]/g, "");

    const consulta = `
      search "${termo}";
      fields
        name,
        cover.url,
        first_release_date,
        summary,
        platforms.name,
        genres.name,
        involved_companies.company.name,
        involved_companies.developer,
        involved_companies.publisher,
        game_type,
        version_title,
        alternative_names.name,
        total_rating,
        total_rating_count;
      limit 20;
    `;

    const gamesResponse = await fetch(
      "https://api.igdb.com/v4/games",
      {
        method: "POST",
        headers: {
          "Client-ID": env.TWITCH_CLIENT_ID,
          "Authorization": `Bearer ${tokenData.access_token}`,
          "Content-Type": "text/plain"
        },
        body: consulta
      }
    );

    if (!gamesResponse.ok) {
      const detalhe = await gamesResponse.text();
      console.error("Erro IGDB:", detalhe);

      return Response.json(
        { error: "Não foi possível consultar os jogos." },
        { status: 502 }
      );
    }

    const games = await gamesResponse.json();

    return Response.json(games, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=300"
      }
    });

  } catch (error) {
    console.error("Erro na busca de jogos:", error);

    return Response.json(
      { error: "Ocorreu um erro ao pesquisar os jogos." },
      { status: 500 }
    );
  }
}
