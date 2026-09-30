#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Procura segredos nos arquivos que o git vai versionar. Rode antes de cada commit:

  python3 ferramentas/verifica_segredos.py

Falha (código 1) se encontrar:
  · chaves e tokens com formato conhecido (Supabase, GitHub, JWT, AWS, chaves privadas);
  · o endereço real de um projeto Supabase;
  · QUALQUER valor preenchido no seu `.env` aparecendo dentro de um arquivo versionado.
"""
import os, re, subprocess, sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PADROES = {
    'chave secreta Supabase': r'sb_secret_[A-Za-z0-9_\-]{10,}',
    'chave publicável Supabase': r'sb_publishable_[A-Za-z0-9_\-]{10,}',
    'token pessoal Supabase': r'sbp_[a-f0-9]{20,}',
    'token GitHub': r'(?:github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{30,})',
    'JWT (ex.: service_role antiga)': r'eyJ[A-Za-z0-9_\-]{10,}\.eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}',
    'chave AWS': r'AKIA[0-9A-Z]{16}',
    'chave privada': r'-----BEGIN [A-Z ]*PRIVATE KEY-----',
    'endereço real de projeto Supabase': r'https://(?!SEU-PROJETO)[a-z0-9]{20}\.supabase\.co',
}


def versionados():
    try:
        out = subprocess.run(['git', 'ls-files', '--cached', '--others', '--exclude-standard'],
                             cwd=RAIZ, capture_output=True, text=True, check=True).stdout.split('\n')
        return [f for f in out if f]
    except Exception:
        return [os.path.relpath(os.path.join(d, f), RAIZ) for d, _, fs in os.walk(RAIZ)
                if '.git' not in d for f in fs]


def valores_env():
    p = os.path.join(RAIZ, '.env')
    if not os.path.exists(p):
        return {}
    v = {}
    for l in open(p, encoding='utf-8'):
        if '=' in l and not l.strip().startswith('#'):
            k, x = l.split('=', 1)
            x = x.strip().strip('"').strip("'")
            if len(x) >= 6:
                v[k.strip()] = x
    return v


def main():
    env = valores_env()
    achados = []
    for f in versionados():
        if f == '.env' or f.startswith('.git/'):
            continue
        try:
            txt = open(os.path.join(RAIZ, f), encoding='utf-8', errors='ignore').read()
        except (IsADirectoryError, FileNotFoundError):
            continue
        for nome, pad in PADROES.items():
            if re.search(pad, txt):
                achados.append(f'{f}: {nome}')
        for k, x in env.items():
            if x in txt:
                achados.append(f'{f}: contém o valor de {k} do .env')
    if achados:
        print('SEGREDOS ENCONTRADOS — não faça commit:')
        for a in achados:
            print('  ✗', a)
        sys.exit(1)
    print(f'ok — nenhum segredo nos arquivos versionados ({len(versionados())} verificados)')


if __name__ == '__main__':
    main()
