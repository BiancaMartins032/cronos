
export async function onRequestGet({ request, env }) {
  try {
    const url = new URL(request.url);
    const search = url.searchParams.get("search")?.trim();
    const type = url.searchParams.get("type");

    if (!search || search.length > 150) {
      return Response.json(
        { error: "Informe um título válido para pesquisar." },
        { status: 400 }
      );
    }

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
      query: search,
      language: "pt-BR",
      include_adult: "false",
      page: "1"
    });

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
    console.error("Erro na busca TMDB:", error);

    return Response.json(
      { error: "Ocorreu um erro ao pesquisar o catálogo." },
      { status: 500 }
    );
  }
}
