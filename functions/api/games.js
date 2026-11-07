
async function traduzirTexto(texto) {
  if (!texto) return "";

  try {
    const url = new URL("https://api.mymemory.translated.net/get");
    url.searchParams.set("q", texto.slice(0, 4500));
    url.searchParams.set("langpair", "en|pt-BR");

    const resposta = await fetch(url);
    if (!resposta.ok) return texto;

    const dados = await resposta.json();

    return dados.responseStatus === 200
      ? dados.responseData.translatedText
      : texto;
  } catch (erro) {
    console.error("Erro na tradução:", erro);
    return texto;
  }
}

function normalizarNome(nome) {
  return (nome || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function buscarCapaXbox(nomeJogo) {
  try {
        const nome = normalizarNome(nomeJogo);

    if (nome === "batman arkham knight") {
      return "https://store-images.s-microsoft.com/image/apps.30637.69836087516172366.d802940c-fd8a-4174-8a68-e41a2475e1a1.77b11b55-654c-4be3-8804-09728b3a6901?h=270&q=90&w=480";
    }
    const buscaUrl = new URL(
      "https://displaycatalog.mp.microsoft.com/v7.0/productFamilies/autosuggest"
    );

    buscaUrl.searchParams.set("languages", "pt-BR");
    buscaUrl.searchParams.set("market", "BR");
    buscaUrl.searchParams.set("platformdependencyname", "Windows.Xbox");
    buscaUrl.searchParams.set("productFamilyNames", "Games,Apps");
    buscaUrl.searchParams.set("query", nomeJogo);
    buscaUrl.searchParams.set("topProducts", "10");

    const resposta = await fetch(buscaUrl);
    if (!resposta.ok) return null;

    const dados = await resposta.json();

    const produtos = (dados.Results || [])
      .flatMap(resultado => resultado.Products || []);

// Procura primeiro pelo jogo original, evitando DLCs e passes.
    let produto = produtos.find(item =>
      item.ProductId === "BSLX1RNXR6H7"
    );

    if (!produto) {
      produto = produtos.find(item =>
        item.Type === "Game" &&
        item.ProductId &&
        normalizarNome(item.Title) === nome
      );
    }

    if (!produto) return null;

    const detalhesUrl = new URL(
      "https://displaycatalog.mp.microsoft.com/v7.0/products"
    );

    detalhesUrl.searchParams.set("bigIds", produto.ProductId);
    detalhesUrl.searchParams.set("market", "BR");
    detalhesUrl.searchParams.set("languages", "pt-BR");
    detalhesUrl.searchParams.set("fieldsTemplate", "Details");

    const detalhesResposta = await fetch(detalhesUrl);
    if (!detalhesResposta.ok) return null;

    const detalhes = await detalhesResposta.json();
    const completo = detalhes.Products?.[0];

    const imagens = completo?.LocalizedProperties?.[0]?.Images || [];

const imagemPrincipal = imagens.find(img =>
  img.Uri?.includes("77b11b55-654c-4be3-8804-09728b3a6901")
);

if (!imagemPrincipal?.Uri) return null;

return imagemPrincipal.Uri.startsWith("//")
  ? "https:" + imagemPrincipal.Uri
  : imagemPrincipal.Uri;

  } catch (erro) {
    console.error("Erro ao buscar capa Xbox:", nomeJogo, erro);
    return null;
  }
}
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
        { error: "A conexão com o catálogo não está configurada." },
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
        { error: "Não foi possível conectar ao catálogo." },
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
      console.error("Erro IGDB:", await gamesResponse.text());

      return Response.json(
        { error: "Não foi possível consultar os jogos." },
        { status: 502 }
      );
    }

    const games = await gamesResponse.json();

    const jogosComCapas = await Promise.all(
      games.map(async (jogo, indice) => {
        let capaXbox = null;

        // Consulta a Microsoft para os 5 primeiros e para correspondências exatas.
if (
  indice < 5 ||
  normalizarNome(jogo.name) === normalizarNome(search)
) {
  capaXbox = await buscarCapaXbox(jogo.name);

if (normalizarNome(jogo.name) === "batman arkham knight") {
  jogo.testeCapaXbox = capaXbox;
}
}

        return {
          ...jogo,
          cover: capaXbox
            ? { url: capaXbox }
            : jogo.cover,
          summary: await traduzirTexto(jogo.summary)
        };
      })
    );

    return Response.json(jogosComCapas, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=300"
      }
    });

  } catch (error) {
    console.error("Erro na busca:", error);

    return Response.json(
      { error: "Ocorreu um erro ao pesquisar os jogos." },
      { status: 500 }
    );
  }
}
