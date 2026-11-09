
import { onRequestGet as buscarJogos } from "./functions/api/games.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // API do Google Books
    if (url.pathname === "/api/books" && request.method === "GET") {
      try {
        if (!env.GOOGLE_BOOKS_API_KEY) {
          return Response.json(
            { error: "Chave do Google Books não configurada." },
            { status: 500 }
          );
        }

        const termo = url.searchParams.get("q");

        if (!termo || termo.length > 200) {
          return Response.json(
            { error: "Informe um termo de pesquisa válido." },
            { status: 400 }
          );
        }

        const parametros = new URLSearchParams({
          q: termo,
          langRestrict: "pt",
          printType: "books",
          maxResults: "40",
          startIndex: url.searchParams.get("startIndex") || "0",
          key: env.GOOGLE_BOOKS_API_KEY
        });

        const resposta = await fetch(
          "https://www.googleapis.com/books/v1/volumes?" +
          parametros.toString()
        );

        const dados = await resposta.json();

        return Response.json(dados, {
          status: resposta.status
        });

      } catch (error) {
        return Response.json(
          { error: "Erro ao consultar o Google Books." },
          { status: 500 }
        );
      }
    }

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

    // API do Xbox — conquistas de um jogo
    if (url.pathname === "/api/xbox/achievements" && request.method === "GET") {
      try {
        const xuid = url.searchParams.get("xuid") || "2535444037113029";
        const titleId = url.searchParams.get("titleId");

        if (!titleId) {
          return Response.json(
            { error: "Informe o ID do jogo (titleId)." },
            { status: 400 }
          );
        }

        if (!env.OPENXBL_API_KEY) {
          return Response.json(
            { error: "Chave da OpenXBL não configurada." },
            { status: 500 }
          );
        }

        const resposta = await fetch(
          `https://api.xbl.io/v2/achievements/player/${encodeURIComponent(xuid)}/${encodeURIComponent(titleId)}`,
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
          { error: "Erro ao consultar conquistas do jogo." },
          { status: 500 }
        );
      }
    }

    // API do Xbox — estatísticas de um jogo
    if (url.pathname === "/api/xbox/stats" && request.method === "GET") {
      try {
        const titleId = url.searchParams.get("titleId") || "1479758055";

        if (!env.OPENXBL_API_KEY) {
          return Response.json(
            { error: "Chave da OpenXBL não configurada." },
            { status: 500 }
          );
        }

        const resposta = await fetch(
          `https://api.xbl.io/v2/achievements/stats/${encodeURIComponent(titleId)}`,
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
          { error: "Erro ao consultar estatísticas do jogo." },
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
      return buscarJogos({ request, env });
    }

    // Mantém todas as páginas e arquivos atuais do site
    return env.ASSETS.fetch(request);
  }
};
