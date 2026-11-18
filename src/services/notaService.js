const pool = require('../config/database');

// Quantidade "de referência" de avaliações do CineTrack para a nota da comunidade pesar
// tanto quanto a nota do TMDB (com 10 avaliações locais, cada lado vale 50%).
// É o único lugar onde esse valor existe: ranking, home e listas usam este módulo.
const PESO_MINIMO_AVALIACOES = 10;

/**
 * Média bayesiana entre a nota do TMDB e a média das avaliações do CineTrack:
 *   (total / (total + PESO)) × mediaLocal + (PESO / (total + PESO)) × notaTmdb
 * Casos especiais:
 *   - sem avaliações locais: nota do TMDB pura;
 *   - TMDB sem votos (nota 0): média local pura. Misturar com 0 puxaria a nota para baixo
 *     por um dado que não existe.
 */
function calcularNotaCombinada({ mediaLocal, totalLocal, notaTmdb }) {
  const total = Number(totalLocal) || 0;
  const media = Number(mediaLocal) || 0;
  const tmdb = Number(notaTmdb) || 0;

  if (total === 0) return tmdb;
  if (tmdb === 0) return media;

  return (
    (total / (total + PESO_MINIMO_AVALIACOES)) * media +
    (PESO_MINIMO_AVALIACOES / (total + PESO_MINIMO_AVALIACOES)) * tmdb
  );
}

/**
 * Média e total de avaliações do CineTrack para vários filmes, em uma única consulta.
 * Devolve um Map: id_filme -> { media, total }.
 */
async function buscarAvaliacoesLocais(ids) {
  const mapa = new Map();
  if (!ids || ids.length === 0) return mapa;

  const [linhas] = await pool.query(
    `SELECT id_filme, AVG(nr_nota) AS media, COUNT(*) AS total
     FROM TB_Avaliacao
     WHERE id_filme IN (?)
     GROUP BY id_filme`,
    [ids]
  );

  linhas.forEach((l) => mapa.set(l.id_filme, { media: parseFloat(l.media), total: Number(l.total) }));
  return mapa;
}

/**
 * Acrescenta nota_combinada (2 casas decimais) e total_avaliacoes a cada filme.
 * @param {Object[]} filmes - cada filme precisa ter id_filme
 * @param {string} campoNotaTmdb - nome do campo que guarda a nota do TMDB (ex.: 'nota')
 * Se a consulta local falhar, devolve as notas do TMDB sem derrubar a listagem.
 */
async function anexarNotaCombinada(filmes, campoNotaTmdb) {
  let locais = new Map();

  try {
    locais = await buscarAvaliacoesLocais(filmes.map((f) => f.id_filme));
  } catch (err) {
    console.error('Erro ao buscar avaliações locais:', err.message);
  }

  return filmes.map((filme) => {
    const local = locais.get(filme.id_filme) || { media: 0, total: 0 };
    const combinada = calcularNotaCombinada({
      mediaLocal: local.media,
      totalLocal: local.total,
      notaTmdb: filme[campoNotaTmdb],
    });

    return {
      ...filme,
      nota_combinada: Math.round(combinada * 100) / 100,
      total_avaliacoes: local.total,
    };
  });
}

module.exports = {
  PESO_MINIMO_AVALIACOES,
  calcularNotaCombinada,
  buscarAvaliacoesLocais,
  anexarNotaCombinada,
};