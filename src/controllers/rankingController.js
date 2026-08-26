const pool = require('../config/database');
const axios = require('axios');
const { salvarFilme } = require('./filmeController');

// Quantidade "de referência" de avaliações do CineTrack necessária para que
// a nota da comunidade pese tanto quanto a nota que já vem do TMDB.
const PESO_MINIMO_AVALIACOES = 5;

const TMDB_API_URL = 'https://api.themoviedb.org/3';

/**
 * Busca os filmes mais bem avaliados de todos os tempos, segundo o TMDB —
 * não depende de nada que já tenha sido pesquisado antes no CineTrack.
 */
async function buscarTopRatedTMDB(paginasNecessarias) {
  const todos = [];

  for (let pagina = 1; pagina <= paginasNecessarias; pagina++) {
    const resposta = await axios.get(`${TMDB_API_URL}/movie/top_rated`, {
      params: {
        api_key: process.env.TMDB_API_KEY,
        language: 'pt-BR',
        page: pagina,
      },
    });
    todos.push(...resposta.data.results);
  }

  return todos;
}

const verRanking = async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 10, 50);

  try {
    // o TMDB retorna 20 filmes por página — busca páginas suficientes
    const paginasNecessarias = Math.ceil(limit / 20);
    const filmesTMDB = await buscarTopRatedTMDB(paginasNecessarias);

    // salva cada filme localmente (ou recupera o id se já existir), para
    // poder cruzar com as avaliações da comunidade CineTrack
    const filmesComId = [];
    for (const filme of filmesTMDB.slice(0, limit)) {
      try {
        const salvo = await salvarFilme(filme);
        filmesComId.push({ ...salvo, notaTmdbAoVivo: filme.vote_average || 0 });
      } catch (erroFilme) {
        console.warn('Filme ignorado no ranking:', erroFilme.message);
      }
    }

    const ids = filmesComId.map((f) => f.id_filme);

    // busca, numa única query, a média e o total de avaliações locais de
    // todos os filmes de uma vez — evita fazer uma consulta por filme
    let avaliacoesPorFilme = {};
    if (ids.length > 0) {
      const [linhas] = await pool.query(
        `SELECT id_filme, AVG(nr_nota) AS media, COUNT(*) AS total
         FROM TB_Avaliacao
         WHERE id_filme IN (?)
         GROUP BY id_filme`,
        [ids]
      );
      avaliacoesPorFilme = Object.fromEntries(
        linhas.map((l) => [l.id_filme, { media: parseFloat(l.media), total: l.total }])
      );
    }

    const ranking = filmesComId.map((filme) => {
      const dadosLocais = avaliacoesPorFilme[filme.id_filme] || { media: 0, total: 0 };
      const { media, total } = dadosLocais;

      const notaCombinada =
        (total / (total + PESO_MINIMO_AVALIACOES)) * media +
        (PESO_MINIMO_AVALIACOES / (total + PESO_MINIMO_AVALIACOES)) * filme.notaTmdbAoVivo;

      return {
        id_filme: filme.id_filme,
        titulo: filme.titulo,
        poster: filme.poster,
        ano: filme.ano,
        nota_combinada: notaCombinada,
        total_avaliacoes: total,
      };
    });

    ranking.sort(
      (a, b) => b.nota_combinada - a.nota_combinada || b.total_avaliacoes - a.total_avaliacoes
    );

    res.json(ranking);
  } catch (err) {
    console.error('Erro ao buscar ranking:', err.message);
    res.status(500).json({ error: 'Erro ao buscar ranking.' });
  }
};

module.exports = { verRanking };