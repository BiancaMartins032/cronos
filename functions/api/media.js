
export async function onRequestGet({ request, env }) {
  try {
    const url = new URL(request.url);
    const search = url.searchParams.get("search")?.trim();
    const type = url.searchParams.get("type");
    const id = url.searchParams.get("id");

    if (!["movie", "tv"].includes(type)) { 
      return Response.json(
        { error: "Tipo de conteúdo inválido." },
        { status: 400 }
      );
    }

    if (!env.TMDB_API_KEY) {
      return Response.json(
        { error: "Chave do TMDB não configurada." },
        { status: 500 }
      );
    }

    const parametros = new URLSearchParams({
      api_key: env.TMDB_API_KEY,
      language: "pt-BR"
    });

    // BUSCAR DETALHES DE FILME OU SÉRIE
    if (id) {
      if (!/^\d+$/.test(id)) {
        return Response.json(
          { error: "Identificador inválido." },
          { status: 400 }
        );
      }

      parametros.set(
        "append_to_response",
        type === "movie"
          ? "credits,release_dates"
          : "credits,content_ratings"
      );

      const resposta = await fetch(
        `https://api.themoviedb.org/3/${type}/${id}?${parametros}`
      );

      if (!resposta.ok) {
        return Response.json(
          { error: "Não foi possível consultar os detalhes." },
          { status: 502 }
        );
      }

      const item = await resposta.json();
      const equipe = item.credits?.crew || [];

      function nomesPorFuncao(funcoes) {
        return [...new Set(
          equipe
            .filter(pessoa => funcoes.includes(pessoa.job))
            .map(pessoa => pessoa.name)
        )];
      }

      const diretores = nomesPorFuncao(["Director"]);

      const roteiristas = nomesPorFuncao([
        "Writer",
        "Screenplay",
        "Story",
        "Teleplay",
        "Characters"
      ]);

      const produtores = nomesPorFuncao([
        "Producer",
        "Executive Producer",
        "Co-Producer"
      ]);

      const criadores = (item.created_by || [])
        .map(pessoa => pessoa.name);

      const dataLancamento = type === "movie"
        ? item.release_date
        : item.first_air_date;

      const detalhes = {
        id: item.id,
        name: type === "movie" ? item.title : item.name,
        type,
        poster: item.poster_path
          ? `https://image.tmdb.org/t/p/w500${item.poster_path}`
          : null,
        year: dataLancamento?.slice(0, 4) || null,
        overview: item.overview || "",
        directors: diretores,
        writers: roteiristas,
        producers: produtores,
        creators: criadores,
        awards: null,
        awardsAvailable: false
      };

      return Response.json(detalhes, {
        headers: {
          "Cache-Control": "public, max-age=3600"
        }
      });
    }

    // BUSCAR FILMES OU SÉRIES
    if (!search || search.length > 150) {
      return Response.json(
        { error: "Informe um título válido para pesquisar." },
        { status: 400 }
      );
    }

    parametros.set("query", search);
    parametros.set("include_adult", "false");
    parametros.set("page", "1");

    const resposta = await fetch(
      `https://api.themoviedb.org/3/search/${type}?${parametros}`
    );

    if (!resposta.ok) {
      console.error("Erro TMDB:", resposta.status);

      return Response.json(
        { error: "Não foi possível consultar o catálogo." },
        { status: 502 }
      );
    }

    const dados = await resposta.json();

    const resultados = (dados.results || []).map(item => ({
      id: item.id,
      name: type === "movie"
        ? item.title
        : item.name,
      type,
      poster: item.poster_path
        ? `https://image.tmdb.org/t/p/w342${item.poster_path}`
        : null,
      year: (
        type === "movie"
          ? item.release_date
          : item.first_air_date
      )?.slice(0, 4) || null,
      overview: item.overview || ""
    }));

    return Response.json(resultados, {
      headers: {
        "Cache-Control": "public, max-age=300"
      }
    });

  } catch (error) {
    console.error("Erro na API de mídia:", error);

    return Response.json(
      { error: "Ocorreu um erro ao consultar o catálogo." },
      { status: 500 }
    );
  }
}
