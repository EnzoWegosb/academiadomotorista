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
python3 src/build.py                 # gera dist/academia_do_motorista.html
```

Publique `dist/academia_do_motorista.html` em qualquer servidor **https**. Aberto
direto do disco (`file://`) o YouTube recusa tocar os vídeos (erro 153).

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
src/build.py    monta o HTML único em dist/
src/dados.py    conteúdo dos treinamentos (vídeos e quizzes)
supabase/       esquema SQL, Edge Function, aplicação e exemplos
tests/          testes do banco e de ponta a ponta
ferramentas/    verificação de segredos
```
