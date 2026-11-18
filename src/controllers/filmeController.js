const pool = require('../config/database');
const axios = require('axios');

const POSTER_PADRAO = 'https://via.placeholder.com/500x750/1C1C1C/8C8C8C?text=Sem+poster';
const TMDB_API_URL = 'https://api.themoviedb.org/3';

// ----------------------------------------
// Ordenação
// ----------------------------------------
const ORDENS_VALIDAS = ['maior_nota', 'menor_nota', 'lancamento_recentes', 'lancamento_antigos', 'titulo'];

// Ordenações que o /discover do TMDB faz em TODOS os filmes (não só na página atual)
const SORT_DISCOVER = {
  maior_nota: 'vote_average.desc',
  menor_nota: 'vote_average.asc',
  lancamento_recentes: 'primary_release_date.desc',
  lancamento_antigos: 'primary_release_date.asc',
};

// Mínimo de votos exigido na ordenação global. Sem isso, filmes obscuros com um único voto
// 10 (ou 1) dominariam as listas de nota; nas de lançamento, o corte tira filmes sem dados.
const MIN_VOTOS_DISCOVER = {
  maior_nota: 200,
  menor_nota: 200,
  lancamento_recentes: 5,
  lancamento_antigos: 5,
};

function obterOrdem(req) {
  return ORDENS_VALIDAS.includes(req.query.ordem) ? req.query.ordem : 'padrao';
}

function parametrosDiscoverOrdenado(ordem) {
  return {
    sort_by: SORT_DISCOVER[ordem],
    'vote_count.gte': MIN_VOTOS_DISCOVER[ordem],
    'release_date.lte': dataDeHoje(),
  };
}

/**
 * Ordena só os filmes da página atual. Valores ausentes (nota 0, sem data) ficam no fim,
 * em qualquer direção — mesmo comportamento das listas do usuário.
 */
function ordenarPagina(filmesTMDB, ordem) {
  const nulosPorUltimo = (valor, direcao) => (a, b) => {
    const va = valor(a);
    const vb = valor(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    return (va - vb) * direcao;
  };

  const nota = (f) => (f.vote_average > 0 ? f.vote_average : null);
  const data = (f) => (f.release_date ? Date.parse(f.release_date) : null);

  const comparadores = {
    maior_nota: nulosPorUltimo(nota, -1),
    menor_nota: nulosPorUltimo(nota, 1),
    lancamento_recentes: nulosPorUltimo(data, -1),
    lancamento_antigos: nulosPorUltimo(data, 1),
    titulo: (a, b) =>
      String(a.title || '').localeCompare(String(b.title || ''), 'pt-BR', { sensitivity: 'base' }),
  };

  const comparar = comparadores[ordem];
  return comparar ? [...filmesTMDB].sort(comparar) : filmesTMDB;
}

// Quando só existe uma página de resultados, ordenar a página já é ordenar tudo.
function escopoDaPagina(dadosTMDB) {
  return dadosTMDB.total_pages > 1 ? 'pagina' : 'global';
}

/**
 * Data de hoje no formato AAAA-MM-DD, no fuso do Brasil. Usar o fuso certo evita que
 * um filme que estreia hoje some no fim da tarde, quando o UTC já virou o dia.
 * O formato 'en-CA' do Intl já devolve AAAA-MM-DD.
 */
function dataDeHoje() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

/**
 * Mantém só filmes já lançados (release_date até hoje). Filmes sem data também saem,
 * porque não há como saber se já estrearam. Como as datas são ISO (AAAA-MM-DD),
 * a comparação de texto funciona direto.
 */
function apenasLancados(filmesTMDB) {
  const hoje = dataDeHoje();
  return filmesTMDB.filter((filme) => filme.release_date && filme.release_date <= hoje);
}

/**
 * Consulta o TMDB numa língua/página específica.
 * Retorna a resposta completa do TMDB (não só os resultados), porque
 * precisamos dos campos de paginação (page, total_pages) para devolver
 * ao frontend.
 */
async function chamarTMDB(caminho, parametrosExtras = {}) {
  const resposta = await axios.get(`${TMDB_API_URL}${caminho}`, {
    params: {
      api_key: process.env.TMDB_API_KEY,
      language: 'pt-BR',
      include_adult: false,
      ...parametrosExtras,
    },
  });
  return resposta.data;
}

/**
 * Salva um único filme no banco (ou recupera o id se já existir) e vincula
 * seus gêneros. O banco funciona só como cache de apoio — nunca é a fonte
 * de exibição da home, só o que garante que id_filme existe para permitir
 * avaliações e listas.
 */
async function salvarFilme(filme) {
  const titulo = filme.title;
  const sinopse = filme.overview || 'Sinopse não disponível.';
  const ano = filme.release_date ? filme.release_date.slice(0, 4) : null;
  const nota = filme.vote_average || 0;
  const poster = filme.poster_path
    ? `https://image.tmdb.org/t/p/w500${filme.poster_path}`
    : POSTER_PADRAO;

  if (!titulo || !ano) {
    throw new Error(`Filme sem título ou ano de lançamento: "${titulo || 'desconhecido'}"`);
  }

  const [existe] = await pool.query(
    'SELECT id_filme, nr_nota_media FROM TB_Filme WHERE nm_filme = ? AND dt_lancamento = ?',
    [titulo, ano]
  );

  let idFilme;

  if (existe.length === 0) {
    const [resultado] = await pool.query(
      `INSERT INTO TB_Filme (nm_filme, ds_sinopse, dt_lancamento, nr_nota_media, ds_poster)
       VALUES (?, ?, ?, ?, ?)`,
      [titulo, sinopse, ano, nota, poster]
    );
    idFilme = resultado.insertId;
  } else {
    idFilme = existe[0].id_filme;

    // Atualiza a nota guardada quando o TMDB trouxer uma diferente (e válida).
    // Sem isso, um filme salvo com nota 0 antes de estrear ou de receber votos
    // ficaria com 0 para sempre nas listas, que leem a nota do banco.
    const notaArredondada = Math.round(nota * 10) / 10;
    if (notaArredondada > 0 && Number(existe[0].nr_nota_media) !== notaArredondada) {
      await pool.query(
        'UPDATE TB_Filme SET nr_nota_media = ? WHERE id_filme = ?',
        [notaArredondada, idFilme]
      );
    }
  }

  if (filme.genre_ids && filme.genre_ids.length > 0) {
    for (const idTmdb of filme.genre_ids) {
      const [genero] = await pool.query(
        'SELECT id_genero FROM TB_Genero WHERE id_tmdb = ?',
        [idTmdb]
      );

      if (genero.length > 0) {
        const idGenero = genero[0].id_genero;

        const [jaVinculado] = await pool.query(
          'SELECT * FROM TB_Filme_Genero WHERE id_filme = ? AND id_genero = ?',
          [idFilme, idGenero]
        );

        if (jaVinculado.length === 0) {
          await pool.query(
            'INSERT INTO TB_Filme_Genero (id_filme, id_genero) VALUES (?, ?)',
            [idFilme, idGenero]
          );
        }
      }
    }
  }

  return { id_filme: idFilme, titulo, sinopse, ano, nota, poster };
}

/**
 * Processa uma lista de filmes vinda do TMDB, salvando cada um isoladamente.
 * Um filme com problema é ignorado sem derrubar os outros. A ordem da lista
 * recebida é preservada.
 */
async function processarLista(filmesTMDB) {
  const resultado = [];
  for (const filme of filmesTMDB) {
    try {
      resultado.push(await salvarFilme(filme));
    } catch (erroFilme) {
      console.warn('Filme ignorado:', erroFilme.message);
    }
  }
  return resultado;
}

/**
 * Monta a resposta padrão { data, pagination, ordenacao } a partir do retorno do TMDB,
 * usado pelos três endpoints (populares, gênero, busca).
 * ordenacao: 'padrao' (sem ordem escolhida), 'global' (todos os filmes) ou
 * 'pagina' (só os filmes da página atual — o frontend avisa o usuário).
 */
function formatarResposta(dadosTMDB, filmesSalvos, ordenacao = 'padrao') {
  return {
    data: filmesSalvos,
    pagination: {
      page: dadosTMDB.page,
      totalPages: Math.min(dadosTMDB.total_pages, 500), // limite do próprio TMDB
      hasNext: dadosTMDB.page < Math.min(dadosTMDB.total_pages, 500),
      hasPrev: dadosTMDB.page > 1,
    },
    ordenacao,
  };
}

function obterPagina(req) {
  const pagina = parseInt(req.query.page) || 1;
  return Math.min(Math.max(pagina, 1), 500);
}

// ----------------------------------------
// GET /filmes/populares?page=&ordem= — estado padrão da home, sem busca nem filtro
// Sem ordem: em alta na semana (trending). Com nota/lançamento: /discover (ordem global).
// ----------------------------------------
const listarPopulares = async (req, res) => {
  const page = obterPagina(req);
  const ordem = obterOrdem(req);

  try {
    let dadosTMDB;
    let lancados;
    let ordenacao = 'padrao';

    if (SORT_DISCOVER[ordem]) {
      dadosTMDB = await chamarTMDB('/discover/movie', { ...parametrosDiscoverOrdenado(ordem), page });
      lancados = apenasLancados(dadosTMDB.results);
      ordenacao = 'global';
    } else {
      dadosTMDB = await chamarTMDB('/trending/movie/week', { page });
      lancados = apenasLancados(dadosTMDB.results);

      if (ordem === 'titulo') {
        lancados = ordenarPagina(lancados, ordem);
        ordenacao = escopoDaPagina(dadosTMDB);
      }
    }

    const filmesSalvos = await processarLista(lancados);
    res.json(formatarResposta(dadosTMDB, filmesSalvos, ordenacao));
  } catch (err) {
    console.error('Erro ao listar populares:', err.message);
    res.status(500).json({ error: 'Erro ao carregar filmes populares.' });
  }
};

// ----------------------------------------
// GET /filmes/genero?nome=Ação&page=&ordem= — filtro de gênero, também direto do TMDB
// ----------------------------------------
const listarPorGenero = async (req, res) => {
  const { nome } = req.query;
  const page = obterPagina(req);
  const ordem = obterOrdem(req);

  if (!nome) {
    return res.status(400).json({ error: 'Informe o nome do gênero.' });
  }

  try {
    const [generoRows] = await pool.query(
      'SELECT id_tmdb FROM TB_Genero WHERE nm_genero = ?',
      [nome]
    );

    if (generoRows.length === 0) {
      return res.status(404).json({ error: 'Gênero não encontrado.' });
    }

    // o discover aceita filtrar por data no próprio TMDB, então a paginação já vem
    // correta; o apenasLancados() depois é só uma segunda garantia
    const parametros = SORT_DISCOVER[ordem]
      ? parametrosDiscoverOrdenado(ordem)
      : { sort_by: 'popularity.desc', 'release_date.lte': dataDeHoje() };

    const dadosTMDB = await chamarTMDB('/discover/movie', {
      with_genres: generoRows[0].id_tmdb,
      ...parametros,
      page,
    });

    let lancados = apenasLancados(dadosTMDB.results);
    let ordenacao = SORT_DISCOVER[ordem] ? 'global' : 'padrao';

    if (ordem === 'titulo') {
      lancados = ordenarPagina(lancados, ordem);
      ordenacao = escopoDaPagina(dadosTMDB);
    }

    const filmesSalvos = await processarLista(lancados);
    res.json(formatarResposta(dadosTMDB, filmesSalvos, ordenacao));
  } catch (err) {
    console.error('Erro ao listar por gênero:', err.message);
    res.status(500).json({ error: 'Erro ao carregar filmes desse gênero.' });
  }
};

// ----------------------------------------
// GET /filmes/buscar?q=&page=&ordem= — busca por termo
// O TMDB não ordena buscas, então a ordem vale só para a página atual.
// ----------------------------------------
const buscarFilmes = async (req, res) => {
  const { q } = req.query;
  const page = obterPagina(req);
  const ordem = obterOrdem(req);

  if (!q) {
    return res.status(400).json({ error: 'Informe um termo de busca.' });
  }

  try {
    let dadosTMDB = await chamarTMDB('/search/movie', { query: q, page, language: 'pt-BR' });
    let lancados = apenasLancados(dadosTMDB.results);

    // fallback: se não sobrou nada em português (nem lançados), tenta em inglês
    if (lancados.length === 0) {
      dadosTMDB = await chamarTMDB('/search/movie', { query: q, page, language: 'en-US' });
      lancados = apenasLancados(dadosTMDB.results);
    }

    let ordenacao = 'padrao';

    if (ordem !== 'padrao') {
      lancados = ordenarPagina(lancados, ordem);
      ordenacao = escopoDaPagina(dadosTMDB);
    }

    const filmesSalvos = await processarLista(lancados);
    res.json(formatarResposta(dadosTMDB, filmesSalvos, ordenacao));
  } catch (err) {
    console.error('Erro ao buscar filmes:', err.message);
    res.status(500).json({ error: 'Erro ao buscar filmes.' });
  }
};

module.exports = { listarPopulares, listarPorGenero, buscarFilmes, salvarFilme };