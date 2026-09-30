# -*- coding: utf-8 -*-
"""
Configuração e segredos da Academia do Motorista.

Tudo o que é sensível vem de VARIÁVEIS DE AMBIENTE ou de um arquivo `.env` na
raiz do projeto — que está no .gitignore e nunca vai para o repositório.
Modelo: `.env.example`.
"""
import os

RAIZ = os.path.dirname(os.path.abspath(__file__))


def _carrega_env():
    p = os.path.join(RAIZ, '.env')
    if not os.path.exists(p):
        return
    with open(p, encoding='utf-8') as f:
        for linha in f:
            linha = linha.strip()
            if not linha or linha.startswith('#') or '=' not in linha:
                continue
            k, v = linha.split('=', 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


_carrega_env()


def segredo(nome, obrigatorio=True):
    v = os.environ.get(nome, '').strip()
    if not v and obrigatorio:
        raise SystemExit(f'Falta a variável {nome}. Copie .env.example para .env e preencha.')
    return v
