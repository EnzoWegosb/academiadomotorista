/* ============================================================
   Gestão de Treinamentos — área do gestor.
   Visão geral, tabela por treinamento e ficha individual do motorista.
   ============================================================ */
var GS = {filtro:'todos', busca:''};

var FILTROS = [
  {k:'todos',        t:'Todos'},
  {k:'nao_iniciado', t:'Não iniciado'},
  {k:'andamento',    t:'Em andamento'},
  {k:'concluido',    t:'Concluído'},
  {k:'reprovado',    t:'Reprovado'}
];

/* ------------------------------------------------------------ apuração
   Tudo é recalculado do Store a cada desenho — inclusive o que o motorista
   acabou de fazer na outra área. Nenhum número fica fixo na interface. */
function apura(){
  var mods = Store.d.modulos, mot = Store.d.motoristas;
  var totalTreinos = mot.length * mods.length;
  var conc = 0, and = 0, repr = 0, naoIni = 0, somaNotas = 0, nNotas = 0;

  mot.forEach(function(d){
    mods.forEach(function(m){
      var p = Store.prog(d.id, m.id);
      if(!p) return;
      if(p.status === 'concluido')      conc++;
      else if(p.status === 'andamento') and++;
      else if(p.status === 'reprovado') repr++;
      else                              naoIni++;
      if(p.nota != null){ somaNotas += p.nota; nNotas++ }
    });
  });

  var porEstado = {todos:mot.length, nao_iniciado:0, andamento:0, concluido:0, reprovado:0};
  mot.forEach(function(d){ porEstado[Store.estado(d.id)]++ });

  return {
    motoristas: mot.length,
    totalTreinos: totalTreinos,
    // por TREINAMENTO (motorista × módulo)
    tConcluidos: conc, tAndamento: and, tReprovados: repr, tNaoIniciados: naoIni,
    tPendentes: totalTreinos - conc,
    taxa: pct(conc, totalTreinos),
    notaMedia: nNotas ? Math.round(somaNotas/nNotas) : 0,
    aproveitamento: (function(){
      var v = mot.map(function(d){ return Store.aproveitamento(d.id) }).filter(function(x){ return x != null });
      return v.length ? Math.round(v.reduce(function(s,x){ return s+x },0)/v.length) : null;
    })(),
    // por MOTORISTA
    porEstado: porEstado,
    concluiramTudo: porEstado.concluido,
    emTreinamento: porEstado.andamento + porEstado.reprovado,
    comPendencia: mot.length - porEstado.concluido
  };
}

function listaFiltrada(){
  var b = GS.busca.trim().toLowerCase();
  return Store.d.motoristas.filter(function(d){
    if(GS.filtro !== 'todos' && Store.estado(d.id) !== GS.filtro) return false;
    if(b && d.nome.toLowerCase().indexOf(b) < 0 && (d.cidade||'').toLowerCase().indexOf(b) < 0
       && d.usuario.indexOf(b) < 0) return false;
    return true;
  });
}

function barraFiltros(a){
  return '<div class="fl">' + FILTROS.map(function(f){
    return '<button class="fl-b'+(GS.filtro===f.k?' on':'')+'" data-fl="'+f.k+'">'
         + f.t+'<span class="ct">'+a.porEstado[f.k]+'</span></button>';
  }).join('') + '</div>';
}

/* célula de um treinamento na tabela */
function celTreino(d, m){
  var p = Store.prog(d.id, m.id) || {status:'nao_iniciado', assistido:0};
  var fv = Math.min(Math.round((p.assistido||0)/m.videoSeg*100), 100);
  var det;
  if(p.status === 'concluido')      det = p.nota + '%';
  else if(p.status === 'reprovado') det = p.nota + '%';
  else if(p.status === 'andamento') det = 'vídeo ' + fv + '%';
  else                              det = '—';
  return '<td><div class="cel"><span class="pill '+CLS[p.status]+'">'
       + '<span class="pd"></span>'+ROT[p.status]+'</span>'
       + '<span class="cel-d">'+det+'</span></div></td>';
}

/* ============================================================ visão geral */
function vazioGestor(){
  return ''
  + '<div class="topo"><div><div class="lbl">Gestão de Treinamentos</div>'
  +   '<h1 class="h1" style="margin-top:8px">Nenhum motorista ainda</h1></div></div>'
  + '<section class="cd vazio-g">'
  +   '<div class="res-ic" style="color:var(--az-tx)">'+ic('pessoas',40)+'</div>'
  +   '<h2 class="h2">Convide o primeiro motorista</h2>'
  +   '<p class="sub" style="max-width:52ch;margin:10px auto 22px">Você cadastra o nome, a senha e os dados; '
  +     'o sistema gera um link de convite para enviar por WhatsApp. O painel se preenche conforme '
  +     'os motoristas assistem às aulas e fazem os quizzes.</p>'
  +   '<button class="bt bt-pr" data-ir="#/gestor/novo">'+ic('seta',16)+' Convidar motorista</button>'
  + '</section>' + rodape();
}

function telaGestor(){
  if(!Store.d.motoristas.length) return vazioGestor();
  var a = apura();

  var porMod = Store.d.modulos.map(function(m){
    var c = {concluido:0, andamento:0, reprovado:0, nao_iniciado:0};
    Store.d.motoristas.forEach(function(d){
      var p = Store.prog(d.id, m.id);
      if(p) c[p.status]++;
    });
    var n = Store.d.motoristas.length;
    return '<div style="margin-bottom:22px">'
      + '<div style="display:flex;justify-content:space-between;gap:12px;margin-bottom:9px">'
      +   '<div style="font-size:14.5px;font-weight:640">'+esc(m.titulo)+'</div>'
      +   '<div class="mono" style="font-size:12.5px;color:var(--ink3);white-space:nowrap">'
      +     c.concluido+' de '+n+' concluíram</div></div>'
      + '<div class="pilha">'
      +   '<div style="width:'+pct(c.concluido,n)+'%;background:var(--ok)"></div>'
      +   '<div style="width:'+pct(c.andamento,n)+'%;background:var(--and-cl)"></div>'
      +   '<div style="width:'+pct(c.reprovado,n)+'%;background:var(--err)"></div>'
      +   '<div style="width:'+pct(c.nao_iniciado,n)+'%;background:var(--neu-cl)"></div>'
      + '</div>'
      + '<div class="leg-l">'
      +   '<span><i style="background:var(--ok)"></i>'+c.concluido+' concluído</span>'
      +   '<span><i style="background:var(--and-cl)"></i>'+c.andamento+' em andamento</span>'
      +   '<span><i style="background:var(--err)"></i>'+c.reprovado+' reprovado</span>'
      +   '<span><i style="background:var(--neu-cl)"></i>'+c.nao_iniciado+' não iniciado</span>'
      + '</div></div>';
  }).join('');

  function mini(lista, vazio){
    if(!lista.length) return '<div class="vazio">'+esc(vazio)+'</div>';
    return lista.map(function(d){
      var r = Store.resumo(d.id), e = Store.estado(d.id);
      return '<button class="lin" data-mot="'+d.id+'">'
        + '<span class="av av-sm">'+esc(d.ini)+'</span>'
        + '<span class="lin-n"><b>'+esc(d.nome)+'</b><i>'+esc(d.cidade||d.usuario)+'</i></span>'
        + '<span class="bar" style="max-width:76px"><span class="bar-f '
        +   (e==='concluido'?'ok':(e==='reprovado'?'err':'and'))+'" style="width:'+r.pct+'%"></span></span>'
        + '<span class="bar-n">'+r.pct+'%</span></button>';
    }).join('');
  }
  var ord = Store.d.motoristas.slice().sort(function(x,y){
    return Store.resumo(y.id).pct - Store.resumo(x.id).pct;
  });

  return ''
  + '<div class="topo"><div><div class="lbl">Gestão de Treinamentos</div>'
  +   '<h1 class="h1" style="margin-top:8px">Visão geral da Academia</h1>'
  +   '<p class="sub" style="margin-top:7px">'+Store.d.modulos.length
  +     ' treinamentos obrigatórios · '+a.motoristas+' motoristas parceiros</p></div>'
  + '<div class="bts"><button class="bt bt-ln bt-sm" data-ir="#/gestor/treinamentos">'
  +   ic('grade',16)+' Abrir a tabela</button>'
  + '<button class="bt bt-pr bt-sm" data-ir="#/gestor/novo">'+ic('seta',16)+' Convidar motorista</button></div></div>'

  /* --- os 5 indicadores pedidos --- */
  + '<div class="gr gr5" style="margin-bottom:10px">'
  +   '<div class="kpi"><div class="kpi-v">'+a.motoristas+'</div>'
  +     '<div class="kpi-l">Total de motoristas</div></div>'
  +   '<div class="kpi ok"><div class="kpi-v">'+a.concluiramTudo+'</div>'
  +     '<div class="kpi-l">Concluíram todos</div></div>'
  +   '<div class="kpi and"><div class="kpi-v">'+a.emTreinamento+'</div>'
  +     '<div class="kpi-l">Em treinamento</div></div>'
  +   '<div class="kpi err"><div class="kpi-v">'+a.comPendencia+'</div>'
  +     '<div class="kpi-l">Com pendências</div></div>'
  +   '<div class="kpi az"><div class="kpi-v">'+a.taxa+'<span class="u">%</span></div>'
  +     '<div class="kpi-l">Taxa de conclusão</div></div>'
  + '</div>'
  + '<div class="nota" style="margin:0 0 20px">'
  +   '<b>Como ler:</b> “Em treinamento” são os que começaram e ainda não terminaram '
  +   '(inclui quem foi reprovado e pode refazer). “Com pendências” é o total menos quem '
  +   'concluiu todos — por isso engloba também quem nem começou. '
  +   'A taxa de conclusão é sobre <b>treinamentos</b>: '+a.tConcluidos+' de '+a.totalTreinos
  +   ' (motoristas × '+Store.d.modulos.length+').</div>'

  + '<div class="gr gr2" style="margin-bottom:18px">'
  +   '<section class="cd"><div class="lbl" style="margin-bottom:18px">Avanço por treinamento</div>'
  +     porMod+'</section>'
  +   '<section class="cd">'
  +     '<div class="lbl" style="margin-bottom:16px">Situação dos motoristas</div>'
  +     '<div class="est-gr">'
  +       ['concluido','andamento','reprovado','nao_iniciado'].map(function(k){
            return '<div class="est"><div class="est-v '+ABR[k]+'">'+a.porEstado[k]+'</div>'
                 + '<div class="kpi-l">'+ROT[k]+'</div></div>';
          }).join('')
  +     '</div>'
  +     '<div style="margin-top:24px;padding-top:20px;border-top:1px solid var(--line);'
  +       'display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap">'
  +       '<div><div class="kpi-l" style="margin:0 0 5px">Aproveitamento médio</div>'
  +         '<div style="font-size:23px;font-weight:750">'+(a.aproveitamento!=null?a.aproveitamento+'%':'—')+'</div>'
  +         '<div class="sub" style="font-size:11.5px">nota na 1ª tentativa</div></div>'
  +       '<div><div class="kpi-l" style="margin:0 0 5px">Nota de aprovação</div>'
  +         '<div style="font-size:23px;font-weight:750">'+Store.d.aprovacao+'%</div></div>'
  +       '<div><div class="kpi-l" style="margin:0 0 5px">Treinamentos pendentes</div>'
  +         '<div style="font-size:23px;font-weight:750">'+a.tPendentes+'</div></div>'
  +     '</div>'
  +   '</section>'
  + '</div>'

  + '<div class="gr gr2">'
  +   '<section class="cd"><div class="lbl" style="margin-bottom:8px">Mais avançados</div>'
  +     mini(ord.slice(0,5),'Sem dados')+'</section>'
  +   '<section class="cd"><div class="lbl" style="margin-bottom:8px">Precisam de atenção</div>'
  +     mini(ord.slice(-5).reverse(),'Sem dados')+'</section>'
  + '</div>'
  + rodape();
}

/* ============================================================ tabela */
function telaGestorTreinamentos(){
  if(!Store.d.motoristas.length) return vazioGestor();
  var a = apura();
  var lista = listaFiltrada();
  var mods = Store.d.modulos;

  var linhas = lista.map(function(d){
    var r = Store.resumo(d.id), e = Store.estado(d.id);
    var md = Store.media(d.id), ult = Store.ultima(d.id);
    return '<tr class="cli" data-mot="'+d.id+'" tabindex="0">'
      + '<td><div class="nm"><div class="av av-sm">'+esc(d.ini)+'</div>'
      +   '<div><b>'+esc(d.nome)+'</b><span>'+esc(d.usuario)+(d.cidade?' · '+esc(d.cidade):'')+'</span>'
      +   tagAcesso(d)+'</div></div></td>'
      + mods.map(function(m){ return celTreino(d, m) }).join('')
      + '<td><div class="bar-w"><div class="bar" style="max-width:74px">'
      +   '<div class="bar-f '+(e==='concluido'?'ok':(e==='reprovado'?'err':'and'))
      +   '" style="width:'+r.pct+'%"></div></div><div class="bar-n">'+r.pct+'%</div></div></td>'
      + '<td class="mono">'+(md != null ? md+'%' : '—')+'</td>'
      + '<td class="mono">'+(ult || '—')+'</td>'
      + '</tr>';
  }).join('');

  var corpo = lista.length
    ? '<div class="tb-w"><table class="tb tb-tr"><thead><tr>'
      + '<th>Motorista</th>'
      + mods.map(function(m){ return '<th>'+esc(m.curto)+'</th>' }).join('')
      + '<th>Progresso</th><th>Média dos quizzes</th><th>Última atividade</th>'
      + '</tr></thead><tbody>'+linhas+'</tbody></table></div>'
    : '<div class="cd vazio"><div class="ic">'+ic('pessoas',36)+'</div>'
      + '<div>Nenhum motorista neste filtro.</div></div>';

  return ''
  + '<div class="topo"><div><div class="lbl">Gestão de Treinamentos</div>'
  +   '<h1 class="h1" style="margin-top:8px">Acompanhamento por motorista</h1>'
  +   '<p class="sub" style="margin-top:7px">'+lista.length+' de '+a.motoristas
  +     ' motoristas · clique em uma linha para abrir o histórico</p></div>'
  + '<button class="bt bt-pr bt-sm" data-ir="#/gestor/novo">'+ic('seta',16)+' Convidar motorista</button></div>'

  + '<div class="gr gr5" style="margin-bottom:20px">'
  +   '<div class="kpi"><div class="kpi-v">'+a.motoristas+'</div><div class="kpi-l">Total de motoristas</div></div>'
  +   '<div class="kpi ok"><div class="kpi-v">'+a.concluiramTudo+'</div><div class="kpi-l">Concluíram todos</div></div>'
  +   '<div class="kpi and"><div class="kpi-v">'+a.emTreinamento+'</div><div class="kpi-l">Em treinamento</div></div>'
  +   '<div class="kpi err"><div class="kpi-v">'+a.comPendencia+'</div><div class="kpi-l">Com pendências</div></div>'
  +   '<div class="kpi az"><div class="kpi-v">'+a.taxa+'<span class="u">%</span></div><div class="kpi-l">Taxa de conclusão</div></div>'
  + '</div>'

  + '<div class="topo" style="margin-bottom:16px;align-items:center">'
  +   barraFiltros(a)
  +   '<input id="gs-busca" class="bt bt-ln bt-sm" style="min-width:230px;justify-content:flex-start" '
  +     'placeholder="Buscar por nome ou cidade" value="'+esc(GS.busca)+'" aria-label="Buscar motorista">'
  + '</div>'
  + corpo
  + rodape();
}

/* ============================================================ ficha do motorista */
/* ============================================================ link do convite */
function linkConvite(token){
  return location.origin + location.pathname + '#/convite/' + token;
}
function msgConvite(d, senha){
  return 'Olá, ' + d.nome.split(' ')[0] + '! Você foi cadastrado na Academia do Motorista.\n\n'
       + 'Acesse: ' + linkConvite(d.convite_token) + '\n'
       + 'Usuário: ' + d.usuario + '\n'
       + (senha ? 'Senha: ' + senha + '\n' : 'Senha: a que eu te passei\n')
       + '\nSão 3 treinamentos em vídeo, cada um com um quiz. Bom treinamento!';
}

function tagAcesso(d){
  /* motoristas fictícios criados para teste (supabase/exemplos.py) */
  var ex = /^EXEMPLO/.test(d.observacoes || '') ? '<em class="tg-a ex">Exemplo</em> ' : '';
  return ex + tagSituacao(d);
}
function tagSituacao(d){
  if(!d.ativo) return '<em class="tg-a off">Desativado</em>';
  if(!d.primeiro_acesso_em) return '<em class="tg-a pend">Aguardando 1º acesso</em>';
  return '';
}

/* ============================================================ ficha do motorista */
function telaGestorDetalhe(id){
  var d = Store.motorista(id);
  if(!d){ location.hash = '#/gestor/treinamentos'; return '' }
  var r = Store.resumo(id), e = Store.estado(id);
  var md = Store.media(id), apv = Store.aproveitamento(id), ult = Store.ultima(id);

  var fichas = Store.d.modulos.map(function(m){
    var p = Store.prog(id, m.id);
    var fv = Math.min(Math.round((p.assistido||0)/m.videoSeg*100), 100);
    var cor = p.status === 'concluido' ? 'ok' : (p.status === 'reprovado' ? 'err'
            : (p.status === 'andamento' ? 'and' : 'neu'));
    return '<section class="cd" style="margin-bottom:14px">'
      + '<div class="mod-hd" style="margin-bottom:16px">'
      +   '<div style="min-width:0"><div class="mod-n">TREINAMENTO '+String(m.ord).padStart(2,'0')+'</div>'
      +   '<h3 class="h3">'+esc(m.titulo)+'</h3></div>'+selo(p.status)+'</div>'
      + '<div class="bar-w" style="margin-bottom:6px">'
      +   '<div class="bar"><div class="bar-f '+cor+'" style="width:'+fv+'%"></div></div>'
      +   '<div class="bar-n">'+fv+'%</div>'
      +   '<span class="sub" style="font-size:12.5px;white-space:nowrap">do vídeo</span></div>'
      + '<div class="sub" style="font-size:12.5px;margin-bottom:18px">'
      +   (p.aulaAdiantada
            ? '<em class="tg-a pend">Aula adiantada</em> liberada pelo botão de demonstração, sem assistir ao vídeo'
            : mmss(p.assistido)+' de '+mmss(m.videoSeg)+' assistidos, conferidos pelo servidor')+'</div>'
      + '<div class="ficha">'
      +   '<div><span class="kpi-l">Nota</span><b>'+(p.nota!=null ? p.nota+'%' : '—')+'</b></div>'
      +   '<div><span class="kpi-l">1ª tentativa</span><b>'+(p.notaPrimeira!=null ? p.notaPrimeira+'%' : '—')+'</b></div>'
      +   '<div><span class="kpi-l">Tentativas</span><b>'+(p.tentativas||0)+'</b></div>'
      +   '<div><span class="kpi-l">Conclusão</span><b>'+(p.concluidoEm || '—')+'</b></div>'
      +   '<div><span class="kpi-l">Última atividade</span><b>'+(p.ultima || '—')+'</b></div>'
      + '</div>'
      + '<div class="tent" id="tent-'+m.id+'"></div>'
      + '</section>';
  }).join('');

  var cad = function(r, v){ return '<div class="ficha-l"><span class="kpi-l">'+r+'</span><b>'+(v ? esc(v) : '—')+'</b></div>' };

  return ''
  + '<button class="volta" data-ir="#/gestor/treinamentos">'+ic('volta',16)+' Voltar à lista</button>'
  + '<section class="hero" style="margin-bottom:20px">'
  +   '<div class="av av-lg" style="flex:none">'+esc(d.ini)+'</div>'
  +   '<div class="hero-tx">'
  +     '<div class="lbl lbl-nv">Histórico de treinamento</div>'
  +     '<h1 class="h2">'+esc(d.nome)+'</h1>'
  +     '<p>'+esc([d.cidade && (d.cidade + (d.uf ? '/'+d.uf : '')), d.veiculo, d.placa && 'placa '+d.placa]
             .filter(Boolean).join(' · ') || 'Cadastro sem cidade e veículo')+'</p>'
  +     '<div class="hero-st">'
  +       '<div class="i"><span class="iv">'+r.ok+' de '+r.total+'</span><span class="il">Concluídos</span></div>'
  +       '<div class="i"><span class="iv">'+(apv!=null?apv+'%':'—')+'</span><span class="il">Aproveitamento</span></div>'
  +       '<div class="i"><span class="iv">'+(md!=null?md+'%':'—')+'</span><span class="il">Média dos quizzes</span></div>'
  +       '<div class="i"><span class="iv">'+(ult||'—')+'</span><span class="il">Última atividade</span></div>'
  +     '</div>'
  +   '</div>'
  +   anel(r.pct, 132)
  + '</section>'

  /* ---- acesso e convite ---- */
  + '<section class="cd" style="margin-bottom:18px">'
  +   '<div class="topo" style="margin-bottom:14px;align-items:center">'
  +     '<div><div class="lbl">Acesso</div>'
  +       '<div style="margin-top:6px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">'
  +         '<b style="font-size:16px">'+esc(d.usuario)+'</b>'+tagAcesso(d)
  +         (d.ativo && d.primeiro_acesso_em ? '<em class="tg-a ok">1º acesso em '+esc(dataBR(d.primeiro_acesso_em))+'</em>' : '')
  +       '</div></div>'
  +     '<div class="bts">'
  +       '<button class="bt bt-ln bt-sm" data-ir="#/gestor/editar/'+d.id+'">'+ic('escudo',15)+' Editar cadastro</button>'
  +       '<button class="bt bt-ln bt-sm" data-acao="senha" data-id="'+d.id+'">'+ic('cadeado',15)+' Nova senha</button>'
  +       (d.ativo
          ? '<button class="bt bt-ln bt-sm bt-risco" data-acao="desativar" data-id="'+d.id+'">Desativar acesso</button>'
          : '<button class="bt bt-pr bt-sm" data-acao="reativar" data-id="'+d.id+'">Reativar acesso</button>')
  +     '</div>'
  +   '</div>'
  +   '<div id="painel-senha"></div>'
  +   (d.ativo
      ? '<div class="convite">'
      +   '<div class="kpi-l" style="margin:0 0 7px">Link de convite</div>'
      +   '<div class="cv-link"><code>'+esc(linkConvite(d.convite_token))+'</code></div>'
      +   '<div class="bts" style="margin-top:12px">'
      +     '<button class="bt bt-pr bt-sm" data-copia="'+esc(msgConvite(d))+'">'+ic('livro',15)+' Copiar mensagem</button>'
      +     '<button class="bt bt-ln bt-sm" data-copia="'+esc(linkConvite(d.convite_token))+'">Copiar só o link</button>'
      +     '<button class="bt bt-gh bt-sm" data-acao="novo_convite" data-id="'+d.id+'">Gerar novo link</button>'
      +   '</div>'
      +   '<div class="sub" style="font-size:12.5px;margin-top:10px">O link mostra o nome e o usuário; '
      +     'o motorista só entra com a senha. Gerar um novo link invalida o anterior.</div>'
      + '</div>'
      : '<div class="nota" style="margin-top:4px">Acesso desativado: o motorista não consegue entrar '
      +   'e o link de convite não funciona. O histórico continua guardado.</div>')
  + '</section>'

  + '<div class="topo" style="margin:0 0 14px;align-items:center">'
  +   '<h2 class="h2">Detalhe por treinamento</h2>'+selo(e)+'</div>'
  + fichas

  + '<section class="cd" style="margin-top:18px"><div class="lbl" style="margin-bottom:14px">Cadastro</div>'
  +   '<div class="ficha ficha-cad">'
  +     cad('CPF', fmtCPF(d.cpf)) + cad('Telefone', d.telefone) + cad('E-mail de contato', d.email_contato)
  +     cad('Cidade', d.cidade ? d.cidade + (d.uf ? '/' + d.uf : '') : '')
  +     cad('CNH', d.cnh_categoria ? 'Cat. ' + d.cnh_categoria + (d.cnh_validade ? ' · val. ' + dataBR(d.cnh_validade) : '') : '')
  +     cad('Veículo', d.veiculo) + cad('Placa', d.placa) + cad('Início', dataBR(d.inicio))
  +     cad('Cadastrado em', dataBR(d.criado_em))
  +   '</div>'
  +   (d.observacoes ? '<div class="sub" style="margin-top:14px"><b>Observações:</b> '+esc(d.observacoes)+'</div>' : '')
  + '</section>'
  + rodape();
}

/* histórico de tentativas, carregado sob demanda */
function montaTentativas(id){
  Api.sel('tentativas', 'select=modulo_id,numero,acertos,total,nota,aprovado,enviado_em&motorista_id=eq.'+id+'&order=enviado_em')
    .then(function(ts){
      Store.d.modulos.forEach(function(m){
        var el = $('#tent-'+m.id);
        if(!el) return;
        var t = ts.filter(function(x){ return x.modulo_id === m.id });
        if(!t.length){ el.innerHTML = ''; return }
        el.innerHTML = '<div class="kpi-l" style="margin:18px 0 8px">Tentativas do quiz</div>'
          + '<div class="tent-l">' + t.map(function(x){
              return '<div class="tent-i"><span class="mono">#'+x.numero+'</span>'
                + '<span>'+esc(dataHoraBR(x.enviado_em))+'</span>'
                + '<span class="mono">'+x.acertos+'/'+x.total+'</span>'
                + '<b>'+x.nota+'%</b>'
                + (x.aprovado ? '<span class="pill is-ok"><span class="pd"></span>Aprovado</span>'
                              : '<span class="pill is-err"><span class="pd"></span>Reprovado</span>')
                + '</div>';
            }).join('') + '</div>';
      });
    }).catch(function(){});
}

/* ============================================================ formulário */
var CAMPOS_CAD = [
  ['nome','Nome completo','text',true],
  ['cpf','CPF','text'], ['telefone','Telefone / WhatsApp','tel'], ['email_contato','E-mail de contato','email'],
  ['cidade','Cidade','text'], ['uf','UF','text'],
  ['cnh_categoria','Categoria da CNH','text'], ['cnh_validade','Validade da CNH','date'],
  ['veiculo','Veículo','text'], ['placa','Placa','text'], ['inicio','Data de início','date']
];

function telaGestorForm(id){
  var d = id ? Store.motorista(id) : null;
  if(id && !d){ location.hash = '#/gestor/treinamentos'; return '' }
  var v = function(k){ return d && d[k] != null ? esc(d[k]) : '' };

  var campos = CAMPOS_CAD.map(function(c){
    var extra = c[0] === 'uf' ? ' maxlength="2" style="text-transform:uppercase"' : '';
    if(c[0] === 'cpf') extra = ' inputmode="numeric" placeholder="000.000.000-00"';
    return '<label class="cp'+(c[0]==='nome'?' cp-lg':'')+'"><span class="cp-l">'+c[1]+(c[3]?' *':'')+'</span>'
         + '<input class="in" name="'+c[0]+'" type="'+c[2]+'" value="'+v(c[0])+'"'+(c[3]?' required':'')+extra+'></label>';
  }).join('');

  return ''
  + '<button class="volta" data-ir="'+(d ? '#/gestor/motorista/'+d.id : '#/gestor/treinamentos')+'">'
  +   ic('volta',16)+' Voltar</button>'
  + '<div class="topo"><div><div class="lbl">'+(d ? 'Editar cadastro' : 'Convidar motorista')+'</div>'
  +   '<h1 class="h1" style="margin-top:8px">'+(d ? esc(d.nome) : 'Novo motorista')+'</h1>'
  +   '<p class="sub" style="margin-top:7px">'+(d
        ? 'Só a supervisão altera estes dados. O motorista vê, mas não edita.'
        : 'Você define o nome, a senha e os dados. Ao salvar, o sistema gera o link de convite.')+'</p></div></div>'
  + '<form id="f-motorista" class="cd fm" data-id="'+(d ? d.id : '')+'">'
  +   '<div class="fm-gr">' + campos
  +     (d ? '' :
          '<label class="cp"><span class="cp-l">Usuário (opcional)</span>'
        + '<input class="in" name="usuario" autocapitalize="none" spellcheck="false" placeholder="gerado a partir do nome"></label>'
        + '<label class="cp"><span class="cp-l">Senha inicial *</span>'
        + '<div class="in-g"><input class="in" name="senha" id="in-senha" type="text" minlength="8" required '
        +   'autocomplete="off" value="'+sugereSenha()+'">'
        + '<button type="button" class="bt bt-ln bt-sm" id="bt-sug">Outra</button></div></label>')
  +     '<label class="cp cp-lg"><span class="cp-l">Observações</span>'
  +       '<textarea class="in" name="observacoes" rows="3">'+v('observacoes')+'</textarea></label>'
  +   '</div>'
  +   '<div class="fm-err" id="fm-err" role="alert"></div>'
  +   '<div class="bts" style="margin-top:6px">'
  +     '<button class="bt bt-pr" type="submit" id="bt-salvar">'+(d ? 'Salvar alterações' : 'Cadastrar e gerar convite')+'</button>'
  +   '</div>'
  + '</form>'
  + '<div id="resultado-convite"></div>'
  + rodape();
}

/* senha legível para ditar ou mandar por mensagem: sem 0/O, 1/l/I */
function sugereSenha(){
  var L = 'abcdefghjkmnpqrstuvwxyz', N = '23456789', r = '';
  var a = new Uint32Array(8);
  (window.crypto || window.msCrypto).getRandomValues(a);
  for(var i = 0; i < 6; i++) r += L[a[i] % L.length];
  return r.charAt(0).toUpperCase() + r.slice(1) + N[a[6] % N.length] + N[a[7] % N.length];
}

function dadosForm(f){
  var o = {};
  CAMPOS_CAD.concat([['observacoes']]).forEach(function(c){
    if(f[c[0]]) o[c[0]] = f[c[0]].value.trim();
  });
  return o;
}

function submitGestor(e){
  var f = e.target;
  if(f.id === 'f-senha'){ e.preventDefault(); trocaSenha(f); return true }
  if(f.id !== 'f-motorista') return false;
  e.preventDefault();
  var id = f.dataset.id, bt = $('#bt-salvar'), err = $('#fm-err');
  var corpo = dadosForm(f);
  err.textContent = '';
  if(id){ corpo.acao = 'atualizar'; corpo.id = id }
  else {
    corpo.acao = 'criar';
    corpo.senha = f.senha.value;
    if(f.usuario.value.trim()) corpo.usuario = f.usuario.value.trim().toLowerCase();
  }
  bt.disabled = true; bt.textContent = 'Salvando…';
  Api.fn(corpo).then(function(r){
    return Store.carrega().then(function(){ return r });
  }).then(function(r){
    if(id){ aviso('Cadastro atualizado.'); Rota.ir('#/gestor/motorista/'+id); return }
    var d = Store.motorista(r.id);
    f.style.display = 'none';
    $('#resultado-convite').innerHTML = ''
      + '<section class="cd convite-ok">'
      +   '<div class="res-ic" style="color:var(--ok)">'+ic('check',34)+'</div>'
      +   '<h2 class="h2">'+esc(d.nome)+' foi cadastrado</h2>'
      +   '<p class="sub" style="margin:8px 0 20px">Envie a mensagem abaixo ao motorista. '
      +     '<b>Esta é a única vez que a senha aparece</b> — depois, só dá para definir uma nova.</p>'
      +   '<div class="ficha" style="grid-template-columns:repeat(2,1fr);border:0;padding:0;margin-bottom:18px">'
      +     '<div><span class="kpi-l">Usuário</span><b id="cv-usuario">'+esc(r.usuario)+'</b></div>'
      +     '<div><span class="kpi-l">Senha</span><b id="cv-senha">'+esc(corpo.senha)+'</b></div>'
      +   '</div>'
      +   '<pre class="cv-msg" id="cv-msg">'+esc(msgConvite(d, corpo.senha))+'</pre>'
      +   '<div class="bts" style="margin-top:14px">'
      +     '<button class="bt bt-pr" data-copia="'+esc(msgConvite(d, corpo.senha))+'">'+ic('livro',16)+' Copiar mensagem</button>'
      +     '<button class="bt bt-ln" data-ir="#/gestor/motorista/'+r.id+'">Ver ficha</button>'
      +     '<button class="bt bt-gh" data-ir="#/gestor/novo">Convidar outro</button>'
      +   '</div>'
      + '</section>';
  }).catch(function(x){
    err.textContent = erroLegivel(x);
    bt.disabled = false; bt.textContent = id ? 'Salvar alterações' : 'Cadastrar e gerar convite';
  });
  return true;
}

function trocaSenha(f){
  var bt = $('button[type=submit]', f), err = $('.fm-err', f), s = f.senha.value;
  err.textContent = '';
  bt.disabled = true;
  Api.fn({acao:'senha', id:f.dataset.id, senha:s}).then(function(){
    $('#painel-senha').innerHTML = '<div class="trava lib" style="margin-bottom:14px"><span class="ic">'+ic('check',19)+'</span>'
      + '<span><b>Senha alterada.</b> Nova senha: <b class="mono">'+esc(s)+'</b> — '
      + 'envie ao motorista; ela não será exibida de novo.</span></div>';
  }).catch(function(x){ err.textContent = erroLegivel(x); bt.disabled = false });
}

/* ------------------------------------------------------------ cliques */
function cliqueGestor(e){
  var t;
  if((t = e.target.closest('[data-fl]'))){ GS.filtro = t.dataset.fl; desenha(); return true }
  if((t = e.target.closest('#bt-sug'))){ $('#in-senha').value = sugereSenha(); return true }
  if((t = e.target.closest('[data-acao]'))){ acaoGestor(t.dataset.acao, t.dataset.id, t); return true }
  if((t = e.target.closest('[data-mot]'))){ Rota.ir('#/gestor/motorista/'+t.dataset.mot); return true }
  return false;
}

function acaoGestor(acao, id, bt){
  var d = Store.motorista(id);
  if(acao === 'senha'){
    $('#painel-senha').innerHTML = '<form id="f-senha" class="fm senha-f" data-id="'+id+'">'
      + '<label class="cp"><span class="cp-l">Nova senha para '+esc(d.nome.split(' ')[0])+'</span>'
      + '<input class="in mono" name="senha" type="text" minlength="8" required value="'+sugereSenha()+'"></label>'
      + '<button class="bt bt-pr bt-sm" type="submit">Definir senha</button>'
      + '<div class="fm-err"></div></form>';
    return;
  }
  var perg = {
    desativar: 'Desativar o acesso de '+d.nome+'?\n\nEle deixa de conseguir entrar e o link de convite para de funcionar. '
             + 'O histórico de treinamento é mantido e você pode reativar depois.',
    novo_convite: 'Gerar um novo link de convite para '+d.nome+'?\n\nO link atual deixa de funcionar.'
  }[acao];
  if(perg && !confirm(perg)) return;
  bt.disabled = true;
  Api.fn({acao:acao, id:id}).then(function(){
    aviso({desativar:'Acesso desativado.', reativar:'Acesso reativado.', novo_convite:'Novo link gerado.'}[acao]);
    return recarrega();
  }).catch(function(x){ bt.disabled = false; aviso(erroLegivel(x), 'err') });
}

/* abrir a ficha pelo teclado, na linha da tabela */
document.addEventListener('keydown', function(e){
  if(e.key !== 'Enter' && e.key !== ' ') return;
  var t = e.target.closest ? e.target.closest('tr.cli[data-mot]') : null;
  if(!t) return;
  e.preventDefault();
  Rota.ir('#/gestor/motorista/'+t.dataset.mot);
});

/* busca na tabela */
document.addEventListener('input', function(e){
  if(e.target && e.target.id === 'gs-busca'){
    GS.busca = e.target.value;
    clearTimeout(GS._t);
    GS._t = setTimeout(function(){
      var tinha = document.activeElement === $('#gs-busca');
      desenha();
      if(tinha){ var b = $('#gs-busca'); if(b){ b.focus(); b.setSelectionRange(b.value.length,b.value.length) } }
    }, 220);
  }
});
