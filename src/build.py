#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Academia do Motorista — gerador da aplicação.

Monta um HTML único (css, js e ícone embutidos) em `dist/index.html` — o nome que
o Cloudflare Workers (e qualquer servidor estático) entrega na rota `/`.
Precisa de SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY no ambiente ou no `.env`.

A chave PUBLICÁVEL vai dentro do HTML — isso é normal no Supabase: ela é pública
por design e quem protege os dados são as regras de linha (RLS) do banco.
Nunca coloque aqui a chave secreta (service_role / sb_secret_).

Uso:  python3 src/build.py
"""
import base64, json, os, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
sys.path.insert(0, RAIZ)
from ambiente import segredo  # noqa: E402

APP = os.path.join(AQUI, 'app')
DIST = os.path.join(RAIZ, 'dist')
ORDEM_JS = ('api.js', 'core.js', 'player.js', 'motorista.js', 'gestor.js', 'aulas.js', 'supervisores.js')


def ler(p):
    with open(p, encoding='utf-8') as f:
        return f.read()


def b64(p):
    with open(p, 'rb') as f:
        return 'data:image/png;base64,' + base64.b64encode(f.read()).decode()


def monta():
    chave = segredo('SUPABASE_PUBLISHABLE_KEY')
    if not chave.startswith('sb_publishable_') and 'anon' not in chave:
        raise SystemExit('SUPABASE_PUBLISHABLE_KEY não parece uma chave publicável. '
                         'Nunca use a chave secreta no front-end.')
    css = ler(os.path.join(APP, 'app.css'))
    js = '\n'.join(ler(os.path.join(APP, n)) for n in ORDEM_JS)
    icone = b64(os.path.join(RAIZ, 'assets', 'anycast_icone.png'))

    return f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Academia do Motorista · Anycast</title>
<meta name="description" content="Treinamento de motoristas com vídeo, quiz e acompanhamento da supervisão. Feito com Anycast.">
<meta name="theme-color" content="#0A0E17">
<link rel="icon" href="{icone}">
<style>{css}</style>
</head>
<body>
<div id="app"></div>
<script>
var LOGO_ICONE = "{icone}";
var SUPA_URL = {json.dumps(segredo('SUPABASE_URL'))};
var SUPA_KEY = {json.dumps(chave)};
</script>
<script>{js}</script>
<script>inicia();</script>
</body>
</html>
"""


if __name__ == '__main__':
    os.makedirs(DIST, exist_ok=True)
    destino = os.path.join(DIST, 'index.html')
    html = monta()
    with open(destino, 'w', encoding='utf-8') as f:
        f.write(html)
    print(f'{destino}  {len(html.encode()) / 1024:.0f} KB')
