const axios = require('axios');
const { salvarFilme } = require('./filmeController');
const { calcularNotaCombinada, buscarAvaliacoesLocais } = require('../services/notaService');

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

    // média e total de avaliações locais de todos os filmes, numa única query
    const avaliacoesPorFilme = await buscarAvaliacoesLocais(filmesComId.map((f) => f.id_filme));

    const ranking = filmesComId.map((filme) => {
      const { media, total } = avaliacoesPorFilme.get(filme.id_filme) || { media: 0, total: 0 };

      return {
        id_filme: filme.id_filme,
        titulo: filme.titulo,
        poster: filme.poster,
        ano: filme.ano,
        nota_combinada: calcularNotaCombinada({
          mediaLocal: media,
          totalLocal: total,
          notaTmdb: filme.notaTmdbAoVivo,
        }),
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