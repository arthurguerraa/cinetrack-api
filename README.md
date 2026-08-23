# CineTrack API — Backend

API REST para uma plataforma de avaliação de filmes, onde usuários podem buscar filmes, avaliá-los, criar listas personalizadas e visualizar rankings baseados nas avaliações da comunidade.

Projeto desenvolvido como estudo prático de backend, integrando autenticação com verificação de email, consumo de API externa em tempo real, modelagem relacional, queries SQL agregadas, e boas práticas de segurança (rate limiting, headers HTTP seguros).

---

## Tecnologias

- **Node.js** + **Express** — servidor e rotas
- **MySQL** (`mysql2/promise`) — banco de dados relacional
- **JWT** (`jsonwebtoken`) — autenticação
- **bcrypt** — hash de senhas
- **Axios** — consumo da API do TMDB
- **Nodemailer** (via Gmail SMTP + senha de app) — envio de email transacional (verificação de cadastro e recuperação de senha)
- **Helmet** — headers de segurança HTTP
- **express-rate-limit** — limitação de requisições
- **TMDB API** — base de dados de filmes e gêneros, consultada em tempo real

---

## Arquitetura

Arquitetura em camadas (MVC adaptado para API REST):

```
src/
├── config/database.js       ← pool de conexão MySQL
├── controllers/               ← lógica de negócio de cada funcionalidade
├── middlewares/
│   ├── authMiddleware.js       ← verificarToken (protege rotas)
│   └── errorMiddleware.js      ← tratamento de erro centralizado
├── routes/                     ← definição dos endpoints
│   └── authRoutes.js            ← exporta uma FUNÇÃO que recebe o limiter de auth (ver seção Segurança)
├── services/
│   └── emailService.js          ← integração com Nodemailer
├── scripts/
│   └── seedFilmes.js            ← popula o banco com filmes em alta (roda manualmente)
└── app.js                       ← configuração do Express (sem app.listen)
server.js                        ← único responsável por app.listen()
```

`app.js` e `server.js` são propositalmente separados: `app.js` monta o Express (middlewares, rotas, tratamento de erro) e exporta a instância; `server.js` importa esse `app` e é o único lugar que chama `.listen()`.

---

## Como rodar o projeto

### Pré-requisitos
- Node.js instalado
- MySQL instalado e rodando
- Uma API Key do [TMDB](https://www.themoviedb.org/settings/api)
- Uma conta Gmail com **verificação em 2 etapas ativada**, para gerar uma [senha de app](https://myaccount.google.com/apppasswords)

### Passos

```bash
git clone <url-do-repositorio>
cd cinetrack-api
npm install
```

**.env**
```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=sua_senha
DB_NAME=db_cinetrack
DB_PORT=3306

PORT=3000
JWT_SECRET=uma_chave_secreta_gerada_com_crypto_randomBytes

TMDB_API_KEY=sua_chave_do_tmdb

EMAIL_USER=seuemail@gmail.com
EMAIL_APP_PASSWORD=senha_de_app_de_16_caracteres
```

> `JWT_SECRET` deve ser gerado com um comando como `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` — nunca usar um valor de exemplo/placeholder em produção.
>
> `EMAIL_APP_PASSWORD` **não é a senha normal da conta Google** — é uma senha de 16 caracteres gerada especificamente para aplicações, em `myaccount.google.com/apppasswords`.

```bash
# crie o banco de dados executando o script SQL (ver seção Modelo de dados)

npm run dev
```

**Opcional, mas recomendado:** roda o script de seed para popular o catálogo com filmes em alta, evitando que a home comece vazia:
```bash
node src/scripts/seedFilmes.js
```

O servidor sobe em `http://localhost:3000`.

---

## Segurança

### Autenticação
Rotas protegidas exigem o token JWT no header:
```
Authorization: Bearer <seu_token>
```
Token válido por 7 dias, contendo `{ id_usuario, nm_usuario, ds_email }`.

### Headers HTTP (Helmet)
Aplicado globalmente em `app.js`, com `crossOriginResourcePolicy` desativado especificamente para permitir que o frontend (em outra origem) consuma a API normalmente.

### Rate limiting
Dois níveis:
- **Geral** — 100 requisições por IP a cada 15 minutos, aplicado a toda a API
- **Autenticação** — 10 tentativas por IP a cada 15 minutos, aplicado especificamente nas rotas de `/auth` (login, cadastro, recuperação de senha), para dificultar brute-force

Por isso `authRoutes.js` tem uma estrutura diferente das demais rotas — em vez de exportar um router diretamente, exporta uma **função** que recebe o limiter como parâmetro:
```js
// authRoutes.js
module.exports = (limiteAuth) => {
  const router = express.Router();
  router.post('/login', limiteAuth, login);
  // ...
  return router;
};

// app.js
const authRoutes = require('./routes/authRoutes')(limiteAuth);
app.use('/auth', authRoutes);
```

`app.set('trust proxy', 1)` está configurado em `app.js` para o rate limiter identificar corretamente o IP real do cliente quando o deploy estiver atrás de um proxy reverso (Railway, Render, etc.).

### CORS
Atualmente **aberto para qualquer origem** — decisão deliberada enquanto o frontend é testado localmente via `file://` (origem `null`, sem porta fixa). **Deve ser restringido ao domínio real do frontend no deploy.**

---

## Envio de email

Usa **Nodemailer** com transporte SMTP do Gmail, autenticado via senha de app (não a senha normal da conta). Diferente de serviços como Resend, **não exige verificação de domínio** para enviar a qualquer destinatário — funciona para qualquer usuário real desde o primeiro dia, sem custo.

O serviço (`emailService.js`) verifica o campo `rejected` do retorno do `transporter.sendMail()` e lança uma exceção se o destinatário for rejeitado, garantindo que uma falha de envio nunca passe despercebida como "sucesso".

**Limitações a ter em mente:**
- Gmail limita contas gratuitas a ~500 emails/dia — mais que suficiente para um projeto de portfólio
- Emails enviados por SMTP pessoal podem ocasionalmente cair em spam, dependendo do provedor do destinatário

---

## Endpoints

### Autenticação

| Método | Rota | Protegida | Descrição |
|---|---|---|---|
| POST | `/auth/cadastrar` | Não | Cadastra um novo usuário e envia código de verificação por email |
| POST | `/auth/login` | Não | Autentica o usuário; bloqueia com 403 se o email não estiver verificado |
| POST | `/auth/verificar` | Não | Confirma o código de 6 dígitos enviado no cadastro; retorna token (login automático) |
| POST | `/auth/reenviar-codigo` | Não | Reenvia o código de verificação de cadastro |
| POST | `/auth/esqueci-senha` | Não | Envia um código de recuperação de senha por email |
| POST | `/auth/redefinir-senha` | Não | Confirma o código e define a nova senha; retorna token (login automático) |

Todas as rotas de `/auth` passam pelo rate limiter específico (10 tentativas / 15 min por IP).

**POST /auth/cadastrar**
```json
{
  "nm_usuario": "Arthur",
  "ds_email": "arthur@email.com",
  "ds_senha": "123456"
}
```
Se o email já existir mas **não estiver verificado**, o cadastro é permitido novamente (atualiza os dados e reenvia um novo código) em vez de bloquear — evita travar quem perdeu o código ou fechou a aba no meio do processo.

**POST /auth/login**
```json
{
  "ds_email": "arthur@email.com",
  "ds_senha": "123456"
}
```
Resposta de sucesso:
```json
{ "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." }
```
Resposta se o email não estiver verificado (403):
```json
{ "error": "Você ainda não verificou seu email.", "emailNaoVerificado": true }
```

**POST /auth/verificar**
```json
{ "ds_email": "arthur@email.com", "codigo": "123456" }
```

**POST /auth/esqueci-senha**
```json
{ "ds_email": "arthur@email.com" }
```

**POST /auth/redefinir-senha**
```json
{ "ds_email": "arthur@email.com", "codigo": "123456", "nova_senha": "novaSenha123" }
```

Códigos de verificação e recuperação expiram em **15 minutos**.

---

### Filmes

Toda listagem de filme consulta o **TMDB em tempo real** — o banco nunca é a fonte da exibição, só um cache de apoio que garante `id_filme` fixo para permitir avaliações e listas.

| Método | Rota | Protegida | Descrição |
|---|---|---|---|
| GET | `/filmes/populares?page=` | Não | Filmes em alta na semana (`/trending/movie/week` do TMDB) |
| GET | `/filmes/genero?nome=&page=` | Não | Filmes de um gênero específico (`/discover/movie` do TMDB) |
| GET | `/filmes/buscar?q=&page=` | Não | Busca por termo; tenta em português, se vazio tenta em inglês |

Todas retornam o mesmo formato:
```json
{
  "data": [
    { "id_filme": 8, "titulo": "Batman: O Cavaleiro das Trevas", "sinopse": "...", "ano": "2008", "nota": 8.5, "poster": "https://..." }
  ],
  "pagination": { "page": 1, "totalPages": 12, "hasNext": true, "hasPrev": false }
}
```

> A rota antiga `GET /filmes` (sem sufixo, lia a tabela local acumulada) **foi removida** — filmes buscados uma vez não "grudavam" mais na listagem padrão, resolvendo um problema de UX identificado durante o desenvolvimento.

---

### Gêneros

| Método | Rota | Protegida | Descrição |
|---|---|---|---|
| POST | `/generos/sincronizar` | Não | Sincroniza a lista de gêneros do TMDB com o banco local (executar uma vez) |
| GET | `/generos` | Não | Lista os gêneros salvos no banco |

---

### Avaliações

| Método | Rota | Protegida | Descrição |
|---|---|---|---|
| POST | `/avaliacoes` | Sim | Cria uma avaliação para um filme |
| GET | `/avaliacoes/minhas` | Sim | Lista as avaliações do usuário logado (usado na tela de perfil) |
| PUT | `/avaliacoes/:id_avaliacao` | Sim | Edita uma avaliação existente |
| DELETE | `/avaliacoes/:id_avaliacao` | Sim | Remove uma avaliação |

**Regras de negócio:**
- A nota deve estar entre 1 e 10
- Um usuário não pode avaliar o mesmo filme mais de uma vez
- Apenas o autor da avaliação pode editá-la ou deletá-la

---

### Listas

| Método | Rota | Protegida | Descrição |
|---|---|---|---|
| POST | `/listas` | Sim | Cria uma nova lista |
| GET | `/listas` | Sim | Lista as listas do usuário logado |
| PUT | `/listas/:id_lista` | Sim | Edita uma lista |
| DELETE | `/listas/:id_lista` | Sim | Remove uma lista |
| POST | `/listas/filmes` | Sim | Adiciona um filme a uma lista |
| GET | `/listas/:id_lista/filmes` | Sim | Lista os filmes de uma lista específica |

**Regras de negócio:**
- Uma lista pertence a um único usuário
- Um filme pode estar em várias listas, inclusive de usuários diferentes
- Listas privadas (`is_visibilidade: false`) só podem ser visualizadas pelo próprio dono

---

### Ranking

| Método | Rota | Protegida | Descrição |
|---|---|---|---|
| GET | `/ranking?limit=` | Não | Filmes mais bem avaliados pela comunidade |

Calcula média de notas e total de avaliações por filme via SQL agregado (`AVG`, `COUNT`, `GROUP BY`). Filmes sem avaliação não aparecem.

---

## Script de seed

`src/scripts/seedFilmes.js` — não é uma rota, roda manualmente:
```bash
node src/scripts/seedFilmes.js
```
Sincroniza gêneros (se necessário) e busca ~80 filmes em alta no TMDB, reaproveitando a mesma função de salvamento (`salvarFilme`) usada pelas rotas normais — existe para a home nunca começar vazia para um usuário novo.

---

## Modelo de dados

```
TB_Usuario 1─N TB_Lista N─N TB_Filme N─N TB_Genero
    │                          │
    └──────────N TB_Avaliacao──┘
```

### `TB_Usuario`
```sql
id_usuario                 INT AUTO_INCREMENT PRIMARY KEY
nm_usuario                 VARCHAR(100)   NOT NULL
ds_email                   VARCHAR(150)   NOT NULL UNIQUE
ds_senha                   VARCHAR(255)   NOT NULL
is_verificado               BOOLEAN        NOT NULL DEFAULT FALSE
cd_verificacao              VARCHAR(6)     NULL
dt_expiracao_codigo         DATETIME       NULL
cd_recuperacao               VARCHAR(6)     NULL
dt_expiracao_recuperacao     DATETIME       NULL
created_at                  TIMESTAMP      DEFAULT CURRENT_TIMESTAMP
```

### `TB_Filme`
```sql
id_filme        INT AUTO_INCREMENT PRIMARY KEY
nm_filme        VARCHAR(100)   NOT NULL
ds_sinopse      TEXT           NOT NULL
dt_lancamento   YEAR           NOT NULL
nr_nota_media   DECIMAL(3,1)   NOT NULL
ds_poster       VARCHAR(255)   NULL
created_at      TIMESTAMP      DEFAULT CURRENT_TIMESTAMP
```

### `TB_Genero`
```sql
id_genero   INT AUTO_INCREMENT PRIMARY KEY
nm_genero   VARCHAR(50) NOT NULL
id_tmdb     INT UNIQUE
```

### `TB_Filme_Genero` (N:N)
```sql
id_filme    INT NOT NULL
id_genero   INT NOT NULL
PRIMARY KEY (id_filme, id_genero)
FOREIGN KEY (id_filme)  REFERENCES TB_Filme(id_filme)  ON DELETE CASCADE
FOREIGN KEY (id_genero) REFERENCES TB_Genero(id_genero) ON DELETE CASCADE
```

### `TB_Avaliacao`
```sql
id_avaliacao    INT AUTO_INCREMENT PRIMARY KEY
nr_nota         DECIMAL(3,1)  NOT NULL CHECK (nr_nota BETWEEN 1 AND 10)
ds_comentario   TEXT          NULL
id_usuario      INT           NOT NULL
id_filme        INT           NOT NULL
created_at      TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
UNIQUE (id_usuario, id_filme)
FOREIGN KEY (id_usuario) REFERENCES TB_Usuario(id_usuario) ON DELETE CASCADE
FOREIGN KEY (id_filme)   REFERENCES TB_Filme(id_filme)     ON DELETE CASCADE
```

### `TB_Lista`
```sql
id_lista          INT AUTO_INCREMENT PRIMARY KEY
nm_lista          VARCHAR(100) NOT NULL
ds_lista          VARCHAR(255)
is_visibilidade   BOOLEAN      NOT NULL DEFAULT TRUE
id_usuario        INT          NOT NULL
created_at        TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
FOREIGN KEY (id_usuario) REFERENCES TB_Usuario(id_usuario) ON DELETE CASCADE
```

### `TB_Lista_Filme` (N:N)
```sql
id_lista        INT       NOT NULL
id_filme        INT       NOT NULL
dt_adicionado   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
PRIMARY KEY (id_lista, id_filme)
FOREIGN KEY (id_lista) REFERENCES TB_Lista(id_lista) ON DELETE CASCADE
FOREIGN KEY (id_filme) REFERENCES TB_Filme(id_filme) ON DELETE CASCADE
```

Ao deletar um usuário, suas avaliações e listas são removidas automaticamente (`ON DELETE CASCADE`).

---

## Status de erro

| Código | Significado |
|---|---|
| 400 | Dados inválidos ou incompletos |
| 401 | Token ausente, inválido ou expirado |
| 403 | Acesso negado (ex: email não verificado, lista privada de outro usuário) |
| 404 | Recurso não encontrado |
| 409 | Conflito (ex: email já cadastrado e verificado, avaliação duplicada) |
| 429 | Muitas requisições (rate limit excedido) |
| 500 | Erro interno do servidor |

---

## Melhorias futuras

- [ ] Restringir o CORS ao domínio real do frontend após o deploy
- [ ] Tornar a URL da API configurável por ambiente no frontend (hoje fixa em `localhost:3000`)
- [ ] Testes automatizados com Jest
- [ ] Documentação interativa com Swagger

---

## Autor

Desenvolvido por **Arthur Guerra** como projeto de estudo e portfólio em desenvolvimento fullstack.

- GitHub: [github.com/arthurguerraa](https://github.com/arthurguerraa)
- LinkedIn: [linkedin.com/in/arthurguerraa](https://www.linkedin.com/in/arthurguerraa/)