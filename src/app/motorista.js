/* ============================================================
   Telas do motorista: início, treinamento individual (vídeo + quiz), histórico.
   ============================================================ */

/* ------------------------------------------------------------ anel de progresso */
function anel(p, tam){
  tam = tam || 158;
  var r = tam/2 - 11, c = 2*Math.PI*r;
  return ''
  + '<div class="ring" style="width:'+tam+'px;height:'+tam+'px">'
  +   '<svg width="'+tam+'" height="'+tam+'" aria-hidden="true">'
  +     '<circle cx="'+tam/2+'" cy="'+tam/2+'" r="'+r+'" fill="none" '
  +       'stroke="rgba(255,255,255,.13)" stroke-width="11"/>'
  +     '<circle cx="'+tam/2+'" cy="'+tam/2+'" r="'+r+'" fill="none" stroke="#00B4D8" '
  +       'stroke-width="11" stroke-linecap="round" stroke-dasharray="'+c+'" '
  +       'stroke-dashoffset="'+(c*(1-p/100))+'"/>'
  +   '</svg>'
  +   '<div class="ring-c"><div class="ring-v">'+p+'<span style="font-size:.5em">%</span></div>'
  +     '<div class="ring-l">Concluído</div></div>'
  + '</div>';
}

/* ============================================================ início do motorista */
function telaMotorista(){
  var d = Store.motorista(Sessao.motorista);
  var r = Store.resumo(Sessao.motorista);
  var primeiro = d.nome.split(' ')[0];

  var cards = Store.d.modulos.map(function(m){
    var p = Store.prog(Sessao.motorista, m.id) || {status:'nao_iniciado',assistido:0};
    var fv = Math.min(Math.round(p.assistido/m.videoSeg*100), 100);
    var cta = p.status === 'concluido' ? 'Rever treinamento'
            : (p.status === 'reprovado' ? 'Refazer o quiz'
            : (p.status === 'andamento' ? 'Continuar' : 'Iniciar treinamento'));
    var estilo = p.status === 'concluido' ? 'bt-ln' : 'bt-pr';

    var meta = '<div class="mt-i">'+ic('relogio',15)+'<span>'+esc(m.duracao)+'</span></div>';
    if(p.status === 'concluido' && p.nota != null){
      meta += '<div class="mt-i">'+ic('estrela',15)+'<span>Nota do quiz <b>'+p.nota+'%</b></span></div>';
      if(p.concluidoEm) meta += '<div class="mt-i">'+ic('check',15)+'<span>Em '+esc(p.concluidoEm)+'</span></div>';
    } else if(p.status === 'reprovado'){
      meta += '<div class="mt-i">'+ic('alerta',15)+'<span>Última nota <b>'+p.nota+'%</b>'
            + ' · mínimo '+Store.d.aprovacao+'%</span></div>';
      meta += '<div class="mt-i">'+ic('volta',15)+'<span><b>'+p.tentativas+'</b> tentativa'
            + (p.tentativas>1?'s':'')+'</span></div>';
    } else if(p.status === 'andamento'){
      meta += '<div class="mt-i">'+ic('play',15)+'<span>Vídeo em <b>'+fv+'%</b></span></div>';
    }

    var barra = '';
    if(p.status !== 'nao_iniciado'){
      var vp = p.status === 'concluido' ? 100 : fv;
      var cor = p.status === 'concluido' ? 'ok' : (p.status === 'reprovado' ? 'err' : 'and');
      barra = '<div class="bar-w" style="margin-bottom:16px">'
            + '<div class="bar"><div class="bar-f '+cor+'" style="width:'+vp+'%"></div></div>'
            + '<div class="bar-n">'+vp+'%</div></div>';
    }

    return ''
    + '<article class="mod st-'+ABR[p.status]+'">'
    +   '<div class="mod-ic">'+ic(IC_TEMA[m.tema] || 'play',26)+'</div>'
    +   '<div class="mod-bd">'
    +     '<div class="mod-hd"><div style="min-width:0">'
    +       '<div class="mod-n">MÓDULO '+String(m.ord).padStart(2,'0')+'</div>'
    +       '<h3 class="h3">'+esc(m.titulo)+'</h3></div>'
    +       selo(p.status)+'</div>'
    +     '<p class="mod-d">'+esc(m.desc)+'</p>'
    +     '<div class="mod-mt">'+meta+'</div>'
    +     barra
    +     '<div class="mod-ft">'
    +       '<button class="bt '+estilo+' bt-sm" data-ir="#/motorista/treino/'+m.id+'">'
    +         (p.status==='concluido' ? ic('volta',16) : ic('play',16))+' '+cta+'</button>'
    +     '</div>'
    +   '</div>'
    + '</article>';
  }).join('');

  return ''
  + '<div class="topo"><div>'
  +   '<div class="lbl">Treinamento de Boas Práticas</div>'
  +   '<h1 class="h1" style="margin-top:8px">Olá, '+esc(primeiro)+'.</h1>'
  + '</div></div>'

  + '<section class="hero" style="margin-bottom:22px">'
  +   '<div class="hero-tx">'
  +     '<div class="lbl lbl-nv">Sua trilha de integração</div>'
  +     '<h1 class="h2">Treinamento de Boas Práticas</h1>'
  +     '<p>'+(Store.d.modulos.length===1 ? 'Uma aula obrigatória' : Store.d.modulos.length+' aulas obrigatórias')+' para começar a rodar. '
  +       'Cada um tem uma aula em vídeo e um quiz de '+Store.d.aprovacao+'% para aprovação.</p>'
  +     '<div class="hero-st">'
  +       '<div class="i"><span class="iv">'+r.ok+'</span><span class="il">Módulos concluídos</span></div>'
  +       '<div class="i"><span class="iv">'+r.pend+'</span><span class="il">Módulos pendentes</span></div>'
  +       '<div class="i"><span class="iv">'+r.total+'</span><span class="il">Total da trilha</span></div>'
  +     '</div>'
  +   '</div>'
  +   anel(r.pct)
  + '</section>'

  + '<div class="topo" style="margin:30px 0 16px"><h2 class="h2">Seus treinamentos</h2></div>'
  + '<div class="gr">'+cards+'</div>'
  + rodape();
}

/* ============================================================ histórico */
function telaHistorico(){
  var linhas = Store.d.modulos.map(function(m){
    var p = Store.prog(Sessao.motorista, m.id) || {status:'nao_iniciado'};
    return '<tr><td><b>'+esc(m.titulo)+'</b></td>'
      + '<td>'+selo(p.status)+'</td>'
      + '<td class="mono">'+(p.nota!=null ? p.nota+'%' : '—')+'</td>'
      + '<td class="mono">'+(p.acertos!=null ? p.acertos+' de '+m.quiz.length : '—')+'</td>'
      + '<td class="mono">'+(p.tentativas||0)+'</td>'
      + '<td class="mono">'+(p.concluidoEm || '—')+'</td>'
      + '<td class="mono">'+(p.ultima || '—')+'</td></tr>';
  }).join('');

  var r = Store.resumo(Sessao.motorista);
  return ''
  + '<div class="topo"><div><div class="lbl">Meu histórico</div>'
  +   '<h1 class="h1" style="margin-top:8px">Registro de treinamentos</h1></div></div>'
  + '<div class="gr gr4" style="margin-bottom:22px">'
  +   '<div class="kpi ok"><div class="kpi-v">'+r.ok+'</div><div class="kpi-l">Concluídos</div></div>'
  +   '<div class="kpi and"><div class="kpi-v">'+r.pend+'</div><div class="kpi-l">Pendentes</div></div>'
  +   '<div class="kpi"><div class="kpi-v">'+r.pct+'<span class="u">%</span></div><div class="kpi-l">Progresso geral</div></div>'
  +   '<div class="kpi neu"><div class="kpi-v">'+Store.d.aprovacao+'<span class="u">%</span></div><div class="kpi-l">Nota de aprovação</div></div>'
  + '</div>'
  + '<div class="tb-w"><table class="tb"><thead><tr>'
  +   '<th>Treinamento</th><th>Status</th><th>Nota</th><th>Acertos</th>'
  +   '<th>Tentativas</th><th>Conclusão</th><th>Última atividade</th>'
  + '</tr></thead><tbody>'+linhas+'</tbody></table></div>'
  + rodape();
}

/* ============================================================ meu cadastro (só leitura) */
function telaMeuCadastro(){
  var d = Store.motorista(Sessao.motorista) || {};
  var linha = function(r, v){
    return '<div class="ficha-l"><span class="kpi-l">'+r+'</span><b>'+(v ? esc(v) : '—')+'</b></div>';
  };
  return ''
  + '<div class="topo"><div><div class="lbl">Meu cadastro</div>'
  +   '<h1 class="h1" style="margin-top:8px">'+esc(d.nome||'')+'</h1></div></div>'
  + '<section class="cd"><div class="ficha ficha-cad">'
  +   linha('Usuário de acesso', d.usuario)
  +   linha('CPF', fmtCPF(d.cpf))
  +   linha('Telefone', d.telefone)
  +   linha('E-mail de contato', d.email_contato)
  +   linha('Cidade', d.cidade ? d.cidade + (d.uf ? '/' + d.uf : '') : '')
  +   linha('CNH', d.cnh_categoria ? 'Categoria ' + d.cnh_categoria + (d.cnh_validade ? ' · validade ' + dataBR(d.cnh_validade) : '') : '')
  +   linha('Veículo', d.veiculo)
  +   linha('Placa', d.placa)
  +   linha('Data de início', dataBR(d.inicio))
  + '</div></section>'
  + nota('<b>Estes dados foram cadastrados pelo seu supervisor</b> e só ele pode alterá-los — '
       + 'inclusive a senha. Se algo estiver errado, fale com a supervisão.')
  + rodape();
}
function fmtCPF(c){
  c = String(c || '');
  return c.length === 11 ? c.slice(0,3)+'.'+c.slice(3,6)+'.'+c.slice(6,9)+'-'+c.slice(9) : c;
}

/* ============================================================ treinamento */
var QZ = {mod:null, resp:[], enviado:false, resultado:null, enviando:false};

function telaTreino(id){
  var m = Store.mod(id);
  if(!m){ location.hash = '#/motorista'; return '' }
  var p = Store.prog(Sessao.motorista, id);

  QZ.mod = m;
  QZ.resp = new Array(m.quiz.length).fill(null);
  QZ.enviado = false; QZ.resultado = null; QZ.enviando = false;

  return ''
  + '<button class="volta" data-ir="#/motorista">'+ic('volta',16)+' Voltar aos treinamentos</button>'
  + '<div class="topo"><div style="max-width:70ch">'
  +   '<div class="mod-n">MÓDULO '+String(m.ord).padStart(2,'0')+'</div>'
  +   '<h1 class="h1" style="margin:4px 0 10px">'+esc(m.titulo)+'</h1>'
  +   '<p class="sub">'+esc(m.desc)+'</p>'
  + '</div><span id="selo-mod">'+selo(p.status)+'</span></div>'

  + '<section class="pl-wrap" style="margin:22px 0 16px">'
  +   '<div class="pl-box"><div id="pl-alvo"></div></div>'
  +   '<div class="pl-bar">'
  +     '<div id="pl-st" class="pl-st"><span class="pd"></span>Carregando aula…</div>'
  +     '<div class="bar"><div class="bar-f" id="pl-bar-f" style="width:0%"></div></div>'
  +     '<div class="bar-n" id="pl-bar-n">0%</div>'
  +   '</div>'
  + '</section>'

  + (Store.d.modoDemo && !p.videoConcluido && p.status !== 'concluido'
      ? '<div class="demo-ct" id="demo-ct" style="margin-bottom:18px">'
      +   '<span class="tg">Demonstração</span>'
      +   '<span>A aula tem '+esc(m.duracao)+'. Para apresentar o sistema, você pode adiantar até o fim '
      +   'e ir direto ao quiz. A supervisão vê que a aula foi adiantada.</span>'
      +   '<button class="bt bt-ln bt-sm" id="bt-pula" style="margin-left:auto">'+ic('seta',15)+' Adiantar aula</button>'
      + '</div>' : '')
  + '<div id="trava-quiz"></div>'
  + '<div id="area-quiz"></div>'
  + rodape();
}

/* ------------------------------------------------------------ trava do quiz */
function pintaTrava(liberado){
  var el = $('#trava-quiz');
  if(!el || !QZ.mod) return;
  var p = Store.prog(Sessao.motorista, QZ.mod.id);
  if(p.status === 'concluido' && !QZ.resultado){
    el.innerHTML = '<div class="trava lib"><span class="ic">'+ic('check',19)+'</span>'
      + '<span><b>Treinamento concluído.</b> Você foi aprovado com nota <b>'+p.nota+'%</b>'
      + (p.concluidoEm ? ' em '+esc(p.concluidoEm) : '')+'. Pode rever a aula quando quiser.</span></div>';
    return;
  }
  el.innerHTML = liberado
    ? '<div class="trava lib"><span class="ic">'+ic('check',19)+'</span>'
      + '<span><b>Quiz liberado.</b> O servidor registrou a aula completa. '
      + 'Responda às '+QZ.mod.quiz.length+' perguntas — é preciso acertar '
      + Math.ceil(QZ.mod.quiz.length*Store.d.aprovacao/100)+' para ser aprovado.</span></div>'
    : '<div class="trava"><span class="ic">'+ic('cadeado',19)+'</span>'
      + '<span><b>O quiz abre ao fim da aula.</b> O tempo assistido é conferido pelo servidor: '
      + 'arrastar a barra para o fim ou acelerar além de 2x não conta como aula assistida.</span></div>';
}

/* ------------------------------------------------------------ quiz */
function pintaQuiz(liberado){
  var el = $('#area-quiz');
  if(!el || !QZ.mod) return;
  var p = Store.prog(Sessao.motorista, QZ.mod.id);
  if(!liberado || (p.status === 'concluido' && !QZ.resultado)){ el.innerHTML = ''; el.dataset.montado = ''; return }
  /* O player chama esta função a cada meio segundo. Só redesenha quando a
     tela muda de estado (quiz em branco ↔ resultado) — refazer o bloco a cada
     tique desmontava o botão "Tentar novamente" no meio do clique. */
  var estado = QZ.resultado ? 'res' : 'edit';
  if(el.dataset.montado === estado) return;

  var m = QZ.mod, res = QZ.resultado;

  if(res){
    var ap = res.aprovado;
    el.innerHTML = ''
    + '<div class="res '+(ap?'ap':'rp')+' fade" style="margin-top:18px">'
    +   '<div class="res-ic">'+(ap?'&#127881;':'&#128260;')+'</div>'
    +   '<h2 class="h2">'+(ap?'Aprovado!':'Ainda não foi desta vez')+'</h2>'
    +   '<p>'+(ap
          ? 'Treinamento concluído e registrado. A supervisão já vê o resultado.'
          : 'Você precisa de '+Store.d.aprovacao+'% para ser aprovado. Reveja a aula e tente de novo.')+'</p>'
    +   '<div class="res-n">'
    +     '<div class="i"><div class="v">'+res.acertos+' de '+res.total+'</div><div class="l">Acertos</div></div>'
    +     '<div class="i"><div class="v">'+res.nota+'%</div><div class="l">Nota</div></div>'
    +     '<div class="i"><div class="v">'+(ap?'Aprovado':'Reprovado')+'</div><div class="l">Situação</div></div>'
    +   '</div>'
    +   '<div class="bts" style="justify-content:center">'
    +     (ap ? '<button class="bt bt-ln bt-sm" data-ir="#/motorista">'+ic('check',16)+' Voltar aos treinamentos</button>'
              : '<button class="bt bt-ln bt-sm" id="bt-refaz">'+ic('volta',16)+' Tentar novamente</button>')
    +   '</div>'
    + '</div>'
    + (ap ? '' : '<div class="trava" style="margin-top:18px"><span class="ic">'+ic('cadeado',19)+'</span>'
          + '<span><b>As respostas corretas não são exibidas.</b> Você vê quais perguntas errou, '
          + 'mas o gabarito fica guardado no servidor — a próxima tentativa tem de vir da aula.</span></div>')
    + blocoPerguntas(ap ? 'aprovado' : 'reprovado');
    el.dataset.montado = 'res';
    return;
  }

  el.innerHTML = ''
  + '<div class="topo" style="margin:26px 0 14px"><div>'
  +   '<div class="lbl">Avaliação do módulo</div>'
  +   '<h2 class="h2" style="margin-top:7px">Quiz — '+esc(m.titulo)+'</h2>'
  + '</div></div>'
  + blocoPerguntas('edit')
  + '<div class="bts" style="margin-top:20px">'
  +   '<button class="bt bt-pr" id="bt-envia" disabled>'+ic('check',16)+' Enviar respostas</button>'
  +   '<span class="sub" id="qz-faltam"></span>'
  + '</div>';
  el.dataset.montado = 'edit';
  atualizaEnvio();
}

/* modo: 'edit' | 'aprovado' | 'reprovado'
   O navegador NÃO conhece o gabarito. Quem diz o que foi certo ou errado é o
   servidor (res.certas); a resposta correta só chega quando há aprovação
   (res.gabarito). Na reprovação, nada sobre a alternativa correta é exibido. */
function blocoPerguntas(modo){
  var m = QZ.mod, rev = modo !== 'edit', res = QZ.resultado || {};
  return '<div class="qz">' + m.quiz.map(function(q,i){
    var sel = QZ.resp[i];
    var acertou = rev && res.certas ? !!res.certas[i] : false;
    var cor = (modo === 'aprovado' && res.gabarito) ? res.gabarito[i] : null;
    var cls = rev ? (acertou ? ' cer' : ' err') : '';

    var marcaQ = '';
    if(modo === 'reprovado'){
      marcaQ = acertou
        ? '<span class="pill is-ok"><span class="pd"></span>Você acertou</span>'
        : '<span class="pill is-err"><span class="pd"></span>Você errou</span>';
    }

    var alts = q[1].map(function(a,j){
      var c = '', marca = String.fromCharCode(65+j), sua = '';
      if(modo === 'aprovado'){
        if(j === cor){ c = ' cer'; marca = '&#10003;' }
        else if(j === sel){ c = ' err'; marca = '&#10005;' }
      } else if(modo === 'reprovado'){
        if(j === sel){
          c = acertou ? ' cer' : ' err';
          marca = acertou ? '&#10003;' : '&#10005;';
          sua = '<span class="qz-sua">sua resposta</span>';
        }
      } else if(sel === j){ c = ' sel' }
      return '<button class="qz-a'+c+'" data-q="'+i+'" data-a="'+j+'"'+(rev?' disabled':'')+'>'
           + '<span class="mk">'+marca+'</span><span>'+esc(a)+sua+'</span></button>';
    }).join('');

    return '<div class="qz-q'+cls+'">'
         + '<div class="qz-hd"><div class="qz-n">PERGUNTA '+(i+1)+' DE '+m.quiz.length+'</div>'
         + marcaQ+'</div>'
         + '<div class="qz-t">'+esc(q[0])+'</div><div class="qz-as">'+alts+'</div></div>';
  }).join('') + '</div>';
}

function atualizaEnvio(){
  var b = $('#bt-envia'), f = $('#qz-faltam');
  if(!b) return;
  var faltam = QZ.resp.filter(function(x){ return x === null }).length;
  b.disabled = faltam > 0 || QZ.enviando;
  if(f) f.textContent = faltam > 0
    ? (faltam === 1 ? 'Falta 1 pergunta.' : 'Faltam '+faltam+' perguntas.')
    : 'Tudo respondido.';
}

function enviaQuiz(){
  var m = QZ.mod, b = $('#bt-envia');
  if(QZ.enviando) return;
  QZ.enviando = true;
  if(b){ b.disabled = true; b.textContent = 'Corrigindo…' }
  Player.envia();
  Api.rpc('enviar_quiz', {p_modulo: m.id, p_respostas: QZ.resp}).then(function(r){
    QZ.enviando = false;
    QZ.enviado = true;
    QZ.resultado = r;
    var p = Store.prog(Sessao.motorista, m.id);
    Store.ajustaProg(Sessao.motorista, m.id, {
      status: r.aprovado ? 'concluido' : 'reprovado', nota: r.nota, acertos: r.acertos,
      tentativas: r.tentativa, notaPrimeira: p.notaPrimeira == null ? r.nota : p.notaPrimeira,
      concluidoEm: r.aprovado ? dataBR(new Date().toISOString()) : p.concluidoEm,
      ultima: dataBR(new Date().toISOString())
    });
    var s = $('#selo-mod'); if(s) s.innerHTML = selo(r.aprovado ? 'concluido' : 'reprovado');
    var el = $('#area-quiz'); if(el) el.dataset.montado = '0';
    pintaQuiz(true);
    var rr = $('.res'); if(rr) rr.scrollIntoView({behavior:'smooth', block:'center'});
  }).catch(function(e){
    QZ.enviando = false;
    aviso(erroLegivel(e), 'err');
    if(b){ b.innerHTML = ic('check',16)+' Enviar respostas' }
    atualizaEnvio();
  });
}

/* ------------------------------------------------------------ cliques do treino */
function cliqueTreino(e){
  var t;
  if((t = e.target.closest('#pl-retenta'))){ desenha(); return true }
  if((t = e.target.closest('#bt-pula'))){
    t.disabled = true; t.textContent = 'Adiantando…';
    Player.adianta().then(function(){
      var d = $('#demo-ct'); if(d) d.remove();
      var a = $('#area-quiz'); if(a) a.scrollIntoView({behavior:'smooth', block:'start'});
    }).catch(function(x){ t.disabled = false; t.innerHTML = ic('seta',15)+' Adiantar aula'; aviso(erroLegivel(x), 'err') });
    return true;
  }
  if((t = e.target.closest('.qz-a')) && !t.disabled){
    QZ.resp[+t.dataset.q] = +t.dataset.a;
    var grupo = t.closest('.qz-as');
    $$('.qz-a', grupo).forEach(function(b){ b.classList.remove('sel') });
    t.classList.add('sel');
    atualizaEnvio();
    return true;
  }
  if((t = e.target.closest('#bt-envia'))){ enviaQuiz(); return true }
  if((t = e.target.closest('#bt-refaz'))){
    QZ.resp = new Array(QZ.mod.quiz.length).fill(null);
    QZ.enviado = false; QZ.resultado = null;
    var el = $('#area-quiz'); if(el) el.dataset.montado = '0';
    pintaTrava(true);
    pintaQuiz(true);
    var a = $('#area-quiz'); if(a) a.scrollIntoView({behavior:'smooth', block:'start'});
    return true;
  }
  return false;
}

/* ------------------------------------------------------------ após desenhar */
function aoDesenhar(rota){
  if(rota.indexOf('#/convite/') === 0){ montaConvite(rota.split('/')[2]); return }
  if(rota.indexOf('#/motorista/treino/') === 0){
    var m = Store.mod(rota.split('/')[3]);
    if(!m) return;
    pintaTrava(false);
    Player.monta(m, Store.prog(Sessao.motorista, m.id), function(fim){
      pintaTrava(fim);
      pintaQuiz(fim);
    });
    return;
  }
  Player.destroi();
  if(rota.indexOf('#/gestor/aula/') === 0){ montaAulaForm(rota.split('/')[3]); return }
  if(Sessao.perfil === 'gestor' && Store.velho()){ Atualiza.agora(); return }
  if(rota.indexOf('#/gestor/motorista/') === 0 && typeof montaTentativas === 'function')
    montaTentativas(rota.split('/')[3]);
}
