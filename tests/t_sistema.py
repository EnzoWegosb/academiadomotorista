#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Academia do Motorista — teste de ponta a ponta do SISTEMA REAL.

  python3 src/build.py && python3 tests/t_sistema.py [url]

Sem URL, serve dist/ por HTTP local. Precisa do .env e de `pip install playwright`
(+ `playwright install chromium`).

Chromium real, Supabase real, cliques reais. O percurso é o de produção:
supervisor entra → convida → motorista abre o convite em OUTRO navegador →
aula → reprova → refaz → aprova → supervisor acompanha, troca senha, desativa.
Tudo o que o teste cria é apagado no fim, mesmo se falhar no meio.
"""
import os, re, sys, json

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
sys.path.insert(0, AQUI)
sys.path.insert(0, os.path.join(RAIZ, 'supabase'))
sys.path.insert(0, os.path.join(RAIZ, 'src'))
import dados, aplica
from utilidades import MEDE_CONTRASTE, colisoes

# Servido por HTTP, como em produção: aberto como arquivo (file://) o YouTube
# recusa incorporar o vídeo (erro 153) e o teste mediria uma situação irreal.
import http.server, threading, functools
_srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(
    type('Q', (http.server.SimpleHTTPRequestHandler,), {'log_message': lambda *a: None}), directory=os.path.join(RAIZ, 'dist')))
threading.Thread(target=_srv.serve_forever, daemon=True).start()
ALVO = sys.argv[1] if len(sys.argv) > 1 else f'http://127.0.0.1:{_srv.server_address[1]}/index.html'
SHOTS = os.path.join(RAIZ, 'shots')
SENHA_SUP = aplica.segredo('ACADEMIA_SUPERVISOR_SENHA')
GAB = {m['id']: [q[2] for q in m['quiz']] for m in dados.MODULOS}
NOME = 'Teste Navegador Aparecida Silva'

ok = fail = 0
falhas = []


def v(c, m):
    global ok, fail
    if c: ok += 1
    else:
        fail += 1; falhas.append(m)


def limpa_teste():
    r = aplica.sql("select id from public.perfis where nome like 'Teste Navegador%'")
    for x in r:
        aplica.auth_admin('DELETE', f"/users/{x['id']}")
    return len(r)


def entra(pg, usuario, senha):
    pg.fill('input[name=usuario]', usuario)
    pg.fill('input[name=senha]', senha)
    pg.click('#bt-entrar')


def erros_reais(lst):
    # 'Failed to load resource' é o navegador registrando uma resposta 4xx/5xx; as
    # respostas são auditadas uma a uma em `falhas_http`, com a lista do esperado.
    return [e for e in lst if not re.search(r'net::|ERR_|favicon|youtube|googlevideo|doubleclick|ytimg|'
                                            r'Failed to load resource', e, re.I)]


ESPERADO_HTTP = [(400, '/auth/v1/token?grant_type=password'),    # senha errada, de propósito
                 (403, '/rest/v1/rpc/enviar_quiz')]               # quiz sem aula, de propósito


def vigia(pg, lst):
    def r(resp):
        if resp.status >= 400 and 'supabase.co' in resp.url:
            lst.append((resp.status, resp.url.split('supabase.co')[1]))
    pg.on('response', r)


def inesperadas(lst):
    return [x for x in lst if not any(x[0] == e[0] and x[1].startswith(e[1]) for e in ESPERADO_HTTP)
            and not (x[0] == 400 and 'enviar_quiz' in x[1])]


def contraste(pg, tela):
    # O selo "Made with Anycast" (#ac-badge) é injetado pela plataforma no link
    # publicado, com fundo translúcido que o medidor não compõe. Não é da aplicação.
    r = pg.evaluate(MEDE_CONTRASTE)
    fora = {'Made with', 'Anycast'}
    return r['n'], [dict(x, tela=tela) for x in r['ruins'] if x['t'] not in fora]


limpa_teste()
from playwright.sync_api import sync_playwright
os.makedirs(SHOTS, exist_ok=True)
n_txt, ruins = 0, []

try:
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--disable-dev-shm-usage', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'])

        # ======================================================== SUPERVISOR
        cs = b.new_context(viewport={'width': 1440, 'height': 950})
        s = cs.new_page(); err_s = []; http_s = []
        vigia(s, http_s)
        s.on('pageerror', lambda e: err_s.append(str(e)))
        s.on('console', lambda m: err_s.append(m.text) if m.type == 'error' else None)
        s.on('dialog', lambda d: d.accept())
        s.goto(ALVO, wait_until='load'); s.wait_for_timeout(800)

        v(s.locator('#f-login').count() == 1, 'tela de login com formulário não apareceu')
        v(s.locator('[data-perfil]').count() == 0, 'ainda existe o seletor de perfil sem senha da demo')
        t, r = contraste(s, 'login'); n_txt += t; ruins += r
        s.screenshot(path=os.path.join(SHOTS, 's_login.png'))

        entra(s, 'supervisor', 'senhaErrada123')
        s.wait_for_timeout(2500)
        v('incorretos' in s.inner_text('#lg-err'), f"senha errada sem mensagem: {s.inner_text('#lg-err')!r}")

        entra(s, 'supervisor', SENHA_SUP)
        s.wait_for_selector('.main', timeout=20000); s.wait_for_timeout(800)
        v('#/gestor' in s.url, 'supervisor não caiu na área de gestão')
        v(s.evaluate("sessionStorage.getItem('academia-sessao-v2') !== null"), 'sessão não ficou na aba')
        v(s.evaluate("Object.keys(localStorage).filter(k=>/sessao|token|supabase/i.test(k)).length") == 0,
          'sessão gravada em localStorage (domínio compartilhado)')
        t, r = contraste(s, 'gestor-geral'); n_txt += t; ruins += r

        # ---- convidar ----
        s.click('.lat [data-ir="#/gestor/novo"]'); s.wait_for_timeout(600)
        v(s.locator('#f-motorista').count() == 1, 'formulário de convite não abriu')
        senha_sug = s.input_value('#in-senha')
        v(len(senha_sug) >= 8, f'senha sugerida curta: {senha_sug!r}')
        v(not re.search(r'[0O1lI]', senha_sug), f'senha sugerida tem caracteres ambíguos: {senha_sug}')
        t, r = contraste(s, 'gestor-form'); n_txt += t; ruins += r
        # label/campo empilhados (label é inline por padrão)
        v(s.eval_on_selector('.cp', 'e=>getComputedStyle(e).display') == 'flex', 'campo do formulário inline')

        s.fill('input[name=nome]', NOME)
        s.fill('input[name=cpf]', '529.982.247-25')
        s.fill('input[name=telefone]', '(41) 98888-7777')
        s.fill('input[name=cidade]', 'Araucária')
        s.fill('input[name=uf]', 'pr')
        s.fill('input[name=cnh_categoria]', 'D')
        s.fill('input[name=veiculo]', 'Micro-ônibus 24 lugares')
        s.fill('input[name=placa]', 'bra2e19')
        s.fill('input[name=inicio]', '2026-10-01')
        s.click('#bt-salvar')
        s.wait_for_selector('#cv-usuario', timeout=25000); s.wait_for_timeout(500)
        usuario = s.inner_text('#cv-usuario').strip()
        senha = s.inner_text('#cv-senha').strip()
        msg = s.inner_text('#cv-msg')
        v(usuario == 'teste.silva', f'usuário gerado inesperado: {usuario}')
        v(senha == senha_sug, 'a senha mostrada não é a que foi cadastrada')
        m = re.search(r'(\S+#/convite/[0-9a-f-]{36})', msg)
        v(m is not None, f'mensagem sem link de convite: {msg[:120]!r}')
        link = m.group(1) if m else ''
        v(usuario in msg and senha in msg, 'mensagem de convite sem usuário ou senha')
        s.screenshot(path=os.path.join(SHOTS, 's_convite_criado.png'), full_page=True)

        # ======================================================== MOTORISTA — outro navegador
        cm = b.new_context(viewport={'width': 390, 'height': 844})     # celular, sem sessão nenhuma
        mo = cm.new_page(); err_m = []; http_m = []
        vigia(mo, http_m)
        mo.on('pageerror', lambda e: err_m.append(str(e)))
        mo.goto(link, wait_until='load')
        mo.wait_for_selector('#f-convite', timeout=20000); mo.wait_for_timeout(500)
        ct = mo.inner_text('#cv-corpo')
        v(NOME in ct, 'convite não mostra o nome do motorista')
        v(mo.eval_on_selector('input[name=usuario]', 'e=>e.readOnly') is True, 'usuário editável no convite')
        v(mo.input_value('input[name=usuario]') == usuario, 'convite com usuário errado')
        t, r = contraste(mo, 'convite'); n_txt += t; ruins += r
        mo.screenshot(path=os.path.join(SHOTS, 'm_convite.png'))

        mo.fill('input[name=senha]', 'errada12345'); mo.click('#bt-entrar'); mo.wait_for_timeout(2500)
        v('incorretos' in mo.inner_text('#lg-err'), 'convite aceitou/omitiu senha errada')
        mo.fill('input[name=senha]', senha); mo.click('#bt-entrar')
        mo.wait_for_selector('.mod', timeout=20000); mo.wait_for_timeout(800)
        v(mo.locator('.mod').count() == 3, 'motorista não vê os 3 treinamentos')
        est = mo.eval_on_selector_all('.mod .pill', 'es=>es.map(e=>e.textContent.trim())')
        v(est == ['Não iniciado'] * 3, f'estados iniciais: {est}')
        v('Aparecida' in mo.inner_text('.main') or 'Teste' in mo.inner_text('.main'), 'saudação sem o nome')
        t, r = contraste(mo, 'motorista-inicio'); n_txt += t; ruins += r
        mo.screenshot(path=os.path.join(SHOTS, 'm_inicio.png'), full_page=True)

        # ---- meu cadastro: só leitura ----
        mo.evaluate("location.hash='#/motorista/cadastro'"); mo.wait_for_timeout(600)
        cad = mo.inner_text('.main')
        v('529.982.247-25' in cad and 'Araucária/PR' in cad and 'BRA2E19' in cad, f'cadastro incompleto: {cad[:200]!r}')
        v(mo.locator('.main input, .main textarea, .main select').count() == 0, 'tela de cadastro do motorista tem campo editável')

        # ---- treinamento: player real + trava ----
        mo.evaluate("location.hash='#/motorista/treino/m3'")
        mo.wait_for_timeout(9000)
        v(mo.locator('iframe#pl-alvo').count() == 1, 'player do YouTube não montou')
        v(mo.locator('#area-quiz .qz-q').count() == 0, 'quiz aberto antes da aula')
        v(mo.locator('#bt-pula').count() == 1, 'botão "Adiantar aula" ausente (modo demonstração ligado)')
        v('demonstração' in mo.inner_text('#demo-ct').lower(), 'botão de adiantar sem rótulo de demonstração')
        v('servidor' in mo.inner_text('.trava').lower(), 'aviso de trava não menciona a conferência do servidor')

        # envio de reprodução real pelo mesmo caminho do player (5 s de aula)
        mo.evaluate("Player.pend = 5; Player.envia()"); mo.wait_for_timeout(2500)
        sv = mo.evaluate('Player.servidor')
        v(0 < sv <= 10, f'registro de reprodução não chegou ao servidor: {sv}')
        mid = aplica.sql(f"select id from public.perfis where usuario='{usuario}'")[0]['id']
        banco = aplica.sql(f"select segundos, status from public.progresso where motorista_id='{mid}' and modulo_id='m3'")[0]
        v(float(banco['segundos']) == sv and banco['status'] == 'andamento', f'banco diverge da tela: {banco} vs {sv}')

        # tentar enviar o quiz sem aula completa, direto pela API do navegador
        r = mo.evaluate("Api.rpc('enviar_quiz',{p_modulo:'m3',p_respostas:[0,0,0,0]}).then(()=>'ACEITO',e=>e.message)")
        v('VIDEO_INCOMPLETO' in r, f'quiz aceito pela API sem a aula: {r}')

        # o botão de demonstração libera a aula pelo servidor
        mo.click('#bt-pula'); mo.wait_for_timeout(3000)
        v(mo.locator('#bt-pula').count() == 0, 'botão de adiantar continua na tela depois de usado')
        ad = aplica.sql(f"select aula_adiantada, segundos from public.progresso where motorista_id='{mid}' and modulo_id='m3'")[0]
        v(ad['aula_adiantada'] is True and float(ad['segundos']) == 611, f'adiantar não gravou no banco: {ad}')
        v(mo.locator('#area-quiz .qz-q').count() == 4, 'quiz não liberou depois da aula completa')
        v('liberado' in mo.inner_text('.trava').lower(), 'aviso não mudou para liberado')

        # ---- reprovar ----
        for i, c in enumerate(GAB['m3']):
            mo.click(f'.qz-a[data-q="{i}"][data-a="{(c + 1) % 4}"]'); mo.wait_for_timeout(60)
        mo.click('#bt-envia'); mo.wait_for_selector('.res', timeout=15000); mo.wait_for_timeout(400)
        v(mo.locator('.res.rp').count() == 1, 'reprovação não apareceu')
        v('0 de 4' in mo.inner_text('.res'), 'acertos da reprovação errados')
        v(mo.locator('#area-quiz .qz-a.cer').count() == 0, 'reprovado vê alternativa correta')
        v(mo.evaluate('QZ.resultado.gabarito') is None, 'servidor mandou o gabarito na reprovação')
        mo.screenshot(path=os.path.join(SHOTS, 'm_reprovado.png'), full_page=True)

        # ---- refazer e aprovar ----
        mo.click('#bt-refaz'); mo.wait_for_timeout(600)
        v(mo.locator('#area-quiz .qz-q').count() == 4 and mo.locator('.res').count() == 0, 'refazer não reabriu o quiz')
        for i, c in enumerate(GAB['m3']):
            mo.click(f'.qz-a[data-q="{i}"][data-a="{c}"]'); mo.wait_for_timeout(60)
        mo.click('#bt-envia'); mo.wait_for_selector('.res.ap', timeout=15000); mo.wait_for_timeout(400)
        v('4 de 4' in mo.inner_text('.res') and '100%' in mo.inner_text('.res'), 'aprovação com números errados')
        v(mo.locator('#area-quiz .qz-a.cer').count() == 4, 'aprovado não revê as 4 corretas')
        mo.screenshot(path=os.path.join(SHOTS, 'm_aprovado.png'), full_page=True)

        # recarregar: o estado vem do banco
        mo.reload(wait_until='load'); mo.wait_for_timeout(4000)
        v(mo.locator('#area-quiz .qz-q').count() == 0, 'módulo aprovado reabriu o quiz')
        v('concluído' in mo.inner_text('.trava').lower(), 'módulo aprovado sem aviso de concluído')
        mo.evaluate("location.hash='#/motorista'"); mo.wait_for_timeout(800)
        est = mo.eval_on_selector_all('.mod .pill', 'es=>es.map(e=>e.textContent.trim())')
        v(est[2] == 'Concluído', f'tela inicial não refletiu a aprovação: {est}')
        v(mo.eval_on_selector_all('.hero-st .iv', 'es=>es.map(e=>e.textContent)')[0] == '1', 'contador de concluídos')
        # transbordo no celular
        for tela in ['#/motorista', '#/motorista/historico', '#/motorista/cadastro']:
            mo.evaluate(f"location.hash='{tela}'"); mo.wait_for_timeout(500)
            sw = mo.evaluate('document.documentElement.scrollWidth')
            v(sw <= 392, f'transbordo no celular em {tela}: {sw}')
        v(not erros_reais(err_m), f'erros de JS no motorista: {erros_reais(err_m)[:3]}')
        v(not inesperadas(http_m), f'respostas de erro inesperadas (motorista): {inesperadas(http_m)[:4]}')

        # ======================================================== SUPERVISOR acompanha
        # a aba do supervisor ficou aberta o tempo todo, com os dados da hora do login:
        # navegar com dados velhos tem de recarregar do banco sozinho
        s.evaluate("location.hash='#/gestor/treinamentos'"); s.wait_for_timeout(4000)
        linha = s.locator(f'tr.cli[data-mot="{mid}"]')
        v(linha.count() == 1, 'motorista não aparece na tabela do supervisor')
        lt = linha.inner_text()
        v('Concluído' in lt and '100%' in lt, f'tabela não mostra a aprovação: {lt!r}')
        cab = [c.strip().lower() for c in re.split(r'[\t\n]', s.inner_text('table.tb thead')) if c.strip()]
        v(cab == ['motorista', 'direção econômica', 'piloto automático', 'frenagem planejada',
                  'progresso', 'média dos quizzes', 'última atividade'], f'colunas: {cab}')
        t, r = contraste(s, 'gestor-tabela'); n_txt += t; ruins += r

        linha.click(); s.wait_for_timeout(2500)
        ft = s.inner_text('.main')
        v(NOME in ft and usuario in ft, 'ficha sem nome/usuário')
        v('1º acesso em' in ft, 'ficha não registra o primeiro acesso')
        v(s.locator('#tent-m3 .tent-i').count() == 2, f'histórico de tentativas: {s.locator("#tent-m3 .tent-i").count()}')
        v('aproveitamento' in ft.lower(), 'ficha sem aproveitamento')
        v('aula adiantada' in ft.lower(), 'ficha não mostra que a aula foi adiantada')   # rótulo em caixa alta via CSS
        t, r = contraste(s, 'gestor-ficha'); n_txt += t; ruins += r
        s.screenshot(path=os.path.join(SHOTS, 's_ficha.png'), full_page=True)

        # ---- nova senha ----
        s.click('[data-acao="senha"]'); s.wait_for_timeout(300)
        nova = s.input_value('#f-senha input[name=senha]')
        s.click('#f-senha button[type=submit]'); s.wait_for_timeout(3500)
        v('Senha alterada' in s.inner_text('#painel-senha'), 'troca de senha sem confirmação')

        # a senha antiga não entra mais; a nova entra (em outro navegador)
        c2 = b.new_context(); t2 = c2.new_page()
        t2.goto(ALVO, wait_until='load'); t2.wait_for_timeout(500)
        entra(t2, usuario, senha); t2.wait_for_timeout(2500)
        v(t2.locator('#lg-err').count() == 1 and 'incorretos' in t2.inner_text('#lg-err'), 'senha antiga ainda entra')
        entra(t2, usuario, nova); t2.wait_for_selector('.mod', timeout=20000)
        v(True, '')
        c2.close()

        # ---- desativar ----
        s.click('[data-acao="desativar"]'); s.wait_for_timeout(4000)
        v('Desativado' in s.inner_text('.main'), 'ficha não mostra "Desativado"')
        c3 = b.new_context(); t3 = c3.new_page()
        t3.goto(link, wait_until='load'); t3.wait_for_timeout(3500)
        v('desativado' in t3.inner_text('#cv-corpo').lower(), 'convite de motorista desativado ainda aceita login')
        t3.goto(ALVO, wait_until='load'); t3.wait_for_timeout(500)
        entra(t3, usuario, nova); t3.wait_for_timeout(2500)
        v('desativado' in t3.inner_text('#lg-err').lower(), f"desativado entra ou erro genérico: {t3.inner_text('#lg-err')!r}")
        c3.close()

        v(not erros_reais(err_s), f'erros de JS no supervisor: {erros_reais(err_s)[:3]}')
        v(not inesperadas(http_s), f'respostas de erro inesperadas (supervisor): {inesperadas(http_s)[:4]}')
        for w in (1440, 1024, 820, 390):
            s.set_viewport_size({'width': w, 'height': 900}); s.wait_for_timeout(400)
            sw = s.evaluate('document.documentElement.scrollWidth')
            v(sw <= w + 2, f'transbordo no supervisor em {w}px: {sw}')

        # geometria das barras
        s.set_viewport_size({'width': 1440, 'height': 900})
        s.evaluate("location.hash='#/gestor'"); s.wait_for_timeout(700)
        chatas = s.evaluate("[...document.querySelectorAll('.bar,.bar-f')].filter(e=>e.getBoundingClientRect().height<3).length")
        v(chatas == 0, f'{chatas} barra(s) sem altura')
        b.close()

    v(not ruins, f'{len(ruins)} de {n_txt} textos reprovam no contraste AA: ' + json.dumps(ruins[:4], ensure_ascii=False))
    print(f'  · contraste: {n_txt} textos medidos')
finally:
    n = limpa_teste()
    print(f'  · limpeza: {n} motorista(s) de teste removido(s)')
    v(aplica.sql("select count(*) n from public.perfis where nome like 'Teste Navegador%'")[0]['n'] == 0,
      'sobrou motorista de teste no banco')

col = colisoes(os.path.join(RAIZ, 'src', 'app', 'app.css'))
v(not col, f'COLISÃO de nome de classe (componente E modificador): {col}')

print(f'\n{"=" * 62}\n{ok} verificações OK · {fail} falha(s)\n{"=" * 62}')
for f in falhas:
    print('  ✗', f)
sys.exit(1 if fail else 0)
