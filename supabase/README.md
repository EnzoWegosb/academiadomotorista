# Back-end (Supabase)

| arquivo | o que é |
|---|---|
| `schema.sql` | tabelas, RLS, funções (RPC) e o gatilho da senha. Idempotente. |
| `functions/gestao-motoristas/index.ts` | Edge Function: criar, atualizar, senha, desativar, reativar, novo convite. Só supervisor. |
| `aplica.py` | aplica tudo pela API de gestão: `esquema conteudo auth funcao supervisor` (ou `tudo`). |
| `exemplos.py` | cria/remove 10 motoristas fictícios marcados como EXEMPLO. |

Credenciais: `.env` na raiz (modelo em `.env.example`).

## Regras
- **O navegador só lê.** Nenhuma política de insert/update/delete para o app.
- **Gabarito em `privado.gabarito`**, esquema não exposto pela API. `enviar_quiz`
  corrige no servidor e só devolve o gabarito ao aprovado.
- **Tempo de vídeo** (`registrar_video`): no máximo 2× o tempo real entre dois
  registros, ≤ 30 s por chamada, ≤ duração da aula. `enviar_quiz` recusa com
  `VIDEO_INCOMPLETO` abaixo de 95 %.
- **Senha imutável pelo motorista.** O Supabase deixa qualquer usuário trocar a
  própria senha pela API — mesmo com "reautenticação" ligada, pois sessão recente
  dispensa. Um gatilho em `auth.users` recusa a troca para motoristas, exceto
  quando a Edge Function autorizou 60 s antes (`autorizar_troca_senha`, só `service_role`).
- **Login por usuário:** e-mail interno `<usuario>@academia-motorista.invalid`.
  `.invalid` é reservado (RFC 2606): ninguém registra, nenhum e-mail de
  recuperação chega a estranhos.
- **Supervisor de exemplo** (`perfis.exemplo = true`): só enxerga e gerencia
  motoristas marcados como EXEMPLO ou criados por ele; o que ele cria nasce marcado.
- **Modo demonstração** (`config.modo_demo`): 1 habilita "Adiantar aula"
  (registrado em `progresso.aula_adiantada`); 0 desliga o botão e a RPC.

## Armadilhas
- SQL pela API de gestão: monte o JSON em código — pelo shell as aspas somem.
- `GET /rest/v1/` com a chave publicável dá 401 (ela não lê o esquema). Normal.
- `.schema('privado')` não funciona na Edge Function (esquema não exposto) —
  daí a RPC `autorizar_troca_senha`.
- YouTube erro 153 em `file://`: sirva o HTML por http(s).
