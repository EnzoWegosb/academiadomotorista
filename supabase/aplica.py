#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Academia do Motorista — aplica o back-end no Supabase.

  python3 supabase/aplica.py [esquema|conteudo|auth|funcao|supervisor|tudo]

O SQL vai pela API de gestão do Supabase com um token pessoal (PAT), sem
precisar de cliente Postgres. Credenciais lidas do `.env` / ambiente (ver
.env.example), nunca impressas.

ARMADILHA: o JSON do SQL é montado em Python — pelo shell as aspas simples
do SQL somem e o Postgres recebe outra consulta.
"""
import json, os, sys, secrets, string, urllib.request, uuid

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(AQUI, '..', 'src'))
sys.path.insert(0, os.path.join(AQUI, '..'))
from ambiente import segredo  # noqa: E402

URL = segredo('SUPABASE_URL')
REF = URL.split('//')[1].split('.')[0]
PAT = segredo('SUPABASE_ACCESS_TOKEN')
DOMINIO = 'academia-motorista.invalid'


# ---------------------------------------------------------------- chamadas
def gestao(metodo, caminho, corpo=None, bruto=None, ctype='application/json'):
    dados = bruto if bruto is not None else (None if corpo is None else json.dumps(corpo).encode())
    r = urllib.request.Request(f'https://api.supabase.com/v1/projects/{REF}{caminho}', method=metodo,
                               data=dados, headers={'Authorization': 'Bearer ' + PAT,
                                                    'Content-Type': ctype, 'User-Agent': 'anycast'})
    try:
        with urllib.request.urlopen(r, timeout=120) as x:
            t = x.read()
            return x.status, (json.loads(t) if t else None)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode('utf-8', 'replace')[:800]


def sql(q):
    st, r = gestao('POST', '/database/query', {'query': q})
    if st not in (200, 201):
        raise SystemExit(f'SQL falhou ({st}): {r}')
    return r


def auth_admin(metodo, caminho, corpo=None):
    sk = segredo('SUPABASE_SECRET_KEY')
    r = urllib.request.Request(URL + '/auth/v1/admin' + caminho, method=metodo,
                               data=None if corpo is None else json.dumps(corpo).encode(),
                               headers={'apikey': sk, 'Authorization': 'Bearer ' + sk,
                                        'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(r, timeout=30) as x:
            return x.status, json.loads(x.read() or b'null')
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')


def lit(v):
    """literal SQL seguro para texto"""
    return "'" + str(v).replace("'", "''") + "'"


# ---------------------------------------------------------------- etapas
def esquema():
    sql(open(os.path.join(AQUI, 'schema.sql'), encoding='utf-8').read())
    t = sql("select table_schema||'.'||table_name t from information_schema.tables "
            "where table_schema in ('public','privado') order by 1")
    print('  tabelas:', ', '.join(x['t'] for x in t))


def conteudo():
    """Módulos, perguntas e gabarito. Reaplicável: atualiza sem duplicar."""
    import dados
    partes = []
    for m in dados.MODULOS:
        partes.append(
            'insert into public.modulos (id,ordem,titulo,curto,descricao,duracao_txt,video_id,video_seg,fonte,tema) '
            f"values ({lit(m['id'])},{m['ord']},{lit(m['titulo'])},{lit(m['curto'])},{lit(m['desc'])},"
            f"{lit(m['duracao'])},{lit(m['video'])},{m['videoSeg']},{lit(m['fonte'])},{lit(m['tema'])}) "
            'on conflict (id) do update set ordem=excluded.ordem, titulo=excluded.titulo, curto=excluded.curto, '
            'descricao=excluded.descricao, duracao_txt=excluded.duracao_txt, video_id=excluded.video_id, '
            'video_seg=excluded.video_seg, fonte=excluded.fonte, tema=excluded.tema;')
        for i, (enun, alts, cor) in enumerate(m['quiz'], 1):
            partes.append(
                'with q as (insert into public.perguntas (modulo_id,ordem,enunciado,alternativas) '
                f"values ({lit(m['id'])},{i},{lit(enun)},{lit(json.dumps(alts, ensure_ascii=False))}::jsonb) "
                'on conflict (modulo_id,ordem) do update set enunciado=excluded.enunciado, '
                'alternativas=excluded.alternativas returning id) '
                f'insert into privado.gabarito select id, {int(cor)} from q '
                'on conflict (pergunta_id) do update set correta=excluded.correta;')
    sql('\n'.join(partes))
    r = sql("select m.id, m.titulo, count(q.id) perguntas, count(g.pergunta_id) gabaritos "
            "from public.modulos m left join public.perguntas q on q.modulo_id=m.id "
            "left join privado.gabarito g on g.pergunta_id=q.id group by 1,2 order by 1")
    for x in r:
        print(f"  {x['id']} {x['titulo']:36} perguntas={x['perguntas']} gabaritos={x['gabaritos']}")


def auth():
    """Fecha o cadastro público. Contas só nascem pela função do supervisor."""
    st, r = gestao('PATCH', '/config/auth', {'disable_signup': True, 'password_min_length': 8})
    print('  config auth ->', st)
    st, c = gestao('GET', '/config/auth')
    print('  cadastro público desligado:', c.get('disable_signup'), '| senha mínima:', c.get('password_min_length'))


def funcao():
    """Deploy da função `gestao-motoristas` pela API de gestão (multipart)."""
    slug = 'gestao-motoristas'
    codigo = open(os.path.join(AQUI, 'functions', slug, 'index.ts'), 'rb').read()
    meta = json.dumps({'entrypoint_path': 'index.ts', 'name': slug, 'verify_jwt': False}).encode()
    b = '----anycast' + uuid.uuid4().hex
    corpo = (f'--{b}\r\nContent-Disposition: form-data; name="metadata"\r\n'
             'Content-Type: application/json\r\n\r\n').encode() + meta + (
             f'\r\n--{b}\r\nContent-Disposition: form-data; name="file"; filename="index.ts"\r\n'
             'Content-Type: application/typescript\r\n\r\n').encode() + codigo + f'\r\n--{b}--\r\n'.encode()
    st, r = gestao('POST', f'/functions/deploy?slug={slug}', bruto=corpo,
                   ctype=f'multipart/form-data; boundary={b}')
    print('  deploy ->', st, r if st >= 300 else {k: r.get(k) for k in ('slug', 'status', 'version', 'verify_jwt')})


def supervisor(usuario='supervisor', nome='Supervisor'):
    """Conta inicial de supervisor. A senha gerada é exibida UMA vez — guarde-a."""
    existe = sql(f"select id from public.perfis where usuario={lit(usuario)}")
    if existe:
        print('  supervisor já existe:', usuario)
        return
    alfa = string.ascii_letters + string.digits
    senha = ''.join(secrets.choice(alfa) for _ in range(10)) + '#' + secrets.choice(string.digits)
    st, u = auth_admin('POST', '/users', {'email': f'{usuario}@{DOMINIO}', 'password': senha,
                                          'email_confirm': True, 'app_metadata': {'papel': 'supervisor'}})
    if st not in (200, 201):
        raise SystemExit(f'falhou ao criar supervisor: {u}')
    sql(f"insert into public.perfis (id,papel,nome,usuario) values ({lit(u['id'])},'supervisor',{lit(nome)},{lit(usuario)})")
    print('  supervisor criado:', usuario)
    print('  senha (exibida só agora — guarde e coloque em ACADEMIA_SUPERVISOR_SENHA no .env):', senha)


ETAPAS = {'esquema': esquema, 'conteudo': conteudo, 'auth': auth, 'funcao': funcao, 'supervisor': supervisor}

if __name__ == '__main__':
    pedido = sys.argv[1:] or ['tudo']
    ordem = list(ETAPAS) if pedido == ['tudo'] else pedido
    for e in ordem:
        print(f'== {e}')
        ETAPAS[e]()
