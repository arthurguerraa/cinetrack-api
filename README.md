# CineTrack API

API REST para uma plataforma de avaliação de filmes, onde usuários podem buscar filmes, avaliá-los, criar listas personalizadas e visualizar rankings baseados nas avaliações da comunidade.

Projeto desenvolvido como estudo prático de backend, integrando autenticação, consumo de API externa, modelagem relacional e queries SQL agregadas.

---

## Tecnologias

- **Node.js** + **Express** — servidor e rotas
- **MySQL** (`mysql2/promise`) — banco de dados relacional
- **JWT** (`jsonwebtoken`) — autenticação
- **bcrypt** — hash de senhas
- **Axios** — consumo da API do TMDB
- **TMDB API** — base de dados de filmes e gêneros

---

## Arquitetura

O projeto segue uma arquitetura em camadas (MVC adaptado para API REST):

```
src/
├── config/         # conexão com o banco de dados
├── controllers/     # lógica de negócio de cada funcionalidade
├── middlewares/      # autenticação e tratamento de erros
├── routes/            # definição dos endpoints
└── app.js             # configuração do Express
```

---

## Como rodar o projeto

### Pré-requisitos
- Node.js instalado
- MySQL instalado e rodando
- Uma API Key do [TMDB](https://www.themoviedb.org/settings/api)

### Passos

```bash
# clone o repositório
git clone <url-do-repositorio>
cd cinetrack-api

# instale as dependências
npm install

# configure as variáveis de ambiente
# crie um arquivo .env na raiz com o conteúdo abaixo
```

**.env**
```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=sua_senha
DB_NAME=db_cinetrack
DB_PORT=3306

PORT=3000
JWT_SECRET=uma_chave_secreta_aleatoria

TMDB_API_KEY=sua_chave_do_tmdb
```

```bash
# crie o banco de dados executando o script SQL disponível em /database/schema.sql

# rode o projeto em modo desenvolvimento
npm run dev
```

O servidor sobe em `http://localhost:3000`.

---

## Autenticação

Rotas protegidas exigem o token JWT no header:

```
Authorization: Bearer <seu_token>
```

O token é obtido através da rota de login e tem validade de 7 dias.

---

## Endpoints

### Autenticação

| Método | Rota | Protegida | Descrição |
|---|---|---|---|
| POST | `/auth/cadastrar` | Não | Cadastra um novo usuário |
| POST | `/auth/login` | Não | Autentica o usuário e retorna o token JWT |

**POST /auth/cadastrar**
```json
{
  "nm_usuario": "Arthur",
  "ds_email": "arthur@email.com",
  "ds_senha": "123456"
}
```

**POST /auth/login**
```json
{
  "ds_email": "arthur@email.com",
  "ds_senha": "123456"
}
```
Resposta:
```json
{ "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." }
```

---

### Filmes

| Método | Rota | Protegida | Descrição |
|---|---|---|---|
| GET | `/filmes/buscar?q=` | Não | Busca filmes no TMDB e salva no banco automaticamente, vinculando os gêneros |
| GET | `/filmes` | Não | Lista os filmes já salvos no banco |
| GET | `/filmes?genero=` | Não | Lista os filmes filtrados por gênero |

**GET /filmes/buscar?q=batman**

Retorna a lista de filmes encontrados no TMDB, já salvos no banco local para consultas futuras sem nova chamada à API externa.

**GET /filmes?genero=Ação**

Retorna os filmes do banco vinculados ao gênero informado.

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
| PUT | `/avaliacoes/:id_avaliacao` | Sim | Edita uma avaliação existente |
| DELETE | `/avaliacoes/:id_avaliacao` | Sim | Remove uma avaliação |

**POST /avaliacoes**
```json
{
  "id_filme": 8,
  "nr_nota": 9,
  "ds_comentario": "Um dos melhores filmes do Batman"
}
```

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

**POST /listas**
```json
{
  "nm_lista": "Favoritos de Batman",
  "ds_lista": "Meus filmes favoritos do morcego",
  "is_visibilidade": true
}
```

**POST /listas/filmes**
```json
{
  "id_lista": 1,
  "id_filme": 8
}
```

**Regras de negócio:**
- Uma lista pertence a um único usuário
- Um filme pode estar em várias listas, inclusive de usuários diferentes
- Listas privadas (`is_visibilidade: false`) só podem ser visualizadas pelo próprio dono

---

### Ranking

| Método | Rota | Protegida | Descrição |
|---|---|---|---|
| GET | `/ranking?limit=` | Não | Retorna os filmes mais bem avaliados pela comunidade |

**GET /ranking?limit=10**

Calcula a média das notas e o total de avaliações de cada filme, ordenando do mais bem avaliado para o pior. Filmes sem nenhuma avaliação não aparecem no ranking.

---

## Modelo de dados

```
TB_Usuario 1─N TB_Lista N─N TB_Filme N─N TB_Genero
    │                          │
    └──────────N TB_Avaliacao──┘
```

- Um usuário pode ter muitas listas e muitas avaliações
- Uma lista pode conter muitos filmes, e um filme pode estar em muitas listas (`TB_Lista_Filme`)
- Um filme pode ter muitos gêneros, e um gênero pode pertencer a muitos filmes (`TB_Filme_Genero`)
- Um filme pode ter muitas avaliações, mas cada usuário só pode avaliar um mesmo filme uma vez

---

## Status de erro

| Código | Significado |
|---|---|
| 400 | Dados inválidos ou incompletos |
| 401 | Token ausente, inválido ou expirado |
| 403 | Acesso negado (ex: lista privada de outro usuário) |
| 404 | Recurso não encontrado |
| 409 | Conflito (ex: email já cadastrado, avaliação duplicada) |
| 500 | Erro interno do servidor |

---

## Autor

Desenvolvido por Arthur como projeto de estudo e portfólio em desenvolvimento fullstack.