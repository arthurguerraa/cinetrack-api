const tratarErros = (err, req, res, next) => {
  console.error('Erro capturado:', err.message);

  // erro de validação do MySQL (ex: campo obrigatório faltando)
  if (err.code === 'ER_NO_DEFAULT_FOR_FIELD' || err.code === 'ER_BAD_NULL_ERROR') {
    return res.status(400).json({ error: 'Dados inválidos ou incompletos.' });
  }

  // erro de duplicidade (ex: UNIQUE constraint)
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ error: 'Registro duplicado.' });
  }

  // erro padrão
  res.status(500).json({ error: 'Erro interno do servidor.' });
};

module.exports = tratarErros;