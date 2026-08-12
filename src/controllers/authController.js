const pool = require('../config/database');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// CADASTRO
const cadastrar = async (req, res) => {
  const { nm_usuario, ds_email, ds_senha } = req.body;

  // validação básica
  if (!nm_usuario || !ds_email || !ds_senha) {
    return res.status(400).json({ error: 'Preencha todos os campos.' });
  }

  try {
    // verifica se email já existe
    const [existe] = await pool.query(
      'SELECT id_usuario FROM TB_Usuario WHERE ds_email = ?',
      [ds_email]
    );

    if (existe.length > 0) {
      return res.status(409).json({ error: 'Email já cadastrado.' });
    }

    // criptografa a senha
    const hash = await bcrypt.hash(ds_senha, 10);

    // insere o usuário
    await pool.query(
      'INSERT INTO TB_Usuario (nm_usuario, ds_email, ds_senha) VALUES (?, ?, ?)',
      [nm_usuario, ds_email, hash]
    );

    res.status(201).json({ message: 'Usuário cadastrado com sucesso!' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao cadastrar usuário.' });
  }
};

// LOGIN
const login = async (req, res) => {
  const { ds_email, ds_senha } = req.body;

  if (!ds_email || !ds_senha) {
    return res.status(400).json({ error: 'Preencha todos os campos.' });
  }

  try {
    // busca o usuário pelo email
    const [rows] = await pool.query(
      'SELECT * FROM TB_Usuario WHERE ds_email = ?',
      [ds_email]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Email ou senha inválidos.' });
    }

    const usuario = rows[0];

    // compara a senha com o hash
    const senhaCorreta = await bcrypt.compare(ds_senha, usuario.ds_senha);

    if (!senhaCorreta) {
      return res.status(401).json({ error: 'Email ou senha inválidos.' });
    }

    // gera o token JWT
    const token = jwt.sign(
      { id_usuario: usuario.id_usuario, nm_usuario: usuario.nm_usuario },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token });
  } catch (err) {
    console.error('Erro no login:', err.message);
    res.status(500).json({ error: 'Erro ao fazer login.' });
  }
};

module.exports = { cadastrar, login };