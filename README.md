# CineTrack API — Backend

API REST para uma plataforma de avaliação de filmes, onde usuários podem buscar filmes, avaliá-los, criar listas personalizadas, gerenciar seus perfis com fotos e preferências, e visualizar rankings baseados nas avaliações ponderadas da comunidade.

Projeto desenvolvido como estudo prático e portfólio de backend, integrando autenticação segura com verificação de email, versionamento de sessões/tokens, consumo dinâmico da API do TMDB em tempo real, modelagem relacional completa, cálculo Bayesiano de notas, e boas práticas de segurança defensiva (rate limiting multinível, headers HTTP com Helmet, tratamento centralizado de erros e controle de tamanho de payload).

---

## Tecnologias

- **Node.js** + **Express** — servidor HTTP e roteamento
- **MySQL** (`mysql2/promise`) — banco de dados relacional com pool de conexões
- **JWT** (`jsonwebtoken`) — autenticação sem estado com validação de versão de sessão
- **bcrypt** — hash de senhas (salt rounds: 10)
- **Axios** — consumo da API do TMDB (The Movie Database)
- **Nodemailer** (via Gmail SMTP + senha de app) — envio de emails transacionais (verificação de cadastro, recuperação de senha e troca de email)
- **Helmet** — headers HTTP defensivos
- **express-rate-limit** — proteção contra força bruta e sobrecarga em 3 camadas
- **TMDB API** — catálogo de filmes e gêneros consultado em tempo real com enriquecimento local

---

## Arquitetura

Arquitetura em camadas (MVC adaptado para API REST):

```
cinetrack-api/
├── .env                       # Variáveis de ambiente locais
├── server.js                  # Ponto de entrada: único responsável por app.listen()
└── src/
    ├── app.js                 # Montagem do Express, middlewares, cors, rate limiters e rotas
    ├── config/
    │   └── database.js        # Pool de conexões MySQL (mysql2/promise)
    ├── controllers/           # Lógica de negócio e queries SQL
    │   ├── authController.js       # Cadastro, login, verificação de email e recuperação de senha
    │   ├── usuarioController.js    # Perfil, bio, foto base64, troca de email/senha e exclusão
    │   ├── filmeController.js      # Integração TMDB, busca, filtros de lançamento, ordenação e cache
    │   ├── generoController.js     # Sincronização de gêneros TMDB e listagem local
    │   ├── avaliacaoController.js  # CRUD de avaliações de filmes
    │   ├── listaController.js      # CRUD de listas, adição/remoção de filmes e duração assíncrona
    │   └── rankingController.js    # Ranking comunitário ponderado
    ├── middlewares/
    │   ├── authMiddleware.js       # Validação de Bearer JWT e checagem de versão de sessão
    │   └── errorMiddleware.js      # Tratamento centralizado de erros (MySQL, payload 413, JSON inválido)
    ├── routes/                # Definição e mapeamento dos endpoints
    │   ├── authRoutes.js           # /auth (recebe limiteAuth injetado)
    │   ├── usuarioRoutes.js        # /usuarios (recebe limiteConta injetado)
    │   ├── filmeRoutes.js          # /filmes
    │   ├── generoRoutes.js         # /generos
    │   ├── avaliacaoRoutes.js      # /avaliacoes
    │   ├── listaRoutes.js          # /listas
    │   └── rankingRoutes.js        # /ranking
    ├── scripts/
    │   └── seedFilmes.js      # Popula o banco com filmes populares em alta (execução manual)
    └── services/
        ├── emailService.js    # Transporter do Nodemailer + templates HTML dark mode
        ├── tokenService.js    # Geração e versionamento de tokens JWT
        └── notaService.js     # Média Bayesiana unificada entre TMDB e avaliações locais
```

> **Separação `app.js` e `server.js`**: `app.js` apenas monta os middlewares, rotas e tratamento de erros, exportando a instância do Express. `server.js` importa essa instância e é o único arquivo responsável por iniciar o servidor na porta configurada (`app.listen`).

---

## Como rodar o projeto

### Pré-requisitos
- **Node.js** instalado (versão 18+)
- **MySQL** instalado e em execução
- Uma chave de API do [TMDB](https://www.themoviedb.org/settings/api)
- Uma conta Gmail com **verificação em 2 etapas ativada**, para gerar uma [senha de app](https://myaccount.google.com/apppasswords)

### Instalação

```bash
git clone https://github.com/arthurguerraa/cinetrack-api.git
cd cinetrack-api
npm install
```

### Configuração do `.env`

Crie um arquivo `.env` na raiz do projeto com as seguintes variáveis:

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=sua_senha
DB_NAME=db_cinetrack
DB_PORT=3306

PORT=3000
JWT_SECRET=sua_chave_secreta_jwt_longa_e_aleatoria

TMDB_API_KEY=sua_chave_do_tmdb

EMAIL_USER=seuemail@gmail.com
EMAIL_APP_PASSWORD=senha_de_app_de_16_caracteres
```

> `JWT_SECRET` pode ser gerado no terminal com:
> ```bash
> node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
> ```

### Banco de Dados e Inicialização

1. Execute o script de criação das tabelas no MySQL (disponível na seção [Modelo de dados](#modelo-de-dados)).
2. Inicie o servidor em modo de desenvolvimento:
   ```bash
   npm run dev
   ```
3. *(Opcional, mas recomendado)* Execute o script de seed para popular os gêneros e os filmes em alta iniciais:
   ```bash
   node src/scripts/seedFilmes.js
   ```

O servidor estará rodando em `http://localhost:3000`.

---

## Segurança e Controle de Sessão

### Autenticação & Versionamento de Tokens
Rotas protegidas exigem o cabeçalho:
```http
Authorization: Bearer <seu_token>
```
O token JWT tem validade de **7 dias** e contém `{ id_usuario, nm_usuario, ds_email, versao }`.

- **Invalidação Global de Sessões**: O banco armazena a coluna `nr_versao_token` em `TB_Usuario`. A cada alteração de senha ou confirmação de troca de email, esse número é incrementado. O `authMiddleware` valida se a versão no token corresponde à do banco; caso haja divergência, a requisição é rejeitada com `401 Sessão encerrada. Faça login novamente.`, deslogando todos os outros dispositivos automaticamente.

### Rate Limiting em 3 Níveis
Configurado via `express-rate-limit` para evitar abuso e ataques de força bruta:
1. **Geral (`limiteGeral`)**: 100 requisições por IP a cada 15 minutos em toda a API.
2. **Autenticação (`limiteAuth`)**: 10 tentativas por IP a cada 15 minutos em rotas de `/auth` (login, cadastro, recuperação de senha).
3. **Conta Sensível (`limiteConta`)**: 10 tentativas por IP a cada 15 minutos em rotas críticas de `/usuarios` (alteração de senha, solicitação/confirmação de troca de email, exclusão de conta).

`app.set('trust proxy', 1)` está ativado para captura precisa do IP real em ambientes de proxy reverso (Render, Railway, Nginx, etc.).

### Headers HTTP & Payload
- **Helmet**: Configurado globalmente com `crossOriginResourcePolicy: false` para permitir consumo de recursos pelo frontend em origens distintas.
- **Limite do Body JSON**: `express.json({ limit: '300kb' })` para permitir upload seguro de fotos de perfil em base64.
- **CORS**: Liberado em desenvolvimento para permitir testes locais diretos via `file://` (origem `null`). Deve ser restringido ao domínio oficial no deploy em produção.

---

## Envio de Emails Transacionais

O envio de emails utiliza o **Nodemailer** integrado ao SMTP do Gmail com senha de aplicativo:
- Funciona sem necessidade de domínio próprio verificado.
- Verificação defensiva de rejeição (`info.rejected`) que lança exceção imediata caso o destinatário seja recusado pelo servidor de email.
- **Templates Dark Mode Responsivos**: Design unificado com código de 6 dígitos em destaque monospace com validade de 15 minutos para:
  - Confirmação de cadastro (`enviarCodigoVerificacao`)
  - Redefinição de senha (`enviarCodigoRecuperacao`)
  - Confirmação de troca de email para o novo endereço (`enviarCodigoNovoEmail`)

---

## Endpoints da API

### 1. Autenticação (`/auth`)
*Protegidas por `limiteAuth` (10 tentativas / 15 min).*

| Método | Rota | Protegida | Descrição |
|---|---|---|---|
| POST | `/auth/cadastrar` | Não | Cadastra usuário e envia código de verificação por email |
| POST | `/auth/login` | Não | Realiza login; retorna 403 se email não foi verificado |
| POST | `/auth/verificar` | Não | Valida código de 6 dígitos e retorna token (login automático) |
| POST | `/auth/reenviar-codigo` | Não | Reenvia código de verificação de cadastro |
| POST | `/auth/esqueci-senha` | Não | Envia código para redefinição de senha |
| POST | `/auth/redefinir-senha` | Não | Valida código e define nova senha; retorna novo token |

**POST /auth/cadastrar**
```json
{
  "nm_usuario": "Arthur",
  "ds_email": "arthur@email.com",
  "ds_senha": "senhaSegura123"
}
```
> Se o email já estiver cadastrado porém **não verificado**, o cadastro é atualizado e um novo código é reenviado em vez de bloquear com 409, evitando travamento de fluxo do usuário.

---

### 2. Usuários e Perfil (`/usuarios`)
*Todas as rotas exigem autenticação (`Bearer <token>`). Ações sensíveis passam por `limiteConta`.*

| Método | Rota | Rate Limit | Descrição |
|---|---|---|---|
| GET | `/usuarios/me` | Geral | Retorna dados do perfil do usuário logado (nome, email, bio, foto, criação) |
| PUT | `/usuarios/bio` | Geral | Atualiza a bio (máx 160 caracteres; string vazia ou nulo remove) |
| PUT | `/usuarios/foto` | Geral | Atualiza foto de perfil (Data URL base64 JPEG/PNG/WebP, máx ~110 KB) |
| DELETE | `/usuarios/foto` | Geral | Remove a foto de perfil |
| GET | `/usuarios/me/avaliacoes` | Geral | Histórico paginado de avaliações do usuário com ordenação |
| GET | `/usuarios/me/listas` | Geral | Resumo de todas as listas do usuário com contagem agregada de filmes |
| PUT | `/usuarios/nome` | Geral | Atualiza nome de exibição e retorna novo JWT atualizado |
| PUT | `/usuarios/senha` | Conta | Altera senha (exige senha atual, valida formato e desloga outros dispositivos) |
| POST | `/usuarios/email/solicitar` | Conta | Inicia troca de email; valida senha e envia código de 6 dígitos ao novo email |
| POST | `/usuarios/email/reenviar` | Conta | Reenvia código de confirmação para o email pendente |
| POST | `/usuarios/email/confirmar` | Conta | Confirma código, atualiza o email, descarta pendências e retorna novo JWT |
| DELETE | `/usuarios` | Conta | Exclui a conta mediante confirmação da senha atual (remove dados em cascata) |

**GET /usuarios/me/avaliacoes**
Query params aceitos:
- `limit`: quantidade por página (padrão 10, máx 100)
- `offset`: deslocamento de paginação (padrão 0)
- `ordem`: critério de ordenação (`recentes`, `antigas`, `maior_nota`, `menor_nota`, `titulo`)

Exemplo de resposta:
```json
{
  "data": [
    {
      "id_avaliacao": 15,
      "nr_nota": "9.5",
      "ds_comentario": "Obra-prima do cinema moderno.",
      "created_at": "2026-11-20T14:32:00.000Z",
      "id_filme": 42,
      "nm_filme": "Interestelar",
      "ds_poster": "https://image.tmdb.org/t/p/w500/...",
      "dt_lancamento": 2014
    }
  ],
  "pagination": {
    "total": 35,
    "limit": 10,
    "offset": 0,
    "hasMore": true
  }
}
```

---

### 3. Filmes (`/filmes`)
*Consulta ao vivo ao TMDB com enriquecimento de notas locais e cache sob demanda.*

| Método | Rota | Protegida | Descrição |
|---|---|---|---|
| GET | `/filmes/populares?page=&ordem=` | Não | Filmes em alta na semana ou ordenados globalmente via Discover |
| GET | `/filmes/genero?nome=&page=&ordem=` | Não | Filmes de um gênero específico via TMDB Discover |
| GET | `/filmes/buscar?q=&page=&ordem=` | Não | Busca por termo com fallback `pt-BR` $\rightarrow$ `en-US` |

#### Funcionalidades do Catálogo:
- **Apenas Filmes Lançados**: Todos os endpoints filtram filmes cuja data de estreia ainda não ocorreu (`release_date <= hoje`, considerando o fuso horário `America/Sao_Paulo`).
- **Critérios de Ordenação (`ordem`)**:
  - `maior_nota`: ordenação com filtro de relevância do TMDB (`vote_count.gte >= 200`) para evitar distorções de filmes com nota 10 baseada em 1 único voto.
  - `menor_nota`: ordenação crescente com o mesmo filtro de relevância.
  - `lancamento_recentes`: filmes mais novos lançados até a data atual.
  - `lancamento_antigos`: clássicos mais antigos.
  - `titulo`: ordenação alfabética por página.
- **Nota Combinada**: Toda listagem anexa dinamicamente `nota` (média combinada entre TMDB e notas locais da comunidade), `nota_tmdb` e `total_avaliacoes`.

Exemplo de retorno:
```json
{
  "data": [
    {
      "id_filme": 8,
      "titulo": "Batman: O Cavaleiro das Trevas",
      "sinopse": "Com a ajuda de Jim Gordon e Harvey Dent...",
      "ano": "2008",
      "nota": 8.7,
      "nota_tmdb": 8.5,
      "total_avaliacoes": 14,
      "poster": "https://image.tmdb.org/t/p/w500/..."
    }
  ],
  "pagination": {
    "page": 1,
    "totalPages": 25,
    "hasNext": true,
    "hasPrev": false
  },
  "ordenacao": "global"
}
```

---

### 4. Gêneros (`/generos`)

| Método | Rota | Protegida | Descrição |
|---|---|---|---|
| POST | `/generos/sincronizar` | Não | Sincroniza gêneros do TMDB com o banco local (idêntico ao do seed) |
| GET | `/generos` | Não | Lista todos os gêneros salvos no banco local em ordem alfabética |

---

### 5. Avaliações (`/avaliacoes`)
*Todas as rotas exigem autenticação (`Bearer <token>`).*

| Método | Rota | Protegida | Descrição |
|---|---|---|---|
| POST | `/avaliacoes` | Sim | Avalia um filme (nota de 1 a 10, comentário opcional) |
| GET | `/avaliacoes/minhas` | Sim | Lista todas as avaliações do usuário logado ordenadas por data |
| PUT | `/avaliacoes/:id_avaliacao` | Sim | Edita nota ou comentário de uma avaliação existente (apenas o autor) |
| DELETE | `/avaliacoes/:id_avaliacao` | Sim | Remove uma avaliação (apenas o autor) |

**Regras de negócio:**
- Nota deve ser um decimal entre 1 e 10.
- Cada usuário só pode avaliar cada filme uma única vez (garantido por validação e constraint `UNIQUE (id_usuario, id_filme)`).
- Apenas o criador da avaliação possui autorização para editá-la ou excluí-la.

---

### 6. Listas Personalizadas (`/listas`)
*Todas as rotas exigem autenticação (`Bearer <token>`).*

| Método | Rota | Protegida | Descrição |
|---|---|---|---|
| POST | `/listas` | Sim | Cria uma nova lista personalizada (pública ou privada) |
| GET | `/listas` | Sim | Lista todas as listas do usuário logado |
| GET | `/listas/:id_lista/filmes` | Sim | Retorna detalhes da lista, filmes enriquecidos, gêneros e durações |
| POST | `/listas/filmes` | Sim | Adiciona um filme a uma lista |
| DELETE | `/listas/:id_lista/filmes/:id_filme` | Sim | Remove um filme específico de uma lista |
| PUT | `/listas/:id_lista` | Sim | Edita metadados da lista (nome, descrição, visibilidade) |
| DELETE | `/listas/:id_lista` | Sim | Remove uma lista e seus vínculos automaticamente |

#### Recursos Especiais na Página da Lista (`GET /listas/:id_lista/filmes`):
- **Privacidade**: Listas privadas (`is_visibilidade = false`) retornam `403` para qualquer usuário que não seja o dono.
- **Informações do Dono e Autoria**: Retorna `is_dono` e `nm_dono`.
- **Gêneros e Notas Combinadas**: Cada filme traz seu array de `generos`, `nota_combinada` e `total_avaliacoes`.
- **Status de Assistido / Avaliação Integrada**: Se o usuário logado for o dono da lista, cada filme traz:
  - `is_assistido`: booleano indicando se o usuário já avaliou o filme.
  - `minha_avaliacao`: `{ id_avaliacao, nr_nota, ds_comentario }` (ou `null`).
  - `dt_assistido`: timestamp da avaliação.
- **Duração em Segundo Plano**: A API dispara a busca assíncrona da duração em minutos dos filmes no TMDB (`nr_duracao` em `TB_Filme`) sem travar a resposta, retornando `duracoes_pendentes` para atualização posterior pelo cliente.

---

### 7. Ranking Comunitário Ponderado (`/ranking`)

| Método | Rota | Protegida | Descrição |
|---|---|---|---|
| GET | `/ranking?limit=` | Não | Retorna o ranking calibrado (padrão 10, máx 50 filmes) |

#### Fórmula de Regularização Bayesiana (`notaService.js`):
Para evitar distorções onde um filme com pouquíssimas avaliações extremas supere clássicos consolidados, a nota final utiliza uma média Bayesiana ponderada:

$$NotaFinal = \left(\frac{TotalLocal}{TotalLocal + 10}\right) \times MediaLocal + \left(\frac{10}{TotalLocal + 10}\right) \times NotaTMDB$$

- **`PESO_MINIMO_AVALIACOES = 10`**: A comunidade precisa de 10 avaliações locais no CineTrack para que sua nota tenha peso equivalente (50%) à nota da API do TMDB.
- **Tratamento de Exceções**: Se o filme não tiver avaliações locais, utiliza 100% da nota do TMDB. Se o TMDB tiver nota 0 (filme sem votos), utiliza a média local pura.

---

## Modelo de Dados (MySQL)

```
TB_Usuario (1) ─── (N) TB_Lista (N) ─── (N) TB_Filme (N) ─── (N) TB_Genero
    │                                          │
    └──────────────── (N) TB_Avaliacao (1) ────┘
```

### Script DDL Completo

```sql
CREATE DATABASE IF NOT EXISTS db_cinetrack
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE db_cinetrack;

-- 1. Usuários
CREATE TABLE IF NOT EXISTS TB_Usuario (
  id_usuario INT AUTO_INCREMENT PRIMARY KEY,
  nm_usuario VARCHAR(100) NOT NULL,
  ds_email VARCHAR(150) NOT NULL UNIQUE,
  ds_senha VARCHAR(255) NOT NULL,
  is_verificado BOOLEAN NOT NULL DEFAULT FALSE,
  cd_verificacao VARCHAR(6) NULL,
  dt_expiracao_codigo DATETIME NULL,
  cd_recuperacao VARCHAR(6) NULL,
  dt_expiracao_recuperacao DATETIME NULL,
  ds_foto MEDIUMTEXT NULL,
  ds_bio VARCHAR(160) NULL,
  nr_versao_token INT NOT NULL DEFAULT 0,
  ds_email_pendente VARCHAR(150) NULL,
  cd_troca_email VARCHAR(6) NULL,
  dt_expiracao_troca_email DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Filmes (Cache relacional inteligente de apoio)
CREATE TABLE IF NOT EXISTS TB_Filme (
  id_filme INT AUTO_INCREMENT PRIMARY KEY,
  nm_filme VARCHAR(100) NOT NULL,
  ds_sinopse TEXT NOT NULL,
  dt_lancamento YEAR NOT NULL,
  nr_nota_media DECIMAL(3,1) NOT NULL DEFAULT 0.0,
  ds_poster VARCHAR(255) NULL,
  nr_duracao INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Gêneros
CREATE TABLE IF NOT EXISTS TB_Genero (
  id_genero INT AUTO_INCREMENT PRIMARY KEY,
  nm_genero VARCHAR(50) NOT NULL,
  id_tmdb INT UNIQUE NOT NULL
);

-- 4. Associação Filme-Gênero (N:N)
CREATE TABLE IF NOT EXISTS TB_Filme_Genero (
  id_filme INT NOT NULL,
  id_genero INT NOT NULL,
  PRIMARY KEY (id_filme, id_genero),
  FOREIGN KEY (id_filme) REFERENCES TB_Filme(id_filme) ON DELETE CASCADE,
  FOREIGN KEY (id_genero) REFERENCES TB_Genero(id_genero) ON DELETE CASCADE
);

-- 5. Avaliações
CREATE TABLE IF NOT EXISTS TB_Avaliacao (
  id_avaliacao INT AUTO_INCREMENT PRIMARY KEY,
  nr_nota DECIMAL(3,1) NOT NULL CHECK (nr_nota BETWEEN 1 AND 10),
  ds_comentario TEXT NULL,
  id_usuario INT NOT NULL,
  id_filme INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_usuario_filme (id_usuario, id_filme),
  FOREIGN KEY (id_usuario) REFERENCES TB_Usuario(id_usuario) ON DELETE CASCADE,
  FOREIGN KEY (id_filme) REFERENCES TB_Filme(id_filme) ON DELETE CASCADE
);

-- 6. Listas Personalizadas
CREATE TABLE IF NOT EXISTS TB_Lista (
  id_lista INT AUTO_INCREMENT PRIMARY KEY,
  nm_lista VARCHAR(100) NOT NULL,
  ds_lista VARCHAR(255) NULL,
  is_visibilidade BOOLEAN NOT NULL DEFAULT TRUE,
  id_usuario INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_usuario) REFERENCES TB_Usuario(id_usuario) ON DELETE CASCADE
);

-- 7. Associação Lista-Filme (N:N)
CREATE TABLE IF NOT EXISTS TB_Lista_Filme (
  id_lista INT NOT NULL,
  id_filme INT NOT NULL,
  dt_adicionado TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id_lista, id_filme),
  FOREIGN KEY (id_lista) REFERENCES TB_Lista(id_lista) ON DELETE CASCADE,
  FOREIGN KEY (id_filme) REFERENCES TB_Filme(id_filme) ON DELETE CASCADE
);
```

> **Cascata (`ON DELETE CASCADE`)**: A exclusão de uma conta de usuário remove automaticamente todas as suas listas e avaliações. Da mesma forma, a remoção de uma lista limpa os registros correspondentes da tabela associativa `TB_Lista_Filme`.

---

## Status e Respostas de Erro

A API responde de forma semântica com payloads de erro padronizados no formato `{ "error": "Descrição clara do erro." }`:

| Código | Significado | Exemplo de Ocorrência |
|---|---|---|
| **400** | Dados inválidos ou incompletos | Parâmetros obrigatórios ausentes, JSON malformado, nota fora de 1-10 |
| **401** | Não autorizado / Token inválido | Token ausente, expirado ou sessão invalidada por alteração de senha |
| **403** | Acesso proibido | Email não verificado no login (`emailNaoVerificado: true`), acesso a lista privada de outro usuário |
| **404** | Não encontrado | Usuário, filme, lista ou avaliação inexistente |
| **409** | Conflito / Duplicidade | Email já cadastrado, filme repetido na mesma lista ou avaliação duplicada |
| **413** | Conteúdo grande demais | Payload JSON acima do limite permitido de 300 KB (foto muito pesada) |
| **429** | Muitas requisições | Rate limit excedido na API geral, nas tentativas de autenticação ou em ações de conta |
| **500** | Erro interno do servidor | Falha de conexão no banco ou erro inesperado |

---

## Melhorias Futuras

- [ ] Restringir o CORS ao domínio oficial do frontend em ambiente de produção
- [ ] Configuração de ambiente dinâmica para URL base da API no cliente
- [ ] Suíte de testes automatizados com Jest e Supertest
- [ ] Documentação interativa e interativa com Swagger / OpenAPI

---

## Autor

Desenvolvido por **Arthur Guerra** como projeto prático e portfólio de desenvolvimento backend e fullstack.

- GitHub: [github.com/arthurguerraa](https://github.com/arthurguerraa)
- LinkedIn: [linkedin.com/in/arthurguerraa](https://www.linkedin.com/in/arthurguerraa/)
