#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Academia do Motorista — teste do back-end contra o Supabase REAL.

  python3 tests/t_backend.py      (precisa do .env preenchido)

Cria motoristas de teste pela função do supervisor, tenta burlar cada regra
como faria um motorista mal-intencionado (chamando a API direto, sem o app) e
APAGA tudo o que criou no final — inclusive se algo falhar no meio.
"""
import json, os, sys, time, urllib.request

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(AQUI, '..', 'supabase'))
sys.path.insert(0, os.path.join(AQUI, '..', 'src'))
import aplica, dados

URL = aplica.URL
PK = aplica.segredo('SUPABASE_PUBLISHABLE_KEY')
SENHA_SUP = aplica.segredo('ACADEMIA_SUPERVISOR_SENHA')
SENHA_EX = aplica.segredo('ACADEMIA_SENHA_EXEMPLOS')
DOM = aplica.DOMINIO
GAB = {m['id']: [q[2] for q in m['quiz']] for m in dados.MODULOS}

ok = fail = 0
falhas = []


def v(cond, msg):
    global ok, fail
    if cond: ok += 1
    else:
        fail += 1; falhas.append(msg)


def http(metodo, caminho, corpo=None, tok=None, extra=None):
    h = {'apikey': PK, 'Content-Type': 'application/json',
         'Authorization': 'Bearer ' + (tok or PK)}
    h.update(extra or {})
    r = urllib.request.Request(URL + caminho, method=metodo, headers=h,
                               data=None if corpo is None else json.dumps(corpo).encode())
    try:
        with urllib.request.urlopen(r, timeout=40) as x:
            t = x.read(); return x.status, (json.loads(t) if t else None)
    except urllib.error.HTTPError as e:
        t = e.read()
        try: return e.code, json.loads(t)
        except Exception: return e.code, t.decode('utf-8', 'replace')


def entra(usuario, senha):
    st, r = http('POST', '/auth/v1/token?grant_type=password', {'email': f'{usuario}@{DOM}', 'password': senha})
    return r.get('access_token') if st == 200 else None


def rpc(nome, args, tok):
    return http('POST', f'/rest/v1/rpc/{nome}', args, tok)


def fn(corpo, tok):
    return http('POST', '/functions/v1/gestao-motoristas', corpo, tok)


def msg(r):
    return json.dumps(r, ensure_ascii=False) if not isinstance(r, str) else r


criados = []
try:
    # ============================================================ supervisor
    sup = entra('supervisor', SENHA_SUP)
    v(sup, 'supervisor não conseguiu entrar com usuário e senha')

    # ============================================================ criar motorista
    st, a = fn({'acao': 'criar', 'nome': 'Teste Automático Álvaro Conceição', 'senha': 'SenhaDoSup#1',
                'cpf': '123.456.789-09', 'telefone': '(41) 99999-0000', 'cidade': 'Curitiba', 'uf': 'pr',
                'cnh_categoria': 'D', 'cnh_validade': '2029-05-10', 'veiculo': 'Van 15 lugares',
                'placa': 'abc-1d23', 'inicio': '2026-09-30'}, sup)
    v(st == 200 and a.get('usuario'), f'supervisor não criou motorista: {st} {msg(a)}')
    criados.append(a['id'])
    v(a['usuario'] == 'teste.conceicao', f'usuário não derivado do nome sem acento: {a.get("usuario")}')
    tokA = a['convite_token']

    st, b = fn({'acao': 'criar', 'nome': 'Teste Automático Álvaro Conceição', 'senha': 'OutraSenha#2'}, sup)
    v(st == 200 and b['usuario'] == 'teste.conceicao2', f'homônimo não recebeu usuário único: {msg(b)}')
    criados.append(b['id'])

    st, r = fn({'acao': 'criar', 'nome': 'Fulano Curto', 'senha': '123'}, sup)
    v(st == 400, 'aceitou senha com menos de 8 caracteres')
    st, r = fn({'acao': 'criar', 'nome': 'Fulano Cpf', 'senha': 'SenhaBoa#123', 'cpf': '123'}, sup)
    v(st == 400, 'aceitou CPF inválido')

    # campos normalizados
    st, cad = http('GET', f"/rest/v1/motoristas?id=eq.{a['id']}&select=*", tok=sup)
    c = cad[0] if isinstance(cad, list) and cad else {}
    v(c.get('cpf') == '12345678909', f'CPF não normalizado: {c.get("cpf")}')
    v(c.get('uf') == 'PR' and c.get('placa') == 'ABC1D23', f'UF/placa não normalizados: {c.get("uf")} {c.get("placa")}')
    st, pg = http('GET', f"/rest/v1/progresso?motorista_id=eq.{a['id']}&select=modulo_id,status", tok=sup)
    v(isinstance(pg, list) and len(pg) == 3 and all(x['status'] == 'nao_iniciado' for x in pg),
      f'progresso inicial não criado para os 3 módulos: {msg(pg)}')

    # ============================================================ convite (sem login)
    st, ci = rpc('convite_info', {'p_token': tokA}, None)
    v(st == 200 and ci and ci[0]['usuario'] == 'teste.conceicao', f'convite_info sem login falhou: {st} {msg(ci)}')
    v(set(ci[0].keys()) == {'nome', 'usuario', 'ativo'}, f'convite expõe mais do que nome/usuário: {list(ci[0])}')
    st, ci2 = rpc('convite_info', {'p_token': '00000000-0000-0000-0000-000000000000'}, None)
    v(st == 200 and ci2 == [], 'token falso devolveu dados')

    # ============================================================ motorista entra
    mot = entra('teste.conceicao', 'SenhaDoSup#1')
    v(mot, 'motorista não entrou com o usuário e a senha definidos pelo supervisor')
    v(not entra('teste.conceicao', 'senhaErrada#9'), 'entrou com senha errada')
    st, _ = rpc('registrar_acesso', {}, mot)
    v(st in (200, 204), f'registrar_acesso falhou: {st}')

    # ============================================================ o que o motorista NÃO pode
    st, r = http('POST', '/auth/v1/signup', {'email': f'invasor@{DOM}', 'password': 'Invasor#2026'})
    v(st >= 400, f'cadastro público continua aberto: {st}')

    st, r = http('PATCH', f"/rest/v1/motoristas?id=eq.{a['id']}", {'cidade': 'Alterada'}, mot,
                 {'Prefer': 'return=representation'})
    st2, c2 = http('GET', f"/rest/v1/motoristas?id=eq.{a['id']}&select=cidade", tok=sup)
    v(c2 and c2[0]['cidade'] == 'Curitiba', f'motorista alterou o próprio cadastro: {st} {msg(r)}')

    st, r = http('PATCH', f"/rest/v1/perfis?id=eq.{a['id']}", {'nome': 'Nome Trocado'}, mot)
    st2, p2 = http('GET', f"/rest/v1/perfis?id=eq.{a['id']}&select=nome", tok=sup)
    v(p2 and p2[0]['nome'].startswith('Teste'), 'motorista alterou o próprio nome')

    st, r = http('PATCH', f"/rest/v1/progresso?motorista_id=eq.{a['id']}", {'status': 'concluido', 'segundos': 9999}, mot)
    st2, p3 = http('GET', f"/rest/v1/progresso?motorista_id=eq.{a['id']}&select=status", tok=sup)
    v(all(x['status'] == 'nao_iniciado' for x in p3), 'motorista marcou módulo como concluído pela API')

    st, r = http('POST', '/rest/v1/tentativas', {'motorista_id': a['id'], 'modulo_id': 'm1', 'numero': 1,
                 'respostas': [0, 0, 0, 0], 'acertos': 4, 'total': 4, 'nota': 100, 'aprovado': True}, mot)
    v(st >= 400, f'motorista inseriu tentativa aprovada direto na tabela: {st}')

    st, outros = http('GET', '/rest/v1/perfis?select=usuario', tok=mot)
    v(isinstance(outros, list) and [x['usuario'] for x in outros] == ['teste.conceicao'],
      f'motorista enxerga outros perfis: {msg(outros)}')
    st, pgo = http('GET', f"/rest/v1/progresso?motorista_id=eq.{b['id']}&select=*", tok=mot)
    v(pgo == [], 'motorista lê progresso de outro motorista')

    st, r = http('GET', '/rest/v1/gabarito?select=*', tok=mot)
    v(st >= 400, f'gabarito acessível pela API: {st}')
    st, perg = http('GET', '/rest/v1/perguntas?select=*&modulo_id=eq.m1', tok=mot)
    v(isinstance(perg, list) and len(perg) == 4 and all('correta' not in json.dumps(p) for p in perg),
      'perguntas vieram com gabarito')

    st, r = fn({'acao': 'criar', 'nome': 'Criado Pelo Motorista', 'senha': 'Tentativa#123'}, mot)
    v(st == 403, f'motorista usou a função de supervisor: {st} {msg(r)}')

    st, r = http('PUT', '/auth/v1/user', {'password': 'EuMesmoTroquei#1'}, mot)
    v(st >= 400, f'motorista trocou a própria senha pela API: {st}')
    v(entra('teste.conceicao', 'SenhaDoSup#1'), 'a senha original deixou de funcionar')
    v(not entra('teste.conceicao', 'EuMesmoTroquei#1'), 'a senha trocada pelo motorista funciona')

    # sem login nenhum
    st, r = http('GET', '/rest/v1/motoristas?select=*')
    v(st >= 400 or r == [], f'dados de motoristas legíveis sem login: {st}')

    # ============================================================ vídeo
    st, r = rpc('enviar_quiz', {'p_modulo': 'm2', 'p_respostas': GAB['m2']}, mot)
    v(st >= 400 and 'VIDEO_INCOMPLETO' in msg(r), f'quiz aceito sem vídeo: {st} {msg(r)}')

    st, r = rpc('registrar_video', {'p_modulo': 'm2', 'p_delta': 900}, mot)
    v(st == 200 and r['creditado'] <= 10, f'primeiro registro creditou demais: {msg(r)}')
    t0 = time.time(); tot = r['segundos']
    for _ in range(12):
        st, r = rpc('registrar_video', {'p_modulo': 'm2', 'p_delta': 30}, mot)
    real = time.time() - t0
    ganho = r['segundos'] - tot
    v(ganho <= real * 2 + 1, f'rajada de chamadas creditou {ganho:.1f}s em {real:.1f}s reais (limite 2x)')
    v(r['liberado'] is False, 'vídeo de 15 min liberado em segundos')

    time.sleep(3)
    st, r2 = rpc('registrar_video', {'p_modulo': 'm2', 'p_delta': 3}, mot)
    v(r2['creditado'] >= 2.5, f'reprodução legítima (3s em 3s) não foi creditada: {msg(r2)}')

    # simula o vídeo assistido até o fim (o que 15 min de reprodução real fariam)
    aplica.sql(f"update public.progresso set segundos = 917 where motorista_id = '{a['id']}' and modulo_id = 'm2'")
    # o próximo registro de reprodução é o que marca o fim do vídeo — como no uso real
    st, r = rpc('registrar_video', {'p_modulo': 'm2', 'p_delta': 1}, mot)
    v(r['liberado'] is True and r['segundos'] == 917, f'vídeo completo não liberou o quiz: {msg(r)}')

    # ============================================================ quiz
    st, r = rpc('enviar_quiz', {'p_modulo': 'm2', 'p_respostas': [0, 0]}, mot)
    v(st >= 400 and 'RESPOSTAS_INVALIDAS' in msg(r), 'aceitou quiz com respostas faltando')
    st, r = rpc('enviar_quiz', {'p_modulo': 'm2', 'p_respostas': [9, 0, 0, 0]}, mot)
    v(st >= 400, 'aceitou alternativa fora da faixa')

    erradas = [(x + 1) % 4 for x in GAB['m2']]
    st, r = rpc('enviar_quiz', {'p_modulo': 'm2', 'p_respostas': erradas}, mot)
    v(st == 200 and r['aprovado'] is False and r['nota'] == 0, f'reprovação errada: {msg(r)}')
    v(r.get('gabarito') is None, 'REPROVADO recebeu o gabarito do servidor')
    v(r.get('certas') == [False] * 4, f'certas/erradas incorreto: {r.get("certas")}')

    mistas = [GAB['m2'][0], GAB['m2'][1], (GAB['m2'][2] + 1) % 4, (GAB['m2'][3] + 1) % 4]
    st, r = rpc('enviar_quiz', {'p_modulo': 'm2', 'p_respostas': mistas}, mot)
    v(r['nota'] == 50 and not r['aprovado'] and r.get('gabarito') is None, f'caso misto: {msg(r)}')

    st, r = rpc('enviar_quiz', {'p_modulo': 'm2', 'p_respostas': GAB['m2']}, mot)
    v(r['aprovado'] and r['nota'] == 100 and r['gabarito'] == GAB['m2'], f'aprovação: {msg(r)}')
    v(r['tentativa'] == 3, f'número da tentativa: {r.get("tentativa")}')

    st, r = rpc('enviar_quiz', {'p_modulo': 'm2', 'p_respostas': GAB['m2']}, mot)
    v(st >= 400 and 'JA_APROVADO' in msg(r), 'aceitou novo envio após aprovação')

    st, p = http('GET', f"/rest/v1/progresso?motorista_id=eq.{a['id']}&modulo_id=eq.m2&select=*", tok=mot)
    p = p[0]
    v(p['status'] == 'concluido' and p['tentativas'] == 3, f'progresso final: {msg(p)}')
    v(p['nota_primeira'] == 0 and p['nota_aprovacao'] == 100, 'nota da 1ª tentativa ou de aprovação errada')
    v(p['concluido_em'] and p['video_concluido_em'], 'datas de conclusão não gravadas')

    # ============================================================ adiantar aula (modo demonstração)
    try:
        aplica.sql("update public.config set valor=0 where chave='modo_demo'")
        st, r = rpc('adiantar_aula', {'p_modulo': 'm1'}, mot)
        v(st >= 400 and 'ADIANTAR_DESATIVADO' in msg(r), f'adiantou com o modo demonstração desligado: {st} {msg(r)}')
    finally:
        aplica.sql("update public.config set valor=1 where chave='modo_demo'")
    st, r = rpc('adiantar_aula', {'p_modulo': 'm1'}, mot)
    v(st == 200 and r['liberado'] is True, f'adiantar com modo demonstração ligado falhou: {msg(r)}')
    st, p1 = http('GET', f"/rest/v1/progresso?motorista_id=eq.{a['id']}&modulo_id=eq.m1&select=aula_adiantada,segundos", tok=sup)
    v(p1 and p1[0]['aula_adiantada'] is True, 'aula adiantada não ficou marcada para o supervisor')
    st, r = http('PATCH', f"/rest/v1/progresso?motorista_id=eq.{a['id']}&modulo_id=eq.m1", {'aula_adiantada': False}, mot)
    st2, p2 = http('GET', f"/rest/v1/progresso?motorista_id=eq.{a['id']}&modulo_id=eq.m1&select=aula_adiantada", tok=sup)
    v(p2[0]['aula_adiantada'] is True, 'motorista apagou a marca de aula adiantada')
    st, r = rpc('enviar_quiz', {'p_modulo': 'm1', 'p_respostas': GAB['m1']}, mot)
    v(st == 200 and r['aprovado'], f'quiz não liberou depois de adiantar: {msg(r)}')

    # ============================================================ o supervisor vê tudo
    st, tt = http('GET', f"/rest/v1/tentativas?motorista_id=eq.{a['id']}&modulo_id=eq.m2&select=numero,nota,aprovado&order=numero", tok=sup)
    v([x['nota'] for x in tt] == [0, 50, 100], f'supervisor não vê o histórico de tentativas: {msg(tt)}')
    st, todos = http('GET', '/rest/v1/perfis?papel=eq.motorista&select=usuario', tok=sup)
    v({'teste.conceicao', 'teste.conceicao2'} <= {x['usuario'] for x in todos}, 'supervisor não vê todos os motoristas')

    # ============================================================ senha pelo supervisor
    st, r = fn({'acao': 'senha', 'id': a['id'], 'senha': 'NovaDoSup#2'}, sup)
    v(st == 200, f'supervisor não conseguiu trocar a senha: {msg(r)}')
    v(entra('teste.conceicao', 'NovaDoSup#2'), 'senha nova definida pelo supervisor não funciona')
    v(not entra('teste.conceicao', 'SenhaDoSup#1'), 'senha antiga continua valendo')
    mot = entra('teste.conceicao', 'NovaDoSup#2')
    st, r = http('PUT', '/auth/v1/user', {'password': 'DepoisDaTroca#1'}, mot)
    v(st >= 400, 'a autorização da troca ficou aberta e o motorista aproveitou')

    # ============================================================ atualizar e desativar
    st, r = fn({'acao': 'atualizar', 'id': a['id'], 'cidade': 'Ponta Grossa', 'nome': 'Teste Automático Álvaro C.'}, sup)
    st2, c3 = http('GET', f"/rest/v1/motoristas?id=eq.{a['id']}&select=cidade", tok=sup)
    v(st == 200 and c3[0]['cidade'] == 'Ponta Grossa', 'supervisor não atualizou o cadastro')

    st, r = fn({'acao': 'novo_convite', 'id': a['id']}, sup)
    v(st == 200 and r['convite_token'] != tokA, 'novo convite não gerou token novo')
    st, ci3 = rpc('convite_info', {'p_token': tokA}, None)
    v(ci3 == [], 'o convite antigo continua valendo depois de gerar um novo')

    st, r = fn({'acao': 'desativar', 'id': a['id']}, sup)
    v(st == 200, f'desativar falhou: {msg(r)}')
    v(not entra('teste.conceicao', 'NovaDoSup#2'), 'motorista desativado ainda entra')
    st, r = rpc('registrar_video', {'p_modulo': 'm1', 'p_delta': 5}, mot)   # token anterior
    v(st >= 400, 'motorista desativado ainda registra vídeo com a sessão antiga')
    st, r = fn({'acao': 'reativar', 'id': a['id']}, sup)
    v(entra('teste.conceicao', 'NovaDoSup#2'), 'motorista reativado não entra')

    st, r = fn({'acao': 'senha', 'id': 'bogus', 'senha': 'Qualquer#123'}, sup)
    v(st == 404, 'função aceitou alvo inexistente')

    # ============================================================ supervisor de EXEMPLO
    demo = entra('supervisor.exemplo', SENHA_EX)
    v(demo, 'supervisor de exemplo não entra')
    st, vis = http('GET', '/rest/v1/perfis?papel=eq.motorista&select=usuario', tok=demo)
    st, obs = http('GET', '/rest/v1/motoristas?select=observacoes', tok=demo)
    v(isinstance(obs, list) and obs and all((o['observacoes'] or '').startswith('EXEMPLO') for o in obs),
      f'supervisor de exemplo enxerga motorista real: {msg(vis)}')
    v('teste.conceicao' not in {x['usuario'] for x in vis}, 'supervisor de exemplo vê motorista criado pelo supervisor real')
    st, r = http('GET', f"/rest/v1/progresso?motorista_id=eq.{a['id']}&select=*", tok=demo)
    v(r == [], 'supervisor de exemplo lê progresso de motorista real')
    st, r = http('GET', f"/rest/v1/tentativas?motorista_id=eq.{a['id']}&select=*", tok=demo)
    v(r == [], 'supervisor de exemplo lê tentativas de motorista real')
    for acao in ['senha', 'desativar', 'atualizar', 'novo_convite']:
        st, r = fn({'acao': acao, 'id': a['id'], 'senha': 'Invasao#2026', 'cidade': 'X'}, demo)
        v(st == 404, f'supervisor de exemplo executou "{acao}" em motorista real: {st} {msg(r)}')
    v(entra('teste.conceicao', 'NovaDoSup#2'), 'a senha do motorista real mudou')

    st, cx = fn({'acao': 'criar', 'nome': 'Teste Automático Demo Criado', 'senha': 'DemoCria#123',
                 'observacoes': 'sem marca'}, demo)
    v(st == 200, f'supervisor de exemplo não conseguiu cadastrar: {msg(cx)}')
    if st == 200:
        criados.append(cx['id'])
        st, o = http('GET', f"/rest/v1/motoristas?id=eq.{cx['id']}&select=observacoes,criado_por", tok=sup)
        v(o and o[0]['observacoes'].startswith('EXEMPLO'), f'cadastro do supervisor de exemplo nasceu sem marca: {msg(o)}')
        st, r = fn({'acao': 'atualizar', 'id': cx['id'], 'observacoes': 'tirando a marca'}, demo)
        st, o = http('GET', f"/rest/v1/motoristas?id=eq.{cx['id']}&select=observacoes", tok=sup)
        v(o[0]['observacoes'].startswith('EXEMPLO'), 'supervisor de exemplo removeu a marca de exemplo')
        st, o = http('GET', f"/rest/v1/perfis?id=eq.{cx['id']}&select=usuario", tok=demo)
        v(o and o[0]['usuario'], 'supervisor de exemplo não vê o motorista que ele mesmo criou')

    # o supervisor principal continua vendo tudo
    st, tudo = http('GET', '/rest/v1/perfis?papel=eq.motorista&select=usuario', tok=sup)
    v(len(tudo) > len(vis), 'supervisor principal deixou de ver todos os motoristas')

finally:
    # ============================================================ limpeza
    for uid in criados:
        aplica.auth_admin('DELETE', f'/users/{uid}')
    sobra = aplica.sql("select count(*) n from public.perfis where usuario like 'teste.%'")
    v(sobra[0]['n'] == 0, f'sobraram {sobra[0]["n"]} perfis de teste no banco')

print(f'\n{"=" * 62}\n{ok} verificações OK · {fail} falha(s)\n{"=" * 62}')
for f in falhas:
    print('  ✗', f)
sys.exit(1 if fail else 0)
