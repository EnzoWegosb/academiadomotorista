# -*- coding: utf-8 -*-
"""Utilidades dos testes: medidor de contraste WCAG e detector de colisão de classe."""
import re

# Mede o contraste de todo texto visível contra o fundo EFETIVO (sobe a árvore
# até achar fundo opaco). Critério WCAG AA: 4,5 (texto normal) / 3 (grande).
MEDE_CONTRASTE = r"""() => {
  const L = c => { const f=x=>{x/=255;return x<=.03928?x/12.92:Math.pow((x+.055)/1.055,2.4)};
                   return .2126*f(c[0])+.7152*f(c[1])+.0722*f(c[2]) };
  const parse = s => { const m=String(s).match(/[\d.]+/g); return m?m.map(Number):null };
  const comp = (fg,bg,a) => fg.map((c,i)=>c*a+bg[i]*(1-a));
  const fundo = el => {
    let n=el;
    while(n && n!==document.documentElement){
      const c=parse(getComputedStyle(n).backgroundColor);
      if(c && (c.length<4 || c[3]>=1)) return c.slice(0,3);
      n=n.parentElement;
    }
    return [255,255,255];
  };
  const ruins=[]; let n=0;
  document.querySelectorAll('body *').forEach(el=>{
    if(['SCRIPT','STYLE','SVG','PATH','CIRCLE'].includes(el.tagName)) return;
    const t=[...el.childNodes].filter(x=>x.nodeType===3&&x.textContent.trim())
                              .map(x=>x.textContent.trim()).join('');
    if(!t) return;
    const cs=getComputedStyle(el);
    if(cs.visibility==='hidden'||cs.display==='none'||parseFloat(cs.opacity)<.55) return;
    const r=el.getBoundingClientRect(); if(r.width<1||r.height<1) return;
    const fgc=parse(cs.color); if(!fgc) return;
    const bg=fundo(el);
    const fg=(fgc.length>3&&fgc[3]<1)?comp(fgc.slice(0,3),bg,fgc[3]):fgc.slice(0,3);
    const l1=L(fg),l2=L(bg), cr=(Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05);
    const px=parseFloat(cs.fontSize), peso=parseInt(cs.fontWeight)||400;
    const min=(px>=24||(px>=18.66&&peso>=700))?3:4.5;
    n++;
    if(cr<min-0.02) ruins.push({t:t.slice(0,40),cr:+cr.toFixed(2),min,px,
                                cor:cs.color,fundo:'rgb('+bg.map(Math.round)+')'});
  });
  return {n:n, ruins:ruins};
}"""


def colisoes(css_path):
    """Componente e modificador com o MESMO nome de classe: o componente vaza
    layout para dentro do modificador. Devolve os nomes em colisão."""
    css = re.sub(r'/\*.*?\*/', ' ', open(css_path, encoding='utf-8').read(), flags=re.S)
    comp, mod = set(), set()
    for sel in re.findall(r'([^{}]+)\{', css):
        for parte in sel.split(','):
            parte = parte.strip()
            if not parte or parte.startswith('@') or ' ' in parte or '>' in parte:
                continue
            cls = re.findall(r'\.([a-zA-Z][\w-]*)', parte)
            if len(cls) == 1 and parte == '.' + cls[0]:
                comp.add(cls[0])
            elif len(cls) > 1:
                mod.update(cls[1:])
    return sorted(comp & mod)
