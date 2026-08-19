// ========================================
// src/scripts/seedFilmes.js
// Script de seed: popula o banco com os filmes em alta da semana no TMDB,
// para que a home nunca comece vazia para um usuário novo.
//
// Diferente das rotas normais, esse arquivo não é chamado pelo Express —
// você roda ele manualmente no terminal, uma vez (ou sempre que quiser
// atualizar o catálogo com filmes mais recentes).
//
// Uso:
//   node src/scripts/seedFilmes.js
// ========================================

require('dotenv').config();
const axios = require('axios');
const pool = require('../config/database');
const { salvarFilme } = require('../controllers/filmeController');

// 4 páginas x 20 filmes = ~80 filmes no catálogo inicial
const PAGINAS_A_BUSCAR = 4;

/**
 * Garante que os gêneros já estão sincronizados antes de salvar os filmes
 * — sem isso, o vínculo filme-gênero simplesmente não acontece (mas não
 * quebra nada, só fica incompleto). Só sincroniza se a tabela estiver vazia.
 */
async function sincronizarGenerosSeNecessario() {
  const [existentes] = await pool.query('SELECT COUNT(*) AS total FROM TB_Genero');

  if (existentes[0].total > 0) {
    console.log('Gêneros já sincronizados, pulando essa etapa.');
    return;
  }

  console.log('Sincronizando gêneros do TMDB...');

  const resposta = await axios.get('https://api.themoviedb.org/3/genre/movie/list', {
    params: { api_key: process.env.TMDB_API_KEY, language: 'pt-BR' },
  });

  for (const genero of resposta.data.genres) {
    await pool.query(
      'INSERT INTO TB_Genero (nm_genero, id_tmdb) VALUES (?, ?)',
      [genero.name, genero.id]
    );
  }

  console.log(`${resposta.data.genres.length} gêneros salvos.\n`);
}

/**
 * Busca uma página de filmes em alta na semana, no TMDB.
 */
async function buscarFilmesEmAlta(pagina) {
  const resposta = await axios.get('https://api.themoviedb.org/3/trending/movie/week', {
    params: {
      api_key: process.env.TMDB_API_KEY,
      language: 'pt-BR',
      page: pagina,
    },
  });
  return resposta.data.results;
}

async function seed() {
  console.log('Iniciando seed de filmes populares...\n');

  await sincronizarGenerosSeNecessario();

  let totalSalvos = 0;
  let totalIgnorados = 0;

  for (let pagina = 1; pagina <= PAGINAS_A_BUSCAR; pagina++) {
    console.log(`Buscando página ${pagina} de ${PAGINAS_A_BUSCAR}...`);
    const filmes = await buscarFilmesEmAlta(pagina);

    for (const filme of filmes) {
      try {
        await salvarFilme(filme);
        totalSalvos++;
      } catch (err) {
        // mesmo padrão defensivo da busca normal: um filme com problema
        // (sem título, sem ano) é ignorado, sem travar o resto do seed
        totalIgnorados++;
        console.warn(`  Ignorado: "${filme.title || 'sem título'}" — ${err.message}`);
      }
    }
  }

  console.log(`\nSeed concluído.`);
  console.log(`  ${totalSalvos} filmes salvos com sucesso.`);
  console.log(`  ${totalIgnorados} filmes ignorados (dados incompletos).`);

  await pool.end();
}

seed().catch((err) => {
  console.error('\nErro fatal no seed:', err.message);
  process.exit(1);
});