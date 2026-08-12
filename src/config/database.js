const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host:     process.env.DB_HOST,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port:     process.env.DB_PORT,
});


// teste de conexão
pool.getConnection()
  .then(conn => {
    console.log('Banco de dados conectado!');
    conn.release();
  })
  .catch(err => {
    console.error('Erro ao conectar no banco:', err.message);
  });

module.exports = pool;