const pool = require('../config/database');
const axios = require('axios');

const buscarFilmes = async (req, res) => {
  const { q } = req.query; // termo de busca, ex: ?q=batman

  if (!q) {
    return res.status(400).json({ error: 'Informe um termo de busca.' });
  }

  try {
    // 1. busca no TMDB
    const resposta = await axios.get('https://api.themoviedb.org/3/search/movie', {
      params: {
        api_key: process.env.TMDB_API_KEY,
        query: q,
        language: 'pt-BR',
      },
    });

    const filmesTMDB = resposta.data.results;

    // 2. salva cada filme no banco (se ainda não existir)
    for (const filme of filmesTMDB) {
      const [existe] = await pool.query(
        'SELECT id_filme FROM TB_Filme WHERE nm_filme = ? AND dt_lancamento = ?',
        [filme.title, filme.release_date ? filme.release_date.slice(0, 4) : null]
      );

      if (existe.length === 0) {
        await pool.query(
          `INSERT INTO TB_Filme (nm_filme, ds_sinopse, dt_lancamento, nr_nota_media, ds_poster)
           VALUES (?, ?, ?, ?, ?)`,
          [
            filme.title,
            filme.overview || 'Sinopse não disponível.',
            filme.release_date ? filme.release_date.slice(0, 4) : null,
            filme.vote_average || 0,
            filme.poster_path ? `https://image.tmdb.org/t/p/w500${filme.poster_path}` : null,
          ]
        );
      }
    }

    // 3. retorna os filmes formatados pro frontend
    const filmesFormatados = filmesTMDB.map(filme => ({
      titulo: filme.title,
      sinopse: filme.overview,
      ano: filme.release_date ? filme.release_date.slice(0, 4) : null,
      nota: filme.vote_average,
      poster: filme.poster_path ? `https://image.tmdb.org/t/p/w500${filme.poster_path}` : null,
    }));

    res.json(filmesFormatados);
  } catch (err) {
    console.error('Erro ao buscar filmes:', err.message);
    res.status(500).json({ error: 'Erro ao buscar filmes.' });
  }
};

module.exports = { buscarFilmes };