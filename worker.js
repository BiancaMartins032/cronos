
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

        const livrosOpenLibrary = [];
        // 2. Tenta consultar primeiro a Open Library
        try {
          const parametros = new URLSearchParams({
            q: `author:"${autor}"`,
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
  "language"
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

         livrosOpenLibrary.push(...(dados.docs || []));

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

        try {
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

          } catch (erroGoogle) {
  console.error("Google Books indisponível:", erroGoogle);
}
        // 4. Combina os resultados das duas fontes
const todosLivros = [
  ...livrosOpenLibrary,
  ...livros
];

const chavesVistas = new Set();

const livrosCombinados = todosLivros.filter(livro => {
  if (!livro.key || chavesVistas.has(livro.key)) {
    return false;
  }

  chavesVistas.add(livro.key);
  return true;
});

const dadosAlternativos = {
  numFound: livrosCombinados.length,
  docs: livrosCombinados
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

    
        // API — informações biográficas dos autores
    
if (url.pathname === "/api/openlibrary/author" && request.method === "GET") {
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
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // Converte datas para um formato que o HTML consegue interpretar.
  function normalizarData(valor) {
    if (!valor) return "";

    const iso = valor.match(/^[+-]?(\d{4})-(\d{2})-(\d{2})/);

    if (iso) {
      const ano = iso[1];
      const mes = iso[2];
      const dia = iso[3];

      if (mes === "00" || dia === "00") return ano;

      return `${ano}-${mes}-${dia}`;
    }

    const inglesa = valor.match(
      /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/
    );

    if (inglesa) {
      const meses = {
        january: "01",
        february: "02",
        march: "03",
        april: "04",
        may: "05",
        june: "06",
        july: "07",
        august: "08",
        september: "09",
        october: "10",
        november: "11",
        december: "12"
      };

      const mes = meses[inglesa[2].toLowerCase()];

      if (mes) {
        return `${inglesa[3]}-${mes}-${inglesa[1].padStart(2, "0")}`;
      }
    }

    if (/^\d{4}$/.test(valor)) return valor;

    return "";
  }

  const nomeNormalizado = normalizar(nome);

const ehRJPalacio = [
  normalizar("R. J. Palacio"),
  normalizar("Raquel Jaramillo Palacio"),
  normalizar("Raquel Jaramillo")
].includes(nomeNormalizado);

  let fotoAutor = "";
  let nascimento = "";
  let falecimento = "";
  let naturalidade = "";
  let resumo = "";
  let nomeCompleto = nome;
  let nomeConhecido = nome;

  const fontes = {
    openLibrary: "não consultada",
    wikipedia: "não consultada",
    wikidata: "não consultada"
  };

  // 1. Open Library — nascimento e foto
try {
  if (ehRJPalacio) {
    const resposta = await fetch(
      "https://openlibrary.org/authors/OL6995566A.json",
      {
        headers: {
          "User-Agent": "Cronos/1.0"
        }
      }
    );

    if (!resposta.ok) {
      throw new Error("HTTP " + resposta.status);
    }

    const dadosAutor = await resposta.json();

    nascimento = normalizarData(dadosAutor.birth_date);
    nomeConhecido = "R. J. Palacio";
    nomeCompleto = "Raquel Jaramillo Palacio";
    fotoAutor = "https://covers.openlibrary.org/a/olid/OL6995566A-L.jpg";

    fontes.openLibrary = "encontrado pelo identificador do autor";

  } else {
    const resposta = await fetch(
      "https://openlibrary.org/search/authors.json?q=" +
      encodeURIComponent(nome),
      {
        headers: {
          "User-Agent": "Cronos/1.0"
        }
      }
    );

    if (!resposta.ok) {
      throw new Error("HTTP " + resposta.status);
    }

    const dados = await resposta.json();
    const autores = dados.docs || [];

    const encontrado = autores.find(item =>
      normalizar(item.name) === nomeNormalizado ||
      normalizar(item.personal_name) === nomeNormalizado ||
      (item.alternate_names || []).some(alternativo =>
        normalizar(alternativo) === nomeNormalizado
      )
    );

    if (encontrado) {
      nascimento = normalizarData(encontrado.birth_date);
      nomeConhecido = encontrado.name || nome;
      nomeCompleto = encontrado.personal_name || encontrado.name || nome;

      fontes.openLibrary = nascimento
        ? "encontrado"
        : "autor encontrado, nascimento indisponível";
    } else {
      fontes.openLibrary = "autor não encontrado";
    }
  }

} catch (erro) {
  fontes.openLibrary = "erro: " + erro.message;
  console.warn("Open Library:", erro);
}
  // 2. Wikipédia — informações sobre a carreira
  try {
    const parametros = new URLSearchParams({
      action: "query",
      titles: ehRJPalacio ? "R. J. Palacio" : nome,
      redirects: "1",
      prop: "extracts",
      exintro: "1",
      explaintext: "1",
      exchars: "3000",
      format: "json",
      formatversion: "2"
    });

    const resposta = await fetch(
      "https://pt.wikipedia.org/w/api.php?" +
      parametros.toString(),
      {
        headers: {
          "User-Agent": "Cronos/1.0"
        }
      }
    );

    if (!resposta.ok) {
      throw new Error("HTTP " + resposta.status);
    }

    const dados = await resposta.json();
    const paginas = dados.query?.pages || [];

    const pagina = paginas.find(item =>
      !item.missing && item.extract
    );

    if (pagina) {
  nomeConhecido = pagina.title || nomeConhecido;

  const texto = pagina.extract
        .replace(/\s+/g, " ")
        .trim();

      // Remove dados pessoais e mantém o foco na carreira literária.
const frases = texto
  .split(/(?<=[.!?])\s+/);

const nomesParaRemover = [
  nomeCompleto,
  nomeConhecido,
  nome
].filter(Boolean).sort((a, b) => b.length - a.length);

const frasesCarreira = frases.map(frase => {
  let limpa = frase.replace(
    /\([^)]*(?:18|19|20)\d{2}[^)]*\)/g,
    ""
  ).trim();

  for (const nomeAutor of nomesParaRemover) {
    const escapado = nomeAutor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    limpa = limpa.replace(
      new RegExp("^" + escapado + "\\s*", "i"),
      ""
    );
  }

  return limpa;
}).filter(frase => {
  return frase &&
    !/\b(nasceu|nascimento|falecido|falecimento|natural de|naturalidade)\b/i.test(frase);
});

resumo = frasesCarreira
  .slice(0, 3)
  .join(" ")
  .replace(/^./, letra => letra.toUpperCase())
  .slice(0, 700);

      fontes.wikipedia = "encontrado";
    } else {
      fontes.wikipedia = "página não encontrada";
    }

  } catch (erro) {
    fontes.wikipedia = "erro: " + erro.message;
    console.warn("Wikipédia:", erro);
  }

  // 3. Wikidata — nascimento, falecimento e naturalidade
  try {
    const parametros = new URLSearchParams({
      action: "wbsearchentities",
      search: nomeConhecido || nome,
      language: "pt",
      uselang: "pt",
      type: "item",
      limit: "10",
      format: "json"
    });

    const resposta = await fetch(
      "https://www.wikidata.org/w/api.php?" +
      parametros.toString(),
      {
        headers: {
          "User-Agent": "Cronos/1.0"
        }
      }
    );

    if (!resposta.ok) {
      throw new Error("HTTP " + resposta.status);
    }

    const dados = await resposta.json();
    const entidades = dados.search || [];

    const entidade = ehRJPalacio
  ? { id: "Q2123852" }
  : entidades.find(item =>
      normalizar(item.label) === normalizar(nomeConhecido) ||
      normalizar(item.label) === nomeNormalizado ||
      normalizar(item.label) === normalizar(nomeCompleto)
    );

    if (!entidade) {
      fontes.wikidata = "autor não encontrado";
    } else {
      const respostaDados = await fetch(
        "https://www.wikidata.org/w/api.php?" +
        new URLSearchParams({
          action: "wbgetentities",
          ids: entidade.id,
          props: "claims",
          format: "json"
        }).toString(),
        {
          headers: {
            "User-Agent": "Cronos/1.0"
          }
        }
      );

      if (!respostaDados.ok) {
        throw new Error("HTTP " + respostaDados.status);
      }

      const dadosEntidade = await respostaDados.json();

      const claims =
        dadosEntidade.entities?.[entidade.id]?.claims || {};

      // Nascimento
      const valorNascimento =
        claims.P569?.[0]?.mainsnak?.datavalue?.value?.time;

      if (valorNascimento) {
        nascimento = normalizarData(valorNascimento);
      }

      // Falecimento
      const valorFalecimento =
        claims.P570?.[0]?.mainsnak?.datavalue?.value?.time;

      if (valorFalecimento) {
        falecimento = normalizarData(valorFalecimento);
      }

     // Naturalidade: cidade e país
const idNaturalidade =
  claims.P19?.[0]?.mainsnak?.datavalue?.value?.id;

if (idNaturalidade) {
  const respostaLocal = await fetch(
    "https://www.wikidata.org/w/api.php?" +
    new URLSearchParams({
      action: "wbgetentities",
      ids: idNaturalidade,
      props: "labels|claims",
      languages: "pt|en",
      format: "json"
    }).toString(),
    {
      headers: {
        "User-Agent": "Cronos/1.0"
      }
    }
  );

  if (respostaLocal.ok) {
    const dadosLocal = await respostaLocal.json();
    const local = dadosLocal.entities?.[idNaturalidade];

    const cidade =
      local?.labels?.pt?.value ||
      local?.labels?.en?.value ||
      "";

    const idPais =
      local?.claims?.P17?.[0]?.mainsnak?.datavalue?.value?.id;

    let pais = "";

    if (idPais) {
      const respostaPais = await fetch(
        "https://www.wikidata.org/w/api.php?" +
        new URLSearchParams({
          action: "wbgetentities",
          ids: idPais,
          props: "labels",
          languages: "pt|en",
          format: "json"
        }).toString(),
        {
          headers: {
            "User-Agent": "Cronos/1.0"
          }
        }
      );

      if (respostaPais.ok) {
        const dadosPais = await respostaPais.json();
        const entidadePais = dadosPais.entities?.[idPais];

        pais =
          entidadePais?.labels?.pt?.value ||
          entidadePais?.labels?.en?.value ||
          "";
      }
    }

    naturalidade = cidade && pais
      ? cidade + ", " + pais
      : cidade || pais;
  }
}

          // Biografia específica de Cecília Meireles
      if (
        normalizar(nome).includes("cecilia") &&
        normalizar(nome).includes("meireles")
      ) {
        resumo =
          `${nomeCompleto} foi uma escritora, poeta, jornalista e professora brasileira. ` +
          `Publicou seu primeiro livro, Espectros, em 1919. ` +
          `Em 1939, publicou Viagem, obra importante para o reconhecimento de sua poesia. ` +
          `Sua obra mais conhecida é Romanceiro da Inconfidência, publicada em 1953, ` +
          `na qual retrata poeticamente episódios da Inconfidência Mineira. ` +
                    `Também se destacou na literatura infantil com Ou isto ou aquilo.`;
      }
    }

    } catch (erro) {
      fontes.wikidata = "erro: " + erro.message;
      console.warn("Wikidata:", erro);
    }

  // Biografia específica de R. J. Palacio
if (ehRJPalacio) {
  resumo =
    "Raquel Jaramillo Palacio, conhecida como R. J. Palacio, " +
    "é uma escritora e designer gráfica americana. " +
    "Alcançou reconhecimento internacional com seu romance de estreia, " +
    "Extraordinário (Wonder), publicado em 2012. " +
    "Também escreveu Auggie & Eu, Somos Todos Extraordinários, " +
    "Pássaro Branco e Uma Jornada Sem Fim.";
}

return Response.json({
  name: nome,
  display_name: nomeConhecido,
  full_name: nomeCompleto,
  birth_date: nascimento,
  death_date: falecimento,
  location: naturalidade,
  photo_url: fotoAutor,
  resumo: resumo,
  bio: resumo,
  fontes
});
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
