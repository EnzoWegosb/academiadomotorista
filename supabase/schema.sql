-- ============================================================================
-- Academia do Motorista — esquema no Supabase
--
-- PRINCÍPIO: o navegador só LÊ. Toda escrita passa por uma função do banco
-- (security definer) ou pela função de servidor `gestao-motoristas`, que usa a
-- chave secreta. Nenhuma tabela aceita insert/update/delete vindo do app.
--
-- Idempotente: pode ser reaplicado (aplica.py) sem perder dados.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- esquema privado
-- Não é exposto pela API REST. Guarda o gabarito e as autorizações de troca
-- de senha. Nenhum papel de API tem acesso.
create schema if not exists privado;
revoke all on schema privado from public, anon, authenticated;

-- ---------------------------------------------------------------- configuração
create table if not exists public.config (
  chave text primary key,
  valor numeric not null
);
insert into public.config values ('aprovacao', 70), ('limiar_video', 0.95)
  on conflict (chave) do nothing;
-- modo_demo = 1 habilita o botão "Adiantar aula" (pedido do cliente para
-- apresentações). Desligar: update public.config set valor = 0 where chave = 'modo_demo';
insert into public.config values ('modo_demo', 1) on conflict (chave) do nothing;

-- ---------------------------------------------------------------- perfis
-- Um por conta de login. `usuario` é o que a pessoa digita para entrar.
create table if not exists public.perfis (
  id         uuid primary key references auth.users(id) on delete cascade,
  papel      text not null check (papel in ('supervisor','motorista')),
  nome       text not null check (length(trim(nome)) >= 3),
  usuario    text not null unique check (usuario ~ '^[a-z0-9._-]{3,40}$'),
  criado_em  timestamptz not null default now()
);
-- supervisor de EXEMPLO (conta compartilhável para apresentar o sistema):
-- só enxerga e gerencia motoristas de exemplo e os que ele mesmo cadastrou.
alter table public.perfis add column if not exists exemplo boolean not null default false;
-- quem convidou (supervisores convidados por outro supervisor)
alter table public.perfis add column if not exists convidado_por uuid references public.perfis(id) on delete set null;

-- ---------------------------------------------------------------- motoristas
-- Cadastro feito pelo supervisor. O motorista lê, nunca altera.
create table if not exists public.motoristas (
  id                 uuid primary key references public.perfis(id) on delete cascade,
  cpf                text check (cpf is null or cpf ~ '^[0-9]{11}$'),
  telefone           text,
  email_contato      text,
  cidade             text,
  uf                 text check (uf is null or uf ~ '^[A-Z]{2}$'),
  cnh_categoria      text,
  cnh_validade       date,
  veiculo            text,
  placa              text,
  inicio             date,
  observacoes        text,
  ativo              boolean not null default true,
  convite_token      uuid not null unique default gen_random_uuid(),
  convite_criado_em  timestamptz not null default now(),
  primeiro_acesso_em timestamptz,
  ultimo_acesso_em   timestamptz,
  criado_por         uuid references public.perfis(id),
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now()
);

-- ---------------------------------------------------------------- conteúdo
create table if not exists public.modulos (
  id          text primary key,
  ordem       int  not null,
  titulo      text not null,
  curto       text not null,
  descricao   text not null,
  duracao_txt text not null,
  video_id    text not null,
  video_seg   int  not null check (video_seg > 0),
  fonte       text,
  tema        text,
  ativo       boolean not null default true
);

create table if not exists public.perguntas (
  id           bigserial primary key,
  modulo_id    text not null references public.modulos(id) on delete cascade,
  ordem        int  not null,
  enunciado    text not null,
  alternativas jsonb not null,
  unique (modulo_id, ordem)
);

-- O GABARITO não mora na tabela de perguntas: fica no esquema privado.
-- Assim o navegador recebe as perguntas sem receber as respostas.
create table if not exists privado.gabarito (
  pergunta_id bigint primary key references public.perguntas(id) on delete cascade,
  correta     int not null check (correta between 0 and 4)
);

-- ---------------------------------------------------------------- progresso
create table if not exists public.progresso (
  motorista_id       uuid not null references public.motoristas(id) on delete cascade,
  modulo_id          text not null references public.modulos(id) on delete cascade,
  status             text not null default 'nao_iniciado'
                     check (status in ('nao_iniciado','andamento','reprovado','concluido')),
  segundos           numeric not null default 0,   -- tempo de vídeo CREDITADO pelo servidor
  ultimo_heartbeat   timestamptz,
  video_concluido_em timestamptz,
  tentativas         int not null default 0,
  nota_primeira      int,                          -- base do aproveitamento
  nota_ultima        int,
  acertos_ultima     int,
  nota_aprovacao     int,
  iniciado_em        timestamptz,
  concluido_em       timestamptz,
  atualizado_em      timestamptz not null default now(),
  primary key (motorista_id, modulo_id)
);

create table if not exists public.tentativas (
  id           bigserial primary key,
  motorista_id uuid not null references public.motoristas(id) on delete cascade,
  modulo_id    text not null references public.modulos(id) on delete cascade,
  numero       int  not null,
  respostas    int[] not null,
  acertos      int  not null,
  total        int  not null,
  nota         int  not null,
  aprovado     boolean not null,
  enviado_em   timestamptz not null default now()
);
create index if not exists tentativas_mot_idx on public.tentativas (motorista_id, modulo_id);

-- aula liberada pelo botão "Adiantar aula" (modo demonstração), e não assistida
alter table public.progresso add column if not exists aula_adiantada boolean not null default false;

-- ---------------------------------------------------------------- autorização de troca de senha
-- A função de servidor grava aqui ANTES de trocar a senha de um motorista.
-- O gatilho em auth.users recusa qualquer troca sem essa autorização — é o que
-- impede o motorista de mudar a própria senha chamando a API de login direto.
create table if not exists privado.troca_senha_autorizada (
  usuario_id uuid primary key,
  valida_ate timestamptz not null
);

-- ============================================================================ funções auxiliares
create or replace function public.eh_supervisor()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.perfis where id = auth.uid() and papel = 'supervisor');
$$;

-- Quem pode ver os dados de um motorista (além dele mesmo):
--   supervisor comum → todos · supervisor de exemplo → só exemplos e os que ele criou
create or replace function public.pode_ver_motorista(p_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select case
    when not exists (select 1 from public.perfis where id = auth.uid() and papel = 'supervisor') then false
    when (select exemplo from public.perfis where id = auth.uid()) then
      exists (select 1 from public.motoristas m where m.id = p_id
              and (m.observacoes like 'EXEMPLO%' or m.criado_por = auth.uid()))
    else true
  end;
$$;

-- Supervisor enxerga os supervisores da MESMA classe (real com real, demonstração com demonstração)
create or replace function public.pode_ver_supervisor(p_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.perfis eu join public.perfis o on o.id = p_id
                 where eu.id = auth.uid() and eu.papel = 'supervisor' and o.papel = 'supervisor'
                   and eu.exemplo = o.exemplo);
$$;

create or replace function public.cfg(p_chave text)
returns numeric language sql stable security definer set search_path = ''
as $$ select valor from public.config where chave = p_chave $$;

-- motorista logado e ativo; erro caso contrário
create or replace function public._motorista_ativo()
returns uuid language plpgsql stable security definer set search_path = ''
as $$
declare v_id uuid := auth.uid(); v_ativo boolean;
begin
  select ativo into v_ativo from public.motoristas where id = v_id;
  if v_ativo is null then raise exception 'SOMENTE_MOTORISTA' using errcode = '42501'; end if;
  if not v_ativo     then raise exception 'MOTORISTA_INATIVO' using errcode = '42501'; end if;
  return v_id;
end $$;

-- ============================================================================ gatilho da senha
create or replace function privado.bloqueia_troca_senha()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.encrypted_password is distinct from old.encrypted_password
     and exists (select 1 from public.perfis where id = new.id and papel = 'motorista') then
    if not exists (select 1 from privado.troca_senha_autorizada
                   where usuario_id = new.id and valida_ate > now()) then
      raise exception 'A senha do motorista só pode ser alterada pelo supervisor'
        using errcode = '42501';
    end if;
    delete from privado.troca_senha_autorizada where usuario_id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists bloqueia_troca_senha on auth.users;
create trigger bloqueia_troca_senha
  before update of encrypted_password on auth.users
  for each row execute function privado.bloqueia_troca_senha();

-- Chamada só pela função de servidor (chave secreta), imediatamente antes de
-- trocar a senha de um motorista. Vale 60 segundos e é consumida pelo gatilho.
create or replace function public.autorizar_troca_senha(p_id uuid)
returns void language sql security definer set search_path = ''
as $$
  insert into privado.troca_senha_autorizada values (p_id, now() + interval '60 seconds')
  on conflict (usuario_id) do update set valida_ate = excluded.valida_ate;
$$;

-- gabarito aceita até 5 alternativas (a tabela antiga limitava a 4)
alter table privado.gabarito drop constraint if exists gabarito_correta_check;
alter table privado.gabarito add constraint gabarito_correta_check check (correta between 0 and 4);

-- ============================================================================ AULAS criadas pelo supervisor
-- Uma aula pode ter vídeo do YouTube ou arquivo próprio (bucket privado `aulas`)
-- e ser aberta a TODOS os motoristas ou só aos selecionados.
alter table public.modulos alter column video_id drop not null;
alter table public.modulos add column if not exists video_tipo text not null default 'youtube';
alter table public.modulos add column if not exists video_arquivo text;
alter table public.modulos add column if not exists publico text not null default 'todos';
alter table public.modulos add column if not exists criado_por uuid references public.perfis(id) on delete set null;
alter table public.modulos add column if not exists criado_em timestamptz not null default now();
do $$ begin
  alter table public.modulos add constraint modulos_video_tipo check (video_tipo in ('youtube','arquivo'));
exception when duplicate_object then null; end $$;
-- 'exemplos' = todos os motoristas de exemplo (é o "Todos" da conta de demonstração)
alter table public.modulos drop constraint if exists modulos_publico;
alter table public.modulos add constraint modulos_publico check (publico in ('todos','selecionados','exemplos'));

create table if not exists public.modulo_motoristas (
  modulo_id    text not null references public.modulos(id) on delete cascade,
  motorista_id uuid not null references public.motoristas(id) on delete cascade,
  primary key (modulo_id, motorista_id)
);
alter table public.modulo_motoristas enable row level security;

-- Quem enxerga uma aula:
--   supervisor comum → todas · supervisor de exemplo → as da base, as abertas a
--   todos e as que ele criou · motorista ativo → abertas a todos ou atribuídas a ele
create or replace function public.pode_ver_modulo(p_mod text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select case
    when exists (select 1 from public.perfis where id = auth.uid() and papel = 'supervisor' and not exemplo) then true
    -- conta de demonstração: trilha inicial, aulas abertas e as criadas por QUALQUER conta de demonstração
    when exists (select 1 from public.perfis where id = auth.uid() and papel = 'supervisor' and exemplo) then
      exists (select 1 from public.modulos m where m.id = p_mod
              and (m.criado_por is null or m.publico in ('todos','exemplos')
                   or exists (select 1 from public.perfis c where c.id = m.criado_por and c.exemplo)))
    else exists (select 1 from public.modulos m join public.motoristas d on d.id = auth.uid() and d.ativo
                 where m.id = p_mod and (m.publico = 'todos'
                   or (m.publico = 'exemplos' and coalesce(d.observacoes,'') like 'EXEMPLO%')
                   or exists (select 1 from public.modulo_motoristas x where x.modulo_id = m.id and x.motorista_id = d.id)))
  end;
$$;

drop policy if exists le_atribuicao on public.modulo_motoristas;
create policy le_atribuicao on public.modulo_motoristas for select to authenticated
  using (motorista_id = auth.uid() or public.pode_ver_motorista(motorista_id));

-- Salvar (criar ou editar) uma aula. Só supervisor. Validação completa aqui:
-- o navegador não é confiável.
create or replace function public.salvar_aula(p jsonb)
returns text language plpgsql security definer set search_path = ''
as $$
declare
  v_eu uuid := auth.uid(); v_ex boolean; v_id text := nullif(p->>'id','');
  v_tipo text := coalesce(p->>'video_tipo','youtube'); v_pub text := coalesce(p->>'publico','todos');
  v_seg int := (p->>'video_seg')::int; v_q jsonb; v_i int := 0; v_alts jsonb; v_cor int;
  v_tent int := 0; v_ant public.modulos; v_ordem int; v_mot uuid; v_nmot int := 0;
begin
  select exemplo into v_ex from public.perfis where id = v_eu and papel = 'supervisor';
  if v_ex is null then raise exception 'SOMENTE_SUPERVISOR' using errcode = '42501'; end if;

  if length(trim(coalesce(p->>'titulo',''))) < 3 then raise exception 'AULA_TITULO'; end if;
  if v_tipo not in ('youtube','arquivo') then raise exception 'AULA_VIDEO'; end if;
  if v_tipo = 'youtube' and coalesce(p->>'video_id','') !~ '^[A-Za-z0-9_-]{11}$' then raise exception 'AULA_VIDEO'; end if;
  if v_tipo = 'arquivo' and coalesce(p->>'video_arquivo','') !~ '^[a-f0-9-]{36}\.[a-z0-9]{2,5}$' then raise exception 'AULA_VIDEO'; end if;
  if v_seg is null or v_seg < 5 or v_seg > 6*3600 then raise exception 'AULA_DURACAO'; end if;
  if jsonb_typeof(p->'perguntas') <> 'array' or jsonb_array_length(p->'perguntas') not between 1 and 15 then
    raise exception 'AULA_PERGUNTAS'; end if;
  for v_q in select * from jsonb_array_elements(p->'perguntas') loop
    v_alts := v_q->'alternativas'; v_cor := (v_q->>'correta')::int;
    if length(trim(coalesce(v_q->>'enunciado',''))) < 5 or jsonb_typeof(v_alts) <> 'array'
       or jsonb_array_length(v_alts) not between 2 and 5 or v_cor is null
       or v_cor < 0 or v_cor >= jsonb_array_length(v_alts)
       or exists (select 1 from jsonb_array_elements_text(v_alts) a where length(trim(a)) = 0) then
      raise exception 'AULA_PERGUNTA_INVALIDA';
    end if;
  end loop;
  if v_pub not in ('todos','selecionados','exemplos') then raise exception 'AULA_PUBLICO'; end if;
  -- na conta de demonstração, "Todos" significa todos os motoristas de EXEMPLO
  -- (inclusive os futuros); motoristas reais nunca são alcançados por ela
  if v_ex and v_pub = 'todos' then v_pub := 'exemplos'; end if;

  if v_id is not null then
    select * into v_ant from public.modulos where id = v_id for update;
    if v_ant is null then raise exception 'AULA_INEXISTENTE'; end if;
    -- qualquer supervisor edita as aulas que enxerga (a conta de demonstração inclusive)
    if not public.pode_ver_modulo(v_id) then raise exception 'AULA_SEM_PERMISSAO' using errcode = '42501'; end if;
    -- A conta de demonstração pode editar uma aula aberta a todos, mas NÃO muda
    -- quem a recebe: restringir o público tiraria a aula dos motoristas reais.
    if v_ex and v_ant.publico = 'todos' then v_pub := 'todos'; end if;
    -- Aula com tentativas também pode ser editada. As notas já registradas
    -- ficam como estão; as mudanças valem para as próximas tentativas.
    update public.modulos set titulo = trim(p->>'titulo'), curto = left(trim(p->>'titulo'), 40),
      descricao = coalesce(trim(p->>'descricao'),''), video_tipo = v_tipo,
      video_id = case when v_tipo='youtube' then p->>'video_id' end,
      video_arquivo = case when v_tipo='arquivo' then p->>'video_arquivo' end,
      video_seg = v_seg, duracao_txt = greatest(1, round(v_seg/60.0))::int || ' min', publico = v_pub
    where id = v_id;
  else
    v_id := 'a' || substr(md5(random()::text || clock_timestamp()::text), 1, 9);
    select coalesce(max(ordem),0) + 1 into v_ordem from public.modulos;
    insert into public.modulos (id, ordem, titulo, curto, descricao, duracao_txt, video_id, video_seg,
                                fonte, tema, video_tipo, video_arquivo, publico, criado_por)
    values (v_id, v_ordem, trim(p->>'titulo'), left(trim(p->>'titulo'), 40), coalesce(trim(p->>'descricao'),''),
            greatest(1, round(v_seg/60.0))::int || ' min',
            case when v_tipo='youtube' then p->>'video_id' end, v_seg,
            case when v_tipo='youtube' then 'YouTube' else 'Vídeo próprio' end, null,
            v_tipo, case when v_tipo='arquivo' then p->>'video_arquivo' end, v_pub, v_eu);
  end if;

  if true then
    delete from public.perguntas where modulo_id = v_id;
    for v_q in select * from jsonb_array_elements(p->'perguntas') loop
      v_i := v_i + 1;
      with q as (insert into public.perguntas (modulo_id, ordem, enunciado, alternativas)
                 values (v_id, v_i, trim(v_q->>'enunciado'),
                         (select jsonb_agg(trim(a)) from jsonb_array_elements_text(v_q->'alternativas') a))
                 returning id)
      insert into privado.gabarito select id, (v_q->>'correta')::int from q;
    end loop;
  end if;

  delete from public.modulo_motoristas where modulo_id = v_id;
  if v_pub = 'selecionados' then
    for v_mot in select (jsonb_array_elements_text(coalesce(p->'motoristas','[]')))::uuid loop
      if public.pode_ver_motorista(v_mot) and exists (select 1 from public.motoristas where id = v_mot) then
        insert into public.modulo_motoristas values (v_id, v_mot) on conflict do nothing;
        v_nmot := v_nmot + 1;
      end if;
    end loop;
    if v_nmot = 0 then raise exception 'AULA_SEM_MOTORISTAS'; end if;
  end if;
  return v_id;
end $$;

-- Perguntas COM gabarito, para a tela de edição. Só supervisor (exemplo: só as dele).
create or replace function public.aula_para_editar(p_id text)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_ex boolean; v_m public.modulos;
begin
  select exemplo into v_ex from public.perfis where id = auth.uid() and papel = 'supervisor';
  if v_ex is null then raise exception 'SOMENTE_SUPERVISOR' using errcode = '42501'; end if;
  select * into v_m from public.modulos where id = p_id;
  if v_m is null then raise exception 'AULA_INEXISTENTE'; end if;
  if not public.pode_ver_modulo(p_id) then raise exception 'AULA_SEM_PERMISSAO' using errcode = '42501'; end if;
  return jsonb_build_object(
    'tentativas', (select count(*) from public.tentativas where modulo_id = p_id),
    'motoristas', coalesce((select jsonb_agg(motorista_id) from public.modulo_motoristas where modulo_id = p_id), '[]'),
    'perguntas', coalesce((select jsonb_agg(jsonb_build_object('enunciado', q.enunciado, 'alternativas', q.alternativas,
                   'correta', g.correta) order by q.ordem)
                 from public.perguntas q join privado.gabarito g on g.pergunta_id = q.id where q.modulo_id = p_id), '[]'));
end $$;

-- Arquivar / reativar uma aula (some para todos, o histórico fica)
create or replace function public.arquivar_aula(p_id text, p_ativo boolean)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_ex boolean; v_dono uuid;
begin
  select exemplo into v_ex from public.perfis where id = auth.uid() and papel = 'supervisor';
  if v_ex is null then raise exception 'SOMENTE_SUPERVISOR' using errcode = '42501'; end if;
  select criado_por into v_dono from public.modulos where id = p_id;
  if not found then raise exception 'AULA_INEXISTENTE'; end if;
  if v_ex and not exists (select 1 from public.perfis c where c.id = v_dono and c.exemplo) then
    raise exception 'AULA_SEM_PERMISSAO' using errcode = '42501'; end if;
  update public.modulos set ativo = p_ativo where id = p_id;
end $$;

-- ---------------------------------------------------------------- arquivos de vídeo
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('aulas', 'aulas', false, 52428800, array['video/mp4','video/webm','video/quicktime','video/ogg'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists aulas_envia on storage.objects;
create policy aulas_envia on storage.objects for insert to authenticated
  with check (bucket_id = 'aulas' and public.eh_supervisor());
drop policy if exists aulas_le on storage.objects;
create policy aulas_le on storage.objects for select to authenticated
  using (bucket_id = 'aulas' and (public.eh_supervisor() or exists (
    select 1 from public.modulos m where m.video_arquivo = name and m.ativo and public.pode_ver_modulo(m.id))));
drop policy if exists aulas_apaga on storage.objects;
create policy aulas_apaga on storage.objects for delete to authenticated
  using (bucket_id = 'aulas' and public.eh_supervisor() and owner_id = auth.uid()::text);

-- ============================================================================ RPC: convite
-- Chamada SEM login, pela página do convite. Devolve só nome e usuário.
create or replace function public.convite_info(p_token uuid)
returns table (nome text, usuario text, ativo boolean)
language sql stable security definer set search_path = ''
as $$
  select p.nome, p.usuario, m.ativo
  from public.motoristas m join public.perfis p on p.id = m.id
  where m.convite_token = p_token;
$$;

-- ============================================================================ RPC: acesso
create or replace function public.registrar_acesso()
returns void language sql security definer set search_path = ''
as $$
  update public.motoristas
     set ultimo_acesso_em = now(),
         primeiro_acesso_em = coalesce(primeiro_acesso_em, now())
   where id = auth.uid();
$$;

-- ============================================================================ RPC: vídeo
-- O navegador informa quantos segundos de vídeo avançou em reprodução contínua.
-- O SERVIDOR decide quanto credita: nunca mais que o dobro do tempo real que
-- passou desde o último registro (aceita assistir em até 2x), no máximo 30 s
-- por chamada, e nunca além da duração da aula. Mandar "600 segundos" de uma
-- vez, ou disparar chamadas em sequência, não adianta.
create or replace function public.registrar_video(p_modulo text, p_delta numeric)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_mot uuid := public._motorista_ativo();
  v_dur numeric; v_lim numeric := public.cfg('limiar_video');
  v_p public.progresso; v_gap numeric; v_cred numeric;
begin
  select video_seg into v_dur from public.modulos where id = p_modulo and ativo and public.pode_ver_modulo(p_modulo);
  if v_dur is null then raise exception 'MODULO_INEXISTENTE'; end if;

  insert into public.progresso (motorista_id, modulo_id) values (v_mot, p_modulo)
    on conflict do nothing;
  select * into v_p from public.progresso
   where motorista_id = v_mot and modulo_id = p_modulo for update;

  v_gap := extract(epoch from now() - coalesce(v_p.ultimo_heartbeat, now()));
  if v_p.ultimo_heartbeat is null or v_gap > 60 then
    v_cred := least(greatest(coalesce(p_delta,0), 0), 10);
  else
    v_cred := least(greatest(coalesce(p_delta,0), 0), 30, v_gap * 2);
  end if;
  v_cred := greatest(least(v_cred, v_dur - v_p.segundos), 0);

  update public.progresso set
    segundos         = segundos + v_cred,
    ultimo_heartbeat = now(),
    status           = case when status = 'nao_iniciado' then 'andamento' else status end,
    iniciado_em      = coalesce(iniciado_em, now()),
    video_concluido_em = case when video_concluido_em is null
                               and segundos + v_cred >= v_lim * v_dur then now()
                              else video_concluido_em end,
    atualizado_em    = now()
  where motorista_id = v_mot and modulo_id = p_modulo
  returning * into v_p;

  return jsonb_build_object(
    'segundos', v_p.segundos, 'duracao', v_dur, 'creditado', v_cred,
    'liberado', v_p.segundos >= v_lim * v_dur, 'status', v_p.status);
end $$;

-- ============================================================================ RPC: adiantar aula
-- Só funciona com config.modo_demo = 1. Credita a aula inteira e MARCA o
-- registro como adiantado — o supervisor vê que a aula não foi assistida.
create or replace function public.adiantar_aula(p_modulo text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_mot uuid := public._motorista_ativo(); v_dur numeric; v_p public.progresso;
begin
  if coalesce(public.cfg('modo_demo'), 0) <> 1 then
    raise exception 'ADIANTAR_DESATIVADO' using errcode = '42501';
  end if;
  select video_seg into v_dur from public.modulos where id = p_modulo and ativo and public.pode_ver_modulo(p_modulo);
  if v_dur is null then raise exception 'MODULO_INEXISTENTE'; end if;
  insert into public.progresso (motorista_id, modulo_id) values (v_mot, p_modulo) on conflict do nothing;
  update public.progresso set
    segundos = v_dur, aula_adiantada = true, ultimo_heartbeat = now(),
    status = case when status = 'nao_iniciado' then 'andamento' else status end,
    iniciado_em = coalesce(iniciado_em, now()),
    video_concluido_em = coalesce(video_concluido_em, now()), atualizado_em = now()
  where motorista_id = v_mot and modulo_id = p_modulo
  returning * into v_p;
  return jsonb_build_object('segundos', v_p.segundos, 'duracao', v_dur, 'liberado', true,
                            'status', v_p.status, 'adiantada', true);
end $$;

-- ============================================================================ RPC: quiz
-- Corrige NO SERVIDOR. Recusa se o vídeo não foi assistido (pelo tempo que o
-- próprio servidor creditou) ou se o módulo já foi aprovado.
-- Devolve acertos, nota e se cada pergunta foi certa ou errada. O gabarito só
-- volta quando o motorista é APROVADO — reprovado não vê a resposta correta.
create or replace function public.enviar_quiz(p_modulo text, p_respostas int[])
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_mot uuid := public._motorista_ativo();
  v_dur numeric; v_lim numeric := public.cfg('limiar_video');
  v_apr numeric := public.cfg('aprovacao');
  v_p public.progresso; v_gab int[]; v_n int; v_ac int := 0; v_certas boolean[] := '{}';
  v_nota int; v_ok boolean; i int;
begin
  select video_seg into v_dur from public.modulos where id = p_modulo and ativo and public.pode_ver_modulo(p_modulo);
  if v_dur is null then raise exception 'MODULO_INEXISTENTE'; end if;

  select * into v_p from public.progresso
   where motorista_id = v_mot and modulo_id = p_modulo for update;
  if v_p is null or v_p.segundos < v_lim * v_dur then
    raise exception 'VIDEO_INCOMPLETO' using errcode = '42501';
  end if;
  if v_p.status = 'concluido' then raise exception 'JA_APROVADO'; end if;

  select array_agg(g.correta order by q.ordem) into v_gab
    from public.perguntas q join privado.gabarito g on g.pergunta_id = q.id
   where q.modulo_id = p_modulo;
  v_n := coalesce(array_length(v_gab, 1), 0);
  if v_n = 0 then raise exception 'QUIZ_SEM_PERGUNTAS'; end if;
  if coalesce(array_length(p_respostas, 1), 0) <> v_n
     or exists (select 1 from unnest(p_respostas) with ordinality r(v, i)
                join public.perguntas q on q.modulo_id = p_modulo and q.ordem = r.i
                where r.v is null or r.v < 0 or r.v >= jsonb_array_length(q.alternativas)) then
    raise exception 'RESPOSTAS_INVALIDAS';
  end if;

  for i in 1..v_n loop
    v_certas := v_certas || (p_respostas[i] = v_gab[i]);
    if p_respostas[i] = v_gab[i] then v_ac := v_ac + 1; end if;
  end loop;
  v_nota := round(v_ac * 100.0 / v_n);
  v_ok   := v_nota >= v_apr;

  insert into public.tentativas (motorista_id, modulo_id, numero, respostas, acertos, total, nota, aprovado)
  values (v_mot, p_modulo, v_p.tentativas + 1, p_respostas, v_ac, v_n, v_nota, v_ok);

  update public.progresso set
    tentativas     = tentativas + 1,
    nota_primeira  = coalesce(nota_primeira, v_nota),
    nota_ultima    = v_nota,
    acertos_ultima = v_ac,
    status         = case when v_ok then 'concluido' else 'reprovado' end,
    nota_aprovacao = case when v_ok then v_nota else nota_aprovacao end,
    concluido_em   = case when v_ok then now() else concluido_em end,
    atualizado_em  = now()
  where motorista_id = v_mot and modulo_id = p_modulo;

  return jsonb_build_object(
    'acertos', v_ac, 'total', v_n, 'nota', v_nota, 'aprovado', v_ok,
    'certas', to_jsonb(v_certas),
    'gabarito', case when v_ok then to_jsonb(v_gab) else null end,
    'tentativa', v_p.tentativas + 1);
end $$;

-- ============================================================================ RLS
alter table public.config     enable row level security;
alter table public.perfis     enable row level security;
alter table public.motoristas enable row level security;
alter table public.modulos    enable row level security;
alter table public.perguntas  enable row level security;
alter table public.progresso  enable row level security;
alter table public.tentativas enable row level security;

drop policy if exists le_config on public.config;
create policy le_config on public.config for select to authenticated using (true);

drop policy if exists le_perfil on public.perfis;
create policy le_perfil on public.perfis for select to authenticated
  using (id = auth.uid() or public.pode_ver_motorista(id) or public.pode_ver_supervisor(id));

drop policy if exists le_motorista on public.motoristas;
create policy le_motorista on public.motoristas for select to authenticated
  using (id = auth.uid() or public.pode_ver_motorista(id));

drop policy if exists le_modulos on public.modulos;
create policy le_modulos on public.modulos for select to authenticated using (public.pode_ver_modulo(id));

drop policy if exists le_perguntas on public.perguntas;
create policy le_perguntas on public.perguntas for select to authenticated using (public.pode_ver_modulo(modulo_id));

drop policy if exists le_progresso on public.progresso;
create policy le_progresso on public.progresso for select to authenticated
  using (motorista_id = auth.uid() or public.pode_ver_motorista(motorista_id));

drop policy if exists le_tentativas on public.tentativas;
create policy le_tentativas on public.tentativas for select to authenticated
  using (motorista_id = auth.uid() or public.pode_ver_motorista(motorista_id));

-- Nenhuma política de escrita existe: insert/update/delete pelo app é negado.
-- Além disso, os privilégios de escrita são retirados na raiz.
revoke all on all tables in schema public from anon;
revoke insert, update, delete, truncate on all tables in schema public from authenticated;
grant select on all tables in schema public to authenticated;

-- funções: só o que precisa ficar exposto
revoke execute on all functions in schema public from public, anon;
grant execute on function public.convite_info(uuid)                to anon, authenticated;
grant execute on function public.registrar_acesso()                to authenticated;
grant execute on function public.registrar_video(text, numeric)    to authenticated;
grant execute on function public.enviar_quiz(text, int[])          to authenticated;
grant execute on function public.adiantar_aula(text)               to authenticated;
grant execute on function public.pode_ver_modulo(text)             to authenticated;
grant execute on function public.salvar_aula(jsonb)                to authenticated;
grant execute on function public.aula_para_editar(text)            to authenticated;
grant execute on function public.arquivar_aula(text, boolean)      to authenticated;
grant execute on function public.eh_supervisor()                   to authenticated;
grant execute on function public.pode_ver_motorista(uuid)          to authenticated;
grant execute on function public.pode_ver_supervisor(uuid)         to authenticated;
revoke execute on function public._motorista_ativo() from authenticated;
revoke execute on function public.cfg(text)          from authenticated;
revoke execute on function public.autorizar_troca_senha(uuid) from authenticated;
grant  execute on function public.autorizar_troca_senha(uuid) to service_role;
