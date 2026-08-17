const pool = require('../config/database');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { enviarCodigoVerificacao, enviarCodigoRecuperacao } = require('../services/emailService');

function gerarCodigo() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function gerarToken(usuario) {
  return jwt.sign(
    { id_usuario: usuario.id_usuario, nm_usuario: usuario.nm_usuario, ds_email: usuario.ds_email },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// CADASTRO
const cadastrar = async (req, res) => {
  const { nm_usuario, ds_email, ds_senha } = req.body;

  if (!nm_usuario || !ds_email || !ds_senha) {
    return res.status(400).json({ error: 'Preencha todos os campos.' });
  }

  try {
    const [existe] = await pool.query(
      'SELECT * FROM TB_Usuario WHERE ds_email = ?',
      [ds_email]
    );

    const hash = await bcrypt.hash(ds_senha, 10);
    const codigo = gerarCodigo();

    if (existe.length > 0) {
      const usuarioExistente = existe[0];

      if (usuarioExistente.is_verificado) {
        return res.status(409).json({ error: 'Email já cadastrado.' });
      }

      await pool.query(
        `UPDATE TB_Usuario 
         SET nm_usuario = ?, ds_senha = ?, cd_verificacao = ?, dt_expiracao_codigo = DATE_ADD(NOW(), INTERVAL 15 MINUTE)
         WHERE id_usuario = ?`,
        [nm_usuario, hash, codigo, usuarioExistente.id_usuario]
      );
    } else {
      await pool.query(
        `INSERT INTO TB_Usuario (nm_usuario, ds_email, ds_senha, is_verificado, cd_verificacao, dt_expiracao_codigo)
         VALUES (?, ?, ?, FALSE, ?, DATE_ADD(NOW(), INTERVAL 15 MINUTE))`,
        [nm_usuario, ds_email, hash, codigo]
      );
    }

    await enviarCodigoVerificacao(ds_email, nm_usuario, codigo);

    res.status(201).json({
      message: 'Conta criada! Enviamos um código de verificação para o seu email.',
    });
  } catch (err) {
    console.error('Erro ao cadastrar:', err.message);
    res.status(500).json({ error: 'Erro ao cadastrar usuário.' });
  }
};

// VERIFICAR CÓDIGO (confirmação de cadastro)
const verificarCodigo = async (req, res) => {
  const { ds_email, codigo } = req.body;

  if (!ds_email || !codigo) {
    return res.status(400).json({ error: 'Informe o email e o código.' });
  }

  try {
    const [rows] = await pool.query('SELECT * FROM TB_Usuario WHERE ds_email = ?', [ds_email]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    const usuario = rows[0];

    if (usuario.is_verificado) {
      return res.status(409).json({ error: 'Este email já foi verificado.' });
    }

    if (usuario.cd_verificacao !== codigo) {
      return res.status(400).json({ error: 'Código incorreto.' });
    }

    if (new Date(usuario.dt_expiracao_codigo) < new Date()) {
      return res.status(400).json({ error: 'Código expirado. Solicite um novo.' });
    }

    await pool.query(
      `UPDATE TB_Usuario 
       SET is_verificado = TRUE, cd_verificacao = NULL, dt_expiracao_codigo = NULL
       WHERE id_usuario = ?`,
      [usuario.id_usuario]
    );

    const token = gerarToken(usuario);
    res.json({ message: 'Email verificado com sucesso!', token });
  } catch (err) {
    console.error('Erro ao verificar código:', err.message);
    res.status(500).json({ error: 'Erro ao verificar o código.' });
  }
};

// REENVIAR CÓDIGO (confirmação de cadastro)
const reenviarCodigo = async (req, res) => {
  const { ds_email } = req.body;

  if (!ds_email) {
    return res.status(400).json({ error: 'Informe o email.' });
  }

  try {
    const [rows] = await pool.query('SELECT * FROM TB_Usuario WHERE ds_email = ?', [ds_email]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    const usuario = rows[0];

    if (usuario.is_verificado) {
      return res.status(409).json({ error: 'Este email já foi verificado.' });
    }

    const novoCodigo = gerarCodigo();

    await pool.query(
      `UPDATE TB_Usuario 
       SET cd_verificacao = ?, dt_expiracao_codigo = DATE_ADD(NOW(), INTERVAL 15 MINUTE)
       WHERE id_usuario = ?`,
      [novoCodigo, usuario.id_usuario]
    );

    await enviarCodigoVerificacao(ds_email, usuario.nm_usuario, novoCodigo);

    res.json({ message: 'Novo código enviado para o seu email.' });
  } catch (err) {
    console.error('Erro ao reenviar código:', err.message);
    res.status(500).json({ error: 'Erro ao reenviar o código.' });
  }
};

// LOGIN
const login = async (req, res) => {
  const { ds_email, ds_senha } = req.body;

  if (!ds_email || !ds_senha) {
    return res.status(400).json({ error: 'Preencha todos os campos.' });
  }

  try {
    const [rows] = await pool.query('SELECT * FROM TB_Usuario WHERE ds_email = ?', [ds_email]);

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Email ou senha inválidos.' });
    }

    const usuario = rows[0];
    const senhaCorreta = await bcrypt.compare(ds_senha, usuario.ds_senha);

    if (!senhaCorreta) {
      return res.status(401).json({ error: 'Email ou senha inválidos.' });
    }

    if (!usuario.is_verificado) {
      return res.status(403).json({
        error: 'Você ainda não verificou seu email.',
        emailNaoVerificado: true,
      });
    }

    const token = gerarToken(usuario);
    res.json({ token });
  } catch (err) {
    console.error('Erro no login:', err.message);
    res.status(500).json({ error: 'Erro ao fazer login.' });
  }
};

// ESQUECI MINHA SENHA — solicita o código de recuperação
const esqueciSenha = async (req, res) => {
  const { ds_email } = req.body;

  if (!ds_email) {
    return res.status(400).json({ error: 'Informe o email.' });
  }

  try {
    const [rows] = await pool.query('SELECT * FROM TB_Usuario WHERE ds_email = ?', [ds_email]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Não encontramos uma conta com esse email.' });
    }

    const usuario = rows[0];
    const codigo = gerarCodigo();

    await pool.query(
      `UPDATE TB_Usuario 
       SET cd_recuperacao = ?, dt_expiracao_recuperacao = DATE_ADD(NOW(), INTERVAL 15 MINUTE)
       WHERE id_usuario = ?`,
      [codigo, usuario.id_usuario]
    );

    await enviarCodigoRecuperacao(ds_email, usuario.nm_usuario, codigo);

    res.json({ message: 'Enviamos um código de recuperação para o seu email.' });
  } catch (err) {
    console.error('Erro ao solicitar recuperação de senha:', err.message);
    res.status(500).json({ error: 'Erro ao solicitar recuperação de senha.' });
  }
};

// REDEFINIR SENHA — confere o código e salva a nova senha
const redefinirSenha = async (req, res) => {
  const { ds_email, codigo, nova_senha } = req.body;

  if (!ds_email || !codigo || !nova_senha) {
    return res.status(400).json({ error: 'Preencha todos os campos.' });
  }

  if (nova_senha.length < 6) {
    return res.status(400).json({ error: 'A senha precisa ter pelo menos 6 caracteres.' });
  }

  try {
    const [rows] = await pool.query('SELECT * FROM TB_Usuario WHERE ds_email = ?', [ds_email]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    const usuario = rows[0];

    if (!usuario.cd_recuperacao) {
      return res.status(400).json({ error: 'Solicite um código de recuperação antes.' });
    }

    if (usuario.cd_recuperacao !== codigo) {
      return res.status(400).json({ error: 'Código incorreto.' });
    }

    if (new Date(usuario.dt_expiracao_recuperacao) < new Date()) {
      return res.status(400).json({ error: 'Código expirado. Solicite um novo.' });
    }

    const hash = await bcrypt.hash(nova_senha, 10);

    await pool.query(
      `UPDATE TB_Usuario 
       SET ds_senha = ?, cd_recuperacao = NULL, dt_expiracao_recuperacao = NULL
       WHERE id_usuario = ?`,
      [hash, usuario.id_usuario]
    );

    // já loga o usuário automaticamente após redefinir a senha
    const token = gerarToken(usuario);
    res.json({ message: 'Senha redefinida com sucesso!', token });
  } catch (err) {
    console.error('Erro ao redefinir senha:', err.message);
    res.status(500).json({ error: 'Erro ao redefinir senha.' });
  }
};

module.exports = {
  cadastrar,
  login,
  verificarCodigo,
  reenviarCodigo,
  esqueciSenha,
  redefinirSenha,
};