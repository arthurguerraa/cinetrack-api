const pool = require('../config/database');
const axios = require('axios');

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

const buscarFilmes = async (req, res) => {
  const { q } = req.query; // termo de busca, ex: ?q=batman

  if (!q) {
    return res.status(400).json({ error: 'Informe um termo de busca.' });
  }

  try {
    // 1. busca primeiro em português — é a língua padrão do projeto
    let filmesTMDB = await buscarNoTMDB(q, 'pt-BR');

    // 2. se não encontrou nada, tenta de novo em inglês antes de desistir
    if (filmesTMDB.length === 0) {
      filmesTMDB = await buscarNoTMDB(q, 'en-US');
    }

    // 3. filtra resultados incompletos — o TMDB às vezes retorna itens sem
    //    data de lançamento ou sem poster (registros incompletos, filmes ainda
    //    não confirmados), e nossa tabela exige essas colunas. Melhor não
    //    mostrar do que quebrar.
    filmesTMDB = filmesTMDB.filter((filme) => filme.title && filme.release_date && filme.poster_path);

    // 4. salva cada filme no banco (se ainda não existir), vincula gêneros
    //    e guarda o id_filme de cada um numa lista paralela pra devolver na resposta
    const idsFilmes = [];

    for (const filme of filmesTMDB) {
      const anoLancamento = filme.release_date.slice(0, 4);

      const [existe] = await pool.query(
        'SELECT id_filme FROM TB_Filme WHERE nm_filme = ? AND dt_lancamento = ?',
        [filme.title, anoLancamento]
      );

      let idFilme;

      if (existe.length === 0) {
        const [resultado] = await pool.query(
          `INSERT INTO TB_Filme (nm_filme, ds_sinopse, dt_lancamento, nr_nota_media, ds_poster)
           VALUES (?, ?, ?, ?, ?)`,
          [
            filme.title,
            filme.overview || 'Sinopse não disponível.',
            anoLancamento,
            filme.vote_average || 0,
            filme.poster_path ? `https://image.tmdb.org/t/p/w500${filme.poster_path}` : null,
          ]
        );
        idFilme = resultado.insertId;
      } else {
        idFilme = existe[0].id_filme;
      }

      idsFilmes.push(idFilme);

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
    }

    // 5. retorna os filmes formatados pro frontend, agora incluindo id_filme
    const filmesFormatados = filmesTMDB.map((filme, index) => ({
      id_filme: idsFilmes[index],
      titulo: filme.title,
      sinopse: filme.overview,
      ano: filme.release_date.slice(0, 4),
      nota: filme.vote_average,
      poster: filme.poster_path ? `https://image.tmdb.org/t/p/w500${filme.poster_path}` : null,
    }));

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