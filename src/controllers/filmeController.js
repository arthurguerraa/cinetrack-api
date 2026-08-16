const pool = require('../config/database');
const axios = require('axios');

const POSTER_PADRAO = 'https://via.placeholder.com/500x750/1C1C1C/8C8C8C?text=Sem+poster';

/**
 * Consulta o TMDB numa língua específica.
 * Função auxiliar usada pelo fallback de idioma em buscarFilmes.
 */
async function buscarNoTMDB(termo, idioma) {
  const resposta = await axios.get('https://api.themoviedb.org/3/search/movie', {
    params: {
      api_key: process.env.TMDB_API_KEY,
      query: termo,
      language: idioma,
      include_adult: false,
    },
  });
  return resposta.data.results;
}

/**
 * Salva um único filme no banco (ou recupera o id se já existir) e vincula
 * seus gêneros. Isolado numa função própria para poder envolver cada filme
 * em seu próprio try/catch no loop principal — um registro problemático
 * não derruba a busca inteira.
 */
async function salvarFilme(filme) {
  // valores padrão para campos que o TMDB não garante preenchidos —
  // preferimos mostrar o filme com uma lacuna a escondê-lo da busca
  const titulo = filme.title;
  const sinopse = filme.overview || 'Sinopse não disponível.';
  const ano = filme.release_date ? filme.release_date.slice(0, 4) : null;
  const nota = filme.vote_average || 0;
  const poster = filme.poster_path
    ? `https://image.tmdb.org/t/p/w500${filme.poster_path}`
    : POSTER_PADRAO;

  // título e ano são os únicos campos realmente essenciais —
  // sem eles o filme não tem como ser exibido nem identificado de forma única
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

  // vincula os gêneros do filme (usa o genre_ids que o TMDB retorna)
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

  return {
    id_filme: idFilme,
    titulo,
    sinopse,
    ano,
    nota,
    poster,
  };
}

const buscarFilmes = async (req, res) => {
  const { q } = req.query;

  if (!q) {
    return res.status(400).json({ error: 'Informe um termo de busca.' });
  }

  try {
    let filmesTMDB = await buscarNoTMDB(q, 'pt-BR');

    if (filmesTMDB.length === 0) {
      filmesTMDB = await buscarNoTMDB(q, 'en-US');
    }

    // processa cada filme isoladamente — se um registro tiver algum problema
    // inesperado (campo que ainda não previmos), ele é ignorado e registrado
    // no console, mas não derruba a resposta inteira
    const filmesFormatados = [];

    for (const filme of filmesTMDB) {
      try {
        const filmeSalvo = await salvarFilme(filme);
        filmesFormatados.push(filmeSalvo);
      } catch (erroFilme) {
        console.warn(`Filme ignorado na busca "${q}":`, erroFilme.message);
      }
    }

    res.json(filmesFormatados);
  } catch (err) {
    console.error('Erro ao buscar filmes:', err.message);
    res.status(500).json({ error: 'Erro ao buscar filmes.' });
  }
};

// LISTAR FILMES SALVOS NO BANCO, COM FILTRO OPCIONAL DE GÊNERO
const listarFilmes = async (req, res) => {
  const { genero } = req.query;

  try {
    let query = `
      SELECT DISTINCT f.*
      FROM TB_Filme f
    `;
    const params = [];

    if (genero) {
      query += `
        INNER JOIN TB_Filme_Genero fg ON f.id_filme = fg.id_filme
        INNER JOIN TB_Genero g ON fg.id_genero = g.id_genero
        WHERE g.nm_genero = ?
      `;
      params.push(genero);
    }

    query += ' ORDER BY f.nm_filme';

    const [filmes] = await pool.query(query, params);

    res.json(filmes);
  } catch (err) {
    console.error('Erro ao listar filmes:', err.message);
    res.status(500).json({ error: 'Erro ao listar filmes.' });
  }
};

module.exports = { buscarFilmes, listarFilmes };