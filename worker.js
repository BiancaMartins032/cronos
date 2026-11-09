
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

           // API de livros — Open Library com Google Books como alternativa
    if (url.pathname === "/api/openlibrary/books" && request.method === "GET") {
      const autor = url.searchParams.get("author");
      const pagina = Math.max(
        1,
        Number(url.searchParams.get("page")) || 1
      );

      if (!autor) {
        return Response.json(
          { error: "Informe o nome do autor." },
          { status: 400 }
        );
      }

      const cacheKey = new Request(url.toString(), {
        method: "GET"
      });

      const cache = caches.default;

      try {
        // 1. Verifica se já existe uma consulta salva
        const respostaCache = await cache.match(cacheKey);

        if (respostaCache) {
          return respostaCache;
        }

        // 2. Tenta consultar primeiro a Open Library
        try {
          const parametros = new URLSearchParams({
            q: `author:"${autor}" AND language:por`,
            page: String(pagina),
            limit: "100",
            fields: [
              "key",
              "title",
              "author_name",
              "author_key",
              "first_publish_year",
              "cover_i",
              "edition_count",
              "editions",
              "editions.key",
              "editions.title",
              "editions.language",
              "editions.cover_i"
            ].join(",")
          });

          const resposta = await fetch(
            "https://openlibrary.org/search.json?" +
            parametros.toString()
          );

          if (!resposta.ok) {
            throw new Error(
              "Open Library retornou erro: " + resposta.status
            );
          }

          const dados = await resposta.json();

          const resultado = Response.json(dados, {
            headers: {
              "Cache-Control": "public, max-age=21600"
            }
          });

          await cache.put(cacheKey, resultado.clone());

          return resultado;

        } catch (erroOpenLibrary) {
          console.error(
            "Open Library indisponível:",
            erroOpenLibrary
          );
        }

        // 3. Se a Open Library falhar, tenta o Google Books
        const livros = [];
        const idsVistos = new Set();
        let totalEncontrado = 0;

        for (let parte = 0; parte < 3; parte++) {
          const inicio = (pagina - 1) * 100 + (parte * 40);

          const parametrosGoogle = new URLSearchParams({
            q: `inauthor:"${autor}"`,
            langRestrict: "pt",
            startIndex: String(inicio),
            maxResults: "40",
            printType: "books"
          });

          const respostaGoogle = await fetch(
            "https://www.googleapis.com/books/v1/volumes?" +
            parametrosGoogle.toString()
          );

          if (!respostaGoogle.ok) {
  const detalheGoogle = await respostaGoogle.text();

  throw new Error(
    "Google Books retornou erro: " +
    respostaGoogle.status +
    " - " +
    detalheGoogle
  );
}

          const dadosGoogle = await respostaGoogle.json();

          totalEncontrado = dadosGoogle.totalItems || 0;

          const itens = dadosGoogle.items || [];

          for (const item of itens) {
            if (!item.id || idsVistos.has(item.id)) continue;

            idsVistos.add(item.id);

            const info = item.volumeInfo || {};

            const dataPublicacao = (
              info.publishedDate || ""
            ).match(/^\d{4}/);

            const capaGoogle =
              info.imageLinks?.thumbnail ||
              info.imageLinks?.smallThumbnail ||
              "";

            livros.push({
              key: "/works/GOOGLE_" + item.id,
              title: info.title || "Título não informado",
              author_name: info.authors?.length
                ? info.authors
                : [autor],
              author_key: [],
              first_publish_year: dataPublicacao
                ? Number(dataPublicacao[0])
                : null,
              cover_i: null,
              edition_count: 1,
              editions: {
                docs: [
                  {
                    title: info.title || "Título não informado",
                    language: ["por"],
                    cover_i: null,
                    cover_url: capaGoogle.replace(/^http:/, "https:")
                  }
                ]
              }
            });
          }

          if (
            itens.length < 40 ||
            inicio + 40 >= totalEncontrado
          ) {
            break;
          }
        }

        // 4. Mantém o mesmo formato de resposta da Open Library
        const dadosAlternativos = {
          numFound: totalEncontrado,
          docs: livros
        };

        const resultado = Response.json(dadosAlternativos, {
          headers: {
            "Cache-Control": "public, max-age=21600"
          }
        });

        await cache.put(cacheKey, resultado.clone());

        return resultado;

      } catch (error) {
        console.error("Erro nas fontes de livros:", error);

        return Response.json(
          {
            error: "Não foi possível consultar as fontes de livros.",
            detalhe: error.message
          },
          { status: 502 }
        );
      }
    }

    
    // API — informações biográficas do autor
    if (url.pathname === "/api/openlibrary/author" && request.method === "GET") {
      try {
        const nome = url.searchParams.get("name");

        if (!nome) {
          return Response.json(
            { error: "Informe o nome do autor." },
            { status: 400 }
          );
        }

        const normalizar = texto => (texto || "")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .trim();

        const nomeTokens = normalizar(nome).split(/\s+/);

        const combinaNome = texto => {
          const tokens = normalizar(texto).split(/\s+/);
          return tokens.length >= 2 &&
            tokens.every(token => nomeTokens.includes(token));
        };

        let nascimento = "";
        let naturalidade = "";
        let biografia = "";

        // 1. Busca de nascimento no Open Library
        try {
          const busca = await fetch(
            "https://openlibrary.org/search/authors.json?q=" +
            encodeURIComponent(nome)
          );

          if (busca.ok) {
            const dados = await busca.json();
            const autores = dados.docs || [];

            const encontrado = autores.find(item =>
              normalizar(item.name) === normalizar(nome)
            ) || autores.find(item => combinaNome(item.name));

            if (encontrado) {
              nascimento = encontrado.birth_date || "";
            }
          }
        } catch (erro) {
          console.warn("Open Library indisponível:", erro);
        }

        // 2. Busca da biografia na Wikipédia
        try {
          const parametrosWiki = new URLSearchParams({
            action: "query",
            generator: "search",
            gsrsearch: nome,
            gsrlimit: "5",
            prop: "extracts",
            exintro: "1",
            explaintext: "1",
            format: "json"
          });

          const respostaWiki = await fetch(
            "https://pt.wikipedia.org/w/api.php?" +
            parametrosWiki.toString()
          );

          if (respostaWiki.ok) {
            const dadosWiki = await respostaWiki.json();
            const paginas = Object.values(
              dadosWiki.query?.pages || {}
            );

            const pagina = paginas.find(item =>
              normalizar(item.title) === normalizar(nome)
            ) || paginas.find(item => combinaNome(item.title));

            if (pagina) {
              biografia = pagina.extract || "";
            }
          }
        } catch (erro) {
          console.warn("Wikipédia indisponível:", erro);
        }

        // 3. Busca de nascimento e naturalidade no Wikidata
        try {
          const parametrosBusca = new URLSearchParams({
            action: "wbsearchentities",
            search: nome,
            language: "pt",
            uselang: "pt",
            type: "item",
            format: "json"
          });

          const respostaBusca = await fetch(
            "https://www.wikidata.org/w/api.php?" +
            parametrosBusca.toString()
          );

          if (respostaBusca.ok) {
            const dadosBusca = await respostaBusca.json();
            const entidades = dadosBusca.search || [];

            const entidade = entidades.find(item =>
              normalizar(item.label) === normalizar(nome)
            ) || entidades.find(item => combinaNome(item.label));

            if (entidade) {
              const respostaDados = await fetch(
                "https://www.wikidata.org/w/api.php?" +
                new URLSearchParams({
                  action: "wbgetentities",
                  ids: entidade.id,
                  props: "claims",
                  format: "json"
                }).toString()
              );

              if (respostaDados.ok) {
                const dadosEntidade = await respostaDados.json();
                const claims = dadosEntidade.entities?.[entidade.id]?.claims || {};

                const valorNascimento =
                  claims.P569?.[0]?.mainsnak?.datavalue?.value?.time;

                if (valorNascimento) {
                  const partes = valorNascimento.match(
                    /[+-](\d{4})-(\d{2})-(\d{2})/
                  );

                  if (partes) {
                    nascimento = `${partes[3]}/${partes[2]}/${partes[1]}`;
                  }
                }

                const idNaturalidade =
                  claims.P19?.[0]?.mainsnak?.datavalue?.value?.id;

                if (idNaturalidade) {
                  const respostaLocal = await fetch(
                    "https://www.wikidata.org/w/api.php?" +
                    new URLSearchParams({
                      action: "wbgetentities",
                      ids: idNaturalidade,
                      props: "labels",
                      languages: "pt|en",
                      format: "json"
                    }).toString()
                  );

                  if (respostaLocal.ok) {
                    const dadosLocal = await respostaLocal.json();
                    const local = dadosLocal.entities?.[idNaturalidade];

                    naturalidade =
                      local?.labels?.pt?.value ||
                      local?.labels?.en?.value ||
                      "";
                  }
                }
              }
            }
          }
        } catch (erro) {
          console.warn("Wikidata indisponível:", erro);
        }

        return Response.json({
          name: nome,
          bio: biografia,
          birth_date: nascimento,
          location: naturalidade
        });

      } catch (error) {
        console.error("Erro ao consultar biografia:", error);

        return Response.json(
          {
            error: "Não foi possível consultar as informações.",
            detalhe: error.message
          },
          { status: 500 }
        );
      }
    }

    // API do Xbox — consulta o perfil da conta
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
