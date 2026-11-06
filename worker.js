export default {
  async fetch(request, env) {
    const url = new URL(request.url);
        // API do Xbox — consulta o perfil da conta
    if (url.pathname === "/api/xbox/profile" && request.method === "GET") {
      try {
        if (!env.OPENXBL_API_KEY) {
          return Response.json(
            { error: "Chave da OpenXBL não configurada." },
            { status: 500 } 
          );
        }

        const resposta = await fetch(
          "https://api.xbl.io/v2/account",
          {
            method: "GET",
            headers: {
              "X-Authorization": env.OPENXBL_API_KEY
            }
          }
        );

        const dados = await resposta.json();

        return Response.json(dados, {
          status: resposta.status
        });

      } catch (error) {
        return Response.json(
          { error: "Erro ao consultar o perfil Xbox." },
          { status: 500 }
        );
      }
    }

        // API do Xbox — histórico de jogos do perfil
    if (url.pathname === "/api/xbox/games" && request.method === "GET") {
      try {
        if (!env.OPENXBL_API_KEY) {
          return Response.json(
            { error: "Chave da OpenXBL não configurada." },
            { status: 500 }
          );
        }

        const resposta = await fetch(
          "https://api.xbl.io/v2/player/titleHistory",
          {
            headers: {
              "X-Authorization": env.OPENXBL_API_KEY
            }
          }
        );

        const dados = await resposta.json();

        return Response.json(dados, {
          status: resposta.status
        });

      } catch (error) {
        return Response.json(
          { error: "Erro ao consultar o histórico de jogos Xbox." },
          { status: 500 }
        );
      }
    }
    // API de pesquisa de jogos
    if (url.pathname === "/api/games" && request.method === "GET") {
      try {
        const search = url.searchParams.get("search")?.trim();

        if (!search) {
          return Response.json(
            { error: "Informe o nome de um jogo." },
            { status: 400 }
          );
        }

        if (!env.TWITCH_CLIENT_ID || !env.TWITCH_CLIENT_SECRET) {
  return Response.json(
    {
      clientIdConfigurado: Boolean(env.TWITCH_CLIENT_ID),
      clientSecretConfigurado: Boolean(env.TWITCH_CLIENT_SECRET)
    },
    { status: 500 }
  );
}
        // Autenticação na Twitch
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
            { error: "Falha na autenticação com a Twitch." },
            { status: 502 }
          );
        }

        const tokenData = await tokenResponse.json();

        // Pesquisa na IGDB
        const termo = search
          .replace(/\\/g, "")
          .replace(/"/g, "")
          .replace(/[\r\n]/g, " ")
          .slice(0, 100);

        const gamesResponse = await fetch(
          "https://api.igdb.com/v4/games",
          {
            method: "POST",
            headers: {
              "Client-ID": env.TWITCH_CLIENT_ID,
              "Authorization": `Bearer ${tokenData.access_token}`,
              "Content-Type": "text/plain"
            },
            body: `search "${termo}"; fields name,cover.url,first_release_date,summary,platforms.name,genres.name; limit 20;`
          }
        );

        if (!gamesResponse.ok) {
          return Response.json(
            { error: "Falha ao consultar o catálogo de jogos." },
            { status: 502 }
          );
        }

        const games = await gamesResponse.json();

        return Response.json(games, {
          headers: {
            "Cache-Control": "public, max-age=300"
          }
        });

      } catch (error) {
        return Response.json(
          { error: "Erro interno ao buscar jogos." },
          { status: 500 }
        );
      }
    }

    // Mantém todas as páginas e arquivos atuais do site
    return env.ASSETS.fetch(request);
  }
};
