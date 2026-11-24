const pool = require('../config/database');
const bcrypt = require('bcrypt');
const { enviarCodigoNovoEmail } = require('../services/emailService');
const { gerarToken } = require('../services/tokenService');

// Aceita apenas data URL de imagem em base64 (o front sempre envia JPEG 256x256)
const FORMATO_FOTO = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
const TAMANHO_MAXIMO_FOTO = 150000; // caracteres (~110 KB de imagem)
const TAMANHO_MAXIMO_BIO = 160;
const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Ordenações permitidas no histórico de avaliações. O ORDER BY não aceita placeholders,
// então só valores desta lista fixa entram na query (nunca texto vindo do cliente).
const ORDENACOES_AVALIACOES = {
  recentes: 'a.created_at DESC',
  antigas: 'a.created_at ASC',
  maior_nota: 'a.nr_nota DESC, a.created_at DESC',
  menor_nota: 'a.nr_nota ASC, a.created_at DESC',
  titulo: 'f.nm_filme ASC',
};

function gerarCodigo() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// Busca o usuário SEM a foto (que é pesada) e sempre a partir do banco,
// nunca do token, que pode estar desatualizado.
async function buscarUsuario(id_usuario) {
  const [rows] = await pool.query(
    `SELECT id_usuario, nm_usuario, ds_email, ds_senha, nr_versao_token,
            ds_email_pendente, cd_troca_email, dt_expiracao_troca_email
     FROM TB_Usuario WHERE id_usuario = ?`,
    [id_usuario]
  );
  return rows[0] || null;
}

// ----------------------------------------
// PERFIL, BIO E FOTO
// ----------------------------------------

// GET /usuarios/me
const obterMeuPerfil = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id_usuario, nm_usuario, ds_email, ds_foto, ds_bio, created_at
       FROM TB_Usuario WHERE id_usuario = ?`,
      [req.usuario.id_usuario]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('Erro ao buscar perfil:', err.message);
    res.status(500).json({ error: 'Erro ao buscar perfil.' });
  }
};

// PUT /usuarios/bio — texto vazio remove a bio
const atualizarBio = async (req, res) => {
  const { ds_bio } = req.body || {};

  if (ds_bio !== undefined && ds_bio !== null && typeof ds_bio !== 'string') {
    return res.status(400).json({ error: 'Bio inválida.' });
  }

  const bio = typeof ds_bio === 'string' ? ds_bio.trim() : '';

  if (bio.length > TAMANHO_MAXIMO_BIO) {
    return res.status(400).json({ error: `A bio pode ter no máximo ${TAMANHO_MAXIMO_BIO} caracteres.` });
  }

  try {
    await pool.query(
      'UPDATE TB_Usuario SET ds_bio = ? WHERE id_usuario = ?',
      [bio || null, req.usuario.id_usuario]
    );

    res.json({ message: 'Bio atualizada com sucesso!', ds_bio: bio || null });
  } catch (err) {
    console.error('Erro ao atualizar bio:', err.message);
    res.status(500).json({ error: 'Erro ao atualizar bio.' });
  }
};

// PUT /usuarios/foto
const atualizarFoto = async (req, res) => {
  const { ds_foto } = req.body || {};

  if (typeof ds_foto !== 'string' || !ds_foto) {
    return res.status(400).json({ error: 'Envie uma imagem.' });
  }

  if (ds_foto.length > TAMANHO_MAXIMO_FOTO) {
    return res.status(400).json({ error: 'A imagem é grande demais.' });
  }

  if (!FORMATO_FOTO.test(ds_foto)) {
    return res.status(400).json({ error: 'Formato de imagem inválido. Use JPEG, PNG ou WebP.' });
  }

  try {
    await pool.query(
      'UPDATE TB_Usuario SET ds_foto = ? WHERE id_usuario = ?',
      [ds_foto, req.usuario.id_usuario]
    );

    res.json({ message: 'Foto atualizada com sucesso!' });
  } catch (err) {
    console.error('Erro ao atualizar foto:', err.message);
    res.status(500).json({ error: 'Erro ao atualizar foto.' });
  }
};

// DELETE /usuarios/foto
const removerFoto = async (req, res) => {
  try {
    await pool.query(
      'UPDATE TB_Usuario SET ds_foto = NULL WHERE id_usuario = ?',
      [req.usuario.id_usuario]
    );

    res.json({ message: 'Foto removida com sucesso!' });
  } catch (err) {
    console.error('Erro ao remover foto:', err.message);
    res.status(500).json({ error: 'Erro ao remover foto.' });
  }
};

// ----------------------------------------
// HISTÓRICO DE AVALIAÇÕES E RESUMO DE LISTAS (página de perfil)
// ----------------------------------------

// GET /usuarios/me/avaliacoes?limit=10&offset=0&ordem=recentes
// ordem: recentes | antigas | maior_nota | menor_nota | titulo
const listarMinhasAvaliacoes = async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

  const ordem = Object.prototype.hasOwnProperty.call(ORDENACOES_AVALIACOES, req.query.ordem)
    ? req.query.ordem
    : 'recentes';

  try {
    const [[contagem]] = await pool.query(
      'SELECT COUNT(*) AS total FROM TB_Avaliacao WHERE id_usuario = ?',
      [req.usuario.id_usuario]
    );
    const total = Number(contagem.total);

    // id_avaliacao no final garante uma ordem estável entre as "páginas"
    const [rows] = await pool.query(
      `SELECT a.id_avaliacao, a.nr_nota, a.ds_comentario, a.created_at,
              f.id_filme, f.nm_filme, f.ds_poster, f.dt_lancamento
       FROM TB_Avaliacao a
       INNER JOIN TB_Filme f ON f.id_filme = a.id_filme
       WHERE a.id_usuario = ?
       ORDER BY ${ORDENACOES_AVALIACOES[ordem]}, a.id_avaliacao DESC
       LIMIT ? OFFSET ?`,
      [req.usuario.id_usuario, limit, offset]
    );

    res.json({
      data: rows,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + rows.length < total,
      },
    });
  } catch (err) {
    console.error('Erro ao listar avaliações do usuário:', err.message);
    res.status(500).json({ error: 'Erro ao buscar suas avaliações.' });
  }
};

// GET /usuarios/me/listas — listas do usuário com a contagem de filmes de cada uma
const listarMeuResumoListas = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT l.id_lista, l.nm_lista, l.ds_lista, l.is_visibilidade, l.created_at,
              COUNT(lf.id_filme) AS total_filmes
       FROM TB_Lista l
       LEFT JOIN TB_Lista_Filme lf ON lf.id_lista = l.id_lista
       WHERE l.id_usuario = ?
       GROUP BY l.id_lista, l.nm_lista, l.ds_lista, l.is_visibilidade, l.created_at
       ORDER BY l.created_at DESC, l.id_lista DESC`,
      [req.usuario.id_usuario]
    );

    res.json(rows.map((lista) => ({ ...lista, total_filmes: Number(lista.total_filmes) })));
  } catch (err) {
    console.error('Erro ao listar resumo das listas:', err.message);
    res.status(500).json({ error: 'Erro ao buscar suas listas.' });
  }
};

// ----------------------------------------
// NOME
// ----------------------------------------

// PUT /usuarios/nome — devolve token novo, pois o nome vai dentro do JWT
const atualizarNome = async (req, res) => {
  const { nm_usuario } = req.body || {};
  const nome = typeof nm_usuario === 'string' ? nm_usuario.trim() : '';

  if (nome.length < 2 || nome.length > 100) {
    return res.status(400).json({ error: 'O nome deve ter entre 2 e 100 caracteres.' });
  }

  try {
    const usuario = await buscarUsuario(req.usuario.id_usuario);

    if (!usuario) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    await pool.query(
      'UPDATE TB_Usuario SET nm_usuario = ? WHERE id_usuario = ?',
      [nome, usuario.id_usuario]
    );

    const token = gerarToken({ ...usuario, nm_usuario: nome });
    res.json({ message: 'Nome atualizado com sucesso!', token });
  } catch (err) {
    console.error('Erro ao atualizar nome:', err.message);
    res.status(500).json({ error: 'Erro ao atualizar nome.' });
  }
};

// ----------------------------------------
// SENHA (usuário logado)
// ----------------------------------------

// PUT /usuarios/senha — derruba as sessões de todos os outros dispositivos
const alterarSenha = async (req, res) => {
  const { senha_atual, nova_senha } = req.body || {};

  if (!senha_atual || !nova_senha) {
    return res.status(400).json({ error: 'Preencha todos os campos.' });
  }

  if (typeof nova_senha !== 'string' || nova_senha.length < 6) {
    return res.status(400).json({ error: 'A nova senha precisa ter pelo menos 6 caracteres.' });
  }

  if (senha_atual === nova_senha) {
    return res.status(400).json({ error: 'A nova senha precisa ser diferente da atual.' });
  }

  try {
    const usuario = await buscarUsuario(req.usuario.id_usuario);

    if (!usuario) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    const senhaCorreta = await bcrypt.compare(String(senha_atual), usuario.ds_senha);

    if (!senhaCorreta) {
      return res.status(400).json({ error: 'Senha atual incorreta.' });
    }

    const hash = await bcrypt.hash(nova_senha, 10);

    await pool.query(
      'UPDATE TB_Usuario SET ds_senha = ?, nr_versao_token = nr_versao_token + 1 WHERE id_usuario = ?',
      [hash, usuario.id_usuario]
    );

    // token novo, da versão nova: este dispositivo continua logado, os outros caem
    const token = gerarToken({ ...usuario, nr_versao_token: Number(usuario.nr_versao_token) + 1 });
    res.json({ message: 'Senha alterada com sucesso!', token });
  } catch (err) {
    console.error('Erro ao alterar senha:', err.message);
    res.status(500).json({ error: 'Erro ao alterar senha.' });
  }
};

// ----------------------------------------
// TROCA DE EMAIL (2 passos: solicitar → confirmar com código)
// ----------------------------------------

// Grava o email pendente + código (15 min) e envia o código para o NOVO email.
async function gerarEEnviarCodigoTrocaEmail(usuario, novoEmail) {
  const codigo = gerarCodigo();

  await pool.query(
    `UPDATE TB_Usuario
     SET ds_email_pendente = ?, cd_troca_email = ?, dt_expiracao_troca_email = DATE_ADD(NOW(), INTERVAL 15 MINUTE)
     WHERE id_usuario = ?`,
    [novoEmail, codigo, usuario.id_usuario]
  );

  await enviarCodigoNovoEmail(novoEmail, usuario.nm_usuario, codigo);
}

// POST /usuarios/email/solicitar
const solicitarTrocaEmail = async (req, res) => {
  const { novo_email, senha_atual } = req.body || {};
  const novoEmail = typeof novo_email === 'string' ? novo_email.trim() : '';

  if (!novoEmail || !senha_atual) {
    return res.status(400).json({ error: 'Informe o novo email e a sua senha atual.' });
  }

  if (!REGEX_EMAIL.test(novoEmail) || novoEmail.length > 150) {
    return res.status(400).json({ error: 'Informe um email válido.' });
  }

  try {
    const usuario = await buscarUsuario(req.usuario.id_usuario);

    if (!usuario) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    const senhaCorreta = await bcrypt.compare(String(senha_atual), usuario.ds_senha);

    if (!senhaCorreta) {
      return res.status(400).json({ error: 'Senha atual incorreta.' });
    }

    if (novoEmail.toLowerCase() === usuario.ds_email.toLowerCase()) {
      return res.status(400).json({ error: 'Esse já é o email da sua conta.' });
    }

    // só bloqueia se outra conta VERIFICADA já usa esse email
    const [emUso] = await pool.query(
      'SELECT id_usuario FROM TB_Usuario WHERE ds_email = ? AND is_verificado = TRUE AND id_usuario <> ?',
      [novoEmail, usuario.id_usuario]
    );

    if (emUso.length > 0) {
      return res.status(409).json({ error: 'Esse email já está em uso por outra conta.' });
    }

    await gerarEEnviarCodigoTrocaEmail(usuario, novoEmail);

    res.json({ message: 'Enviamos um código de confirmação para o novo email.' });
  } catch (err) {
    console.error('Erro ao solicitar troca de email:', err.message);
    res.status(500).json({ error: 'Erro ao solicitar a troca de email.' });
  }
};

// POST /usuarios/email/reenviar — reenvia o código para o email que já está pendente
const reenviarCodigoTrocaEmail = async (req, res) => {
  try {
    const usuario = await buscarUsuario(req.usuario.id_usuario);

    if (!usuario) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    if (!usuario.ds_email_pendente) {
      return res.status(400).json({ error: 'Não há nenhuma troca de email em andamento.' });
    }

    await gerarEEnviarCodigoTrocaEmail(usuario, usuario.ds_email_pendente);

    res.json({ message: 'Novo código enviado para o novo email.' });
  } catch (err) {
    console.error('Erro ao reenviar código de troca de email:', err.message);
    res.status(500).json({ error: 'Erro ao reenviar o código.' });
  }
};

// POST /usuarios/email/confirmar — efetiva a troca e devolve token novo
const confirmarTrocaEmail = async (req, res) => {
  const { codigo } = req.body || {};

  if (!codigo) {
    return res.status(400).json({ error: 'Informe o código.' });
  }

  try {
    const usuario = await buscarUsuario(req.usuario.id_usuario);

    if (!usuario) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    if (!usuario.ds_email_pendente || !usuario.cd_troca_email) {
      return res.status(400).json({ error: 'Solicite a troca de email antes.' });
    }

    if (usuario.cd_troca_email !== String(codigo)) {
      return res.status(400).json({ error: 'Código incorreto.' });
    }

    if (new Date(usuario.dt_expiracao_troca_email) < new Date()) {
      return res.status(400).json({ error: 'Código expirado. Solicite um novo.' });
    }

    const novoEmail = usuario.ds_email_pendente;

    // Contas NÃO verificadas com esse email não têm dado nenhum (nunca receberam token),
    // então podem ser descartadas para liberar o email sem violar a coluna UNIQUE.
    await pool.query(
      'DELETE FROM TB_Usuario WHERE ds_email = ? AND is_verificado = FALSE AND id_usuario <> ?',
      [novoEmail, usuario.id_usuario]
    );

    // nr_versao_token + 1: o email é a identidade da conta, então as outras sessões caem
    await pool.query(
      `UPDATE TB_Usuario
       SET ds_email = ?, ds_email_pendente = NULL, cd_troca_email = NULL, dt_expiracao_troca_email = NULL,
           nr_versao_token = nr_versao_token + 1
       WHERE id_usuario = ?`,
      [novoEmail, usuario.id_usuario]
    );

    const token = gerarToken({
      ...usuario,
      ds_email: novoEmail,
      nr_versao_token: Number(usuario.nr_versao_token) + 1,
    });
    res.json({ message: 'Email alterado com sucesso!', token });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Esse email já está em uso por outra conta.' });
    }
    console.error('Erro ao confirmar troca de email:', err.message);
    res.status(500).json({ error: 'Erro ao confirmar a troca de email.' });
  }
};

// ----------------------------------------
// EXCLUIR CONTA
// ----------------------------------------

// DELETE /usuarios — exige a senha; avaliações e listas somem por ON DELETE CASCADE
const excluirConta = async (req, res) => {
  const { senha_atual } = req.body || {};

  if (!senha_atual) {
    return res.status(400).json({ error: 'Informe a sua senha para excluir a conta.' });
  }

  try {
    const usuario = await buscarUsuario(req.usuario.id_usuario);

    if (!usuario) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    const senhaCorreta = await bcrypt.compare(String(senha_atual), usuario.ds_senha);

    if (!senhaCorreta) {
      return res.status(400).json({ error: 'Senha incorreta.' });
    }

    await pool.query('DELETE FROM TB_Usuario WHERE id_usuario = ?', [usuario.id_usuario]);

    res.json({ message: 'Conta excluída com sucesso.' });
  } catch (err) {
    console.error('Erro ao excluir conta:', err.message);
    res.status(500).json({ error: 'Erro ao excluir conta.' });
  }
};

module.exports = {
  obterMeuPerfil,
  atualizarBio,
  atualizarFoto,
  removerFoto,
  listarMinhasAvaliacoes,
  listarMeuResumoListas,
  atualizarNome,
  alterarSenha,
  solicitarTrocaEmail,
  reenviarCodigoTrocaEmail,
  confirmarTrocaEmail,
  excluirConta,
};