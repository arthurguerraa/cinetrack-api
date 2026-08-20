const pool = require('../config/database');
const axios = require('axios');

const POSTER_PADRAO = 'https://via.placeholder.com/500x750/1C1C1C/8C8C8C?text=Sem+poster';
const TMDB_API_URL = 'https://api.themoviedb.org/3';

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
    'SELECT id_filme FROM TB_Filme WHERE nm_filme = ? AND dt_lancamento = ?',
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
 * Um filme com problema é ignorado sem derrubar os outros.
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
 * Monta a resposta padrão { data, pagination } a partir do retorno do TMDB,
 * usado pelos três endpoints (populares, gênero, busca) para manter o
 * mesmo formato que o frontend já espera.
 */
function formatarResposta(dadosTMDB, filmesSalvos) {
  return {
    data: filmesSalvos,
    pagination: {
      page: dadosTMDB.page,
      totalPages: Math.min(dadosTMDB.total_pages, 500), // limite do próprio TMDB
      hasNext: dadosTMDB.page < Math.min(dadosTMDB.total_pages, 500),
      hasPrev: dadosTMDB.page > 1,
    },
  };
}

function obterPagina(req) {
  const pagina = parseInt(req.query.page) || 1;
  return Math.min(Math.max(pagina, 1), 500);
}

// ----------------------------------------
// GET /filmes/populares — estado padrão da home, sem busca nem filtro
// ----------------------------------------
const listarPopulares = async (req, res) => {
  const page = obterPagina(req);

  try {
    const dadosTMDB = await chamarTMDB('/trending/movie/week', { page });
    const filmesSalvos = await processarLista(dadosTMDB.results);
    res.json(formatarResposta(dadosTMDB, filmesSalvos));
  } catch (err) {
    console.error('Erro ao listar populares:', err.message);
    res.status(500).json({ error: 'Erro ao carregar filmes populares.' });
  }
};

// ----------------------------------------
// GET /filmes/genero?nome=Ação — filtro de gênero, também direto do TMDB
// ----------------------------------------
const listarPorGenero = async (req, res) => {
  const { nome } = req.query;
  const page = obterPagina(req);

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

    const dadosTMDB = await chamarTMDB('/discover/movie', {
      with_genres: generoRows[0].id_tmdb,
      sort_by: 'popularity.desc',
      page,
    });

    const filmesSalvos = await processarLista(dadosTMDB.results);
    res.json(formatarResposta(dadosTMDB, filmesSalvos));
  } catch (err) {
    console.error('Erro ao listar por gênero:', err.message);
    res.status(500).json({ error: 'Erro ao carregar filmes desse gênero.' });
  }
};

// ----------------------------------------
// GET /filmes/buscar?q=&page= — busca por termo
// ----------------------------------------
const buscarFilmes = async (req, res) => {
  const { q } = req.query;
  const page = obterPagina(req);

  if (!q) {
    return res.status(400).json({ error: 'Informe um termo de busca.' });
  }

  try {
    let dadosTMDB = await chamarTMDB('/search/movie', { query: q, page, language: 'pt-BR' });

    // fallback: se não achou nada em português, tenta em inglês
    if (dadosTMDB.results.length === 0) {
      dadosTMDB = await chamarTMDB('/search/movie', { query: q, page, language: 'en-US' });
    }

    const filmesSalvos = await processarLista(dadosTMDB.results);
    res.json(formatarResposta(dadosTMDB, filmesSalvos));
  } catch (err) {
    console.error('Erro ao buscar filmes:', err.message);
    res.status(500).json({ error: 'Erro ao buscar filmes.' });
  }
};

module.exports = { listarPopulares, listarPorGenero, buscarFilmes, salvarFilme };