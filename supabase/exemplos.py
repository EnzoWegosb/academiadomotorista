#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Academia do Motorista — motoristas de EXEMPLO para teste.

  python3 supabase/exemplos.py criar     # cria os 10
  python3 supabase/exemplos.py remover   # apaga todos os exemplos
  python3 supabase/exemplos.py listar

A senha comum dos exemplos vem de ACADEMIA_SENHA_EXEMPLOS (ver .env.example).

Os motoristas são criados pelo MESMO caminho do supervisor (função
gestao-motoristas) e depois recebem um histórico coerente por SQL: tempo de
vídeo, tentativas com respostas que batem com o gabarito, datas encadeadas
(convite → 1º acesso → aula → tentativas → aprovação).

Marca: `observacoes` começa com "EXEMPLO". É por ela que a tela mostra a
etiqueta "Exemplo" e é por ela que `remover` apaga — nunca toca em motorista real.
"""
import json, os, random, sys, urllib.request
from datetime import datetime, timedelta, timezone

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
sys.path.insert(0, os.path.join(AQUI, '..', 'src'))
import aplica, dados

MARCA = 'EXEMPLO'
SENHA = aplica.segredo('ACADEMIA_SENHA_EXEMPLOS')
PK = aplica.segredo('SUPABASE_PUBLISHABLE_KEY')
MODS = {m['id']: m for m in dados.MODULOS}
GAB = {m['id']: [q[2] for q in m['quiz']] for m in dados.MODULOS}
AGORA = datetime(2026, 9, 30, 17, 0, tzinfo=timezone.utc)
r = random.Random(20260930)

# ---------------------------------------------------------------- os 10 níveis
# (nome, cidade, UF, veículo, cenário)
# cenário por módulo: None = não iniciado · ('and', fração do vídeo) ·
# ('rep', [notas das tentativas]) · ('ok', [notas das tentativas, a última ≥ 70])
MOTORISTAS = [
    ('Joana Ferreira Lopes',    'Paulínia',        'SP', 'Van 15 lugares',          'convite',  [None, None, None]),
    ('Carlos Eduardo Nunes',    'Uberaba',         'MG', 'Micro-ônibus 24 lugares', 'acessou',  [None, None, None]),
    ('Rafael Moreira Costa',    'Camaçari',        'BA', 'Ônibus 44 lugares',       'ativo',    [('and', .38), None, None]),
    ('Priscila Andrade Rocha',  'Ponta Grossa',    'PR', 'Van 15 lugares',          'ativo',    [('rep', [25]), None, None]),
    ('Diego Santos Almeida',    'Rondonópolis',    'MT', 'Sedan executivo',         'ativo',    [('ok', [100]), ('and', .61), None]),
    ('Vanessa Ribeiro Prado',   'Betim',           'MG', 'Micro-ônibus 24 lugares', 'ativo',    [('ok', [50, 75]), ('rep', [25, 50]), None]),
    ('Marcelo Tavares Lima',    'Três Lagoas',     'MS', 'Ônibus 44 lugares',       'ativo',    [('ok', [75]), ('ok', [100]), ('and', .22)]),
    ('Adriana Gomes Pereira',   'Cubatão',         'SP', 'Van 15 lugares',          'ativo',    [('ok', [100]), ('ok', [75]), ('rep', [50, 25, 50])]),
    ('Fábio Henrique Souza',    'Anápolis',        'GO', 'Ônibus 44 lugares',       'ativo',    [('ok', [100]), ('ok', [100]), ('ok', [75])]),
    ('Luana Carvalho Martins',  'Barcarena',       'PA', 'Micro-ônibus 24 lugares', 'ativo',    [('ok', [25, 50, 100]), ('ok', [50, 75]), ('ok', [25, 100])]),
]


def cpf():
    n = [r.randint(0, 9) for _ in range(9)]
    for k in (10, 11):
        d = sum(a * b for a, b in zip(n, range(k, 1, -1))) * 10 % 11
        n.append(0 if d == 10 else d)
    return ''.join(map(str, n))


def placa():
    L = 'ABCDEFGHJKLMNPRSTUVWXYZ'
    return ''.join(r.choice(L) for _ in range(3)) + str(r.randint(0, 9)) + r.choice(L) + f'{r.randint(0, 99):02d}'


def iso(d):
    return d.strftime('%Y-%m-%d %H:%M:%S+00')


def lit(v):
    return 'null' if v is None else "'" + str(v).replace("'", "''") + "'"


def respostas(mod, nota):
    """respostas cujo acerto bate exatamente com a nota"""
    g = GAB[mod]
    ac = round(nota / 100 * len(g))
    certas = set(r.sample(range(len(g)), ac))
    return [g[i] if i in certas else (g[i] + r.randint(1, 3)) % 4 for i in range(len(g))], ac


def http(metodo, caminho, corpo, tok):
    q = urllib.request.Request(aplica.URL + caminho, method=metodo, data=json.dumps(corpo).encode(),
                               headers={'apikey': PK, 'Authorization': 'Bearer ' + tok,
                                        'Content-Type': 'application/json'})
    with urllib.request.urlopen(q, timeout=40) as x:
        return json.loads(x.read() or b'null')


def token_supervisor():
    q = urllib.request.Request(aplica.URL + '/auth/v1/token?grant_type=password', method='POST',
                               data=json.dumps({'email': 'supervisor@' + aplica.DOMINIO,
                                                'password': aplica.segredo('ACADEMIA_SUPERVISOR_SENHA')}).encode(),
                               headers={'apikey': PK, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(q, timeout=30) as x:
        return json.loads(x.read())['access_token']


# ---------------------------------------------------------------- criar
def criar():
    if aplica.sql(f"select 1 from public.motoristas where observacoes like '{MARCA}%' limit 1"):
        raise SystemExit('Já existem exemplos. Rode "remover" antes de recriar.')
    tok = token_supervisor()
    sqls = []
    for i, (nome, cidade, uf, veic, acesso, cen) in enumerate(MOTORISTAS):
        convite = AGORA - timedelta(days=r.randint(16, 24), hours=r.randint(0, 8))
        a = http('POST', '/functions/v1/gestao-motoristas', {
            'acao': 'criar', 'nome': nome, 'senha': SENHA, 'cpf': cpf(),
            'telefone': f'({r.choice([11, 19, 31, 34, 41, 42, 43, 62, 65, 67, 71, 91])}) 9{r.randint(8000, 9999)}-{r.randint(1000, 9999)}',
            'email_contato': nome.split()[0].lower() + '.' + nome.split()[-1].lower() + '@exemplo.com',
            'cidade': cidade, 'uf': uf, 'cnh_categoria': r.choice(['D', 'D', 'E']),
            'cnh_validade': f'{r.randint(2027, 2031)}-{r.randint(1, 12):02d}-{r.randint(1, 28):02d}',
            'veiculo': veic, 'placa': placa(), 'inicio': (convite + timedelta(days=1)).strftime('%Y-%m-%d'),
            'observacoes': f'{MARCA} — motorista fictício para teste (nível {i + 1} de 10).'}, tok)
        mid = a['id']
        print(f"  {a['usuario']:22} {nome}")

        t = convite + timedelta(days=r.randint(1, 3), hours=r.randint(1, 6))   # 1º acesso
        prim = t if acesso != 'convite' else None
        ult = t if prim else None
        sqls.append(f"update public.perfis set criado_em={lit(iso(convite))} where id={lit(mid)};")

        for mod_id, c in zip(['m1', 'm2', 'm3'], cen):
            if c is None:
                continue
            dur = MODS[mod_id]['videoSeg']
            ini = t + timedelta(hours=r.randint(1, 30))
            if c[0] == 'and':
                seg = round(dur * c[1], 2)
                fim = ini + timedelta(seconds=seg)
                sqls.append(
                    f"update public.progresso set status='andamento', segundos={seg}, iniciado_em={lit(iso(ini))}, "
                    f"ultimo_heartbeat={lit(iso(fim))}, atualizado_em={lit(iso(fim))} "
                    f"where motorista_id={lit(mid)} and modulo_id='{mod_id}';")
                t = ult = max(ult or fim, fim)
                continue
            vfim = ini + timedelta(seconds=dur + r.randint(60, 900))
            quando = vfim + timedelta(minutes=r.randint(2, 12))
            notas = c[1]
            for n, nota in enumerate(notas, 1):
                resp, ac = respostas(mod_id, nota)
                sqls.append(
                    "insert into public.tentativas (motorista_id,modulo_id,numero,respostas,acertos,total,nota,aprovado,enviado_em) "
                    f"values ({lit(mid)},'{mod_id}',{n},array{resp},{ac},4,{nota},{'true' if nota >= 70 else 'false'},{lit(iso(quando))});")
                ultq = quando
                quando = quando + timedelta(minutes=r.randint(15, 90), hours=r.choice([0, 0, 20]))
            ok = c[0] == 'ok'
            _, acu = respostas(mod_id, notas[-1])
            sqls.append(
                f"update public.progresso set status='{'concluido' if ok else 'reprovado'}', segundos={dur}, "
                f"iniciado_em={lit(iso(ini))}, ultimo_heartbeat={lit(iso(vfim))}, video_concluido_em={lit(iso(vfim))}, "
                f"tentativas={len(notas)}, nota_primeira={notas[0]}, nota_ultima={notas[-1]}, acertos_ultima={acu}, "
                f"nota_aprovacao={notas[-1] if ok else 'null'}, concluido_em={lit(iso(ultq)) if ok else 'null'}, "
                f"atualizado_em={lit(iso(ultq))} where motorista_id={lit(mid)} and modulo_id='{mod_id}';")
            t = ult = max(ult or ultq, ultq)

        if ult and ult > AGORA:
            ult = AGORA - timedelta(hours=r.randint(1, 20))
        sqls.append(
            f"update public.motoristas set criado_em={lit(iso(convite))}, convite_criado_em={lit(iso(convite))}, "
            f"primeiro_acesso_em={lit(iso(prim) if prim else None)}, ultimo_acesso_em={lit(iso(ult) if ult else None)} "
            f"where id={lit(mid)};")
    aplica.sql('\n'.join(sqls))
    listar()


# ---------------------------------------------------------------- remover
def remover():
    ids = aplica.sql(f"select id from public.motoristas where observacoes like '{MARCA}%'")
    for x in ids:
        aplica.auth_admin('DELETE', f"/users/{x['id']}")
    print(f'  {len(ids)} exemplo(s) removido(s)')


def listar():
    q = aplica.sql(f"""
      select p.usuario, p.nome,
        string_agg(pr.status || coalesce(' ' || pr.nota_ultima || '%', ''), ' | ' order by pr.modulo_id) st
      from public.motoristas m join public.perfis p on p.id = m.id
      left join public.progresso pr on pr.motorista_id = m.id
      where m.observacoes like '{MARCA}%' group by 1, 2 order by 2""")
    for x in q:
        print(f"  {x['usuario']:22} {x['nome']:26} {x['st']}")
    print(f'  total: {len(q)}')


if __name__ == '__main__':
    {'criar': criar, 'remover': remover, 'listar': listar}[(sys.argv[1:] or ['listar'])[0]]()
