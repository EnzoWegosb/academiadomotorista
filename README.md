# Academia do Motorista

Plataforma de treinamento para motoristas recém-chegados a uma operação de
mobilidade. O supervisor convida cada motorista por um link; o motorista assiste
às aulas em vídeo e faz um quiz por módulo; a supervisão acompanha tudo em tempo
real. Feito com [Anycast](https://anycast.excom.ai).

- **Front-end:** um único HTML (sem framework, sem CDN) gerado por `src/build.py`.
- **Back-end:** [Supabase](https://supabase.com) — Postgres com RLS, funções no
  banco (RPC) e uma Edge Function para a gestão de motoristas.
- **Vídeos:** YouTube incorporado (IFrame API).

## Como funciona

1. O supervisor cadastra o motorista (nome, senha, CPF, CNH, veículo…) e recebe
   uma mensagem pronta com o link de convite, o usuário e a senha.
2. O motorista abre o link, confirma o nome e digita a senha. Os dados dele são
   imutáveis para ele — só a supervisão altera, inclusive a senha.
3. Cada módulo: vídeo → quiz de 4 perguntas → aprovado com 70 %. Reprovado não
   vê o gabarito e pode tentar de novo.
4. O supervisor vê progresso do vídeo, status, notas, tentativas, aproveitamento
   (nota na 1ª tentativa), primeiro acesso e última atividade.

## Aulas criadas pelo supervisor

Em **Aulas → Nova aula** o supervisor escolhe o vídeo (link do YouTube ou arquivo
MP4/WebM/MOV de até 50 MB, guardado no bucket privado `aulas`), dá título, define
quem recebe (todos ou motoristas escolhidos) e cadastra as perguntas (2 a 5
alternativas cada). O botão **Gerar com IA** escreve um rascunho de quiz a partir
da transcrição/resumo colado, da legenda ou da descrição do YouTube — exige o
segredo `ANTHROPIC_API_KEY` na Edge Function `gerar-perguntas`. Aula com
tentativas registradas não muda vídeo nem perguntas.

## Regras garantidas pelo banco (não pela tela)

| Regra | Onde |
|---|---|
| O navegador só lê; toda escrita passa por RPC `security definer` ou pela Edge Function | RLS sem políticas de escrita |
| Gabarito fora da API, corrigido no servidor; só volta ao aprovado | esquema `privado`, `enviar_quiz` |
| Tempo de vídeo creditado pelo servidor (≤ 2× o tempo real) e exigido para o quiz | `registrar_video`, `enviar_quiz` |
| Motorista não troca a própria senha (o Supabase permite por padrão) | gatilho em `auth.users` |
| Cadastro público desligado — contas só pela supervisão | config de Auth + Edge Function |
| Supervisor de exemplo só enxerga motoristas de exemplo | `pode_ver_motorista` + Edge Function |
| "Adiantar aula" só com `config.modo_demo = 1`, e fica registrado | `adiantar_aula` |

Detalhes em [`supabase/README.md`](supabase/README.md).

## Instalação

```bash
cp .env.example .env          # preencha — o .env NUNCA vai para o git
python3 supabase/aplica.py tudo      # tabelas, regras, conteúdo, Auth, função, conta "supervisor"
python3 src/build.py                 # gera dist/index.html
```

Publique o conteúdo de `dist/` em qualquer servidor **https**. Aberto direto do
disco (`file://`) o YouTube recusa tocar os vídeos (erro 153).

## Deploy no Cloudflare Workers

O `wrangler.jsonc` publica `dist/` como arquivos estáticos (sem código de Worker):
`/` entrega o `index.html`, `/index.html` redireciona para `/` e qualquer outro
caminho também devolve a aplicação. O `wrangler deploy` roda `python3 src/build.py`
antes de publicar — o `dist/` não fica no repositório.

**Pelo painel (deploy a cada push no GitHub):** Workers & Pages → Create → Import a
repository → este repositório. Em *Settings → Build → Variables and secrets*,
cadastre as duas variáveis que o build usa:

| variável | valor |
|---|---|
| `SUPABASE_URL` | `https://SEU-PROJETO.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | a chave **publicável** (`sb_publishable_…`) |

Só essas duas. A chave secreta e o token do Supabase **não** vão para o
Cloudflare: são usados apenas pelos scripts de administração, na sua máquina.

**Pela linha de comando** (Node 22+, com o `.env` preenchido):

```bash
npx wrangler login
npx wrangler deploy
```

Depois do primeiro deploy, os links de convite passam a usar o endereço do
Worker automaticamente (eles são montados a partir da página aberta).

Opcional: `python3 supabase/exemplos.py criar` cria 10 motoristas fictícios, um em
cada ponto da trilha (`remover` apaga só esses).

## Testes

```bash
pip install playwright && playwright install chromium
python3 tests/t_backend.py          # regras de segurança contra o banco real
python3 src/build.py && python3 tests/t_sistema.py [url]   # ponta a ponta no navegador
```

Os testes criam contas temporárias e as apagam no fim, mesmo se falharem.

## Segredos

Nenhuma chave, token ou senha está neste repositório — tudo vem do `.env`.
Antes de cada commit:

```bash
python3 ferramentas/verifica_segredos.py
```

A única chave que vai para o HTML é a **publicável** (`sb_publishable_…`), que é
pública por design: quem protege os dados são as regras do banco.

## Estrutura

```
src/app/        telas, cliente do Supabase, player (JS/CSS)
src/build.py    monta o HTML único em dist/index.html
wrangler.jsonc  deploy no Cloudflare Workers (assets estáticos de dist/)
src/dados.py    conteúdo dos treinamentos (vídeos e quizzes)
supabase/       esquema SQL, Edge Function, aplicação e exemplos
tests/          testes do banco e de ponta a ponta
ferramentas/    verificação de segredos
```
