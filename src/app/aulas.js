/* ============================================================
   Aulas — o supervisor cria e edita aulas: vídeo (link do YouTube ou arquivo),
   título, quem recebe e as perguntas do quiz (manuais ou geradas por IA).

   Toda validação de verdade acontece no banco (salvar_aula). Aqui ela existe
   só para avisar antes de enviar.
   ============================================================ */
var LIMITE_ARQUIVO = 50 * 1024 * 1024;   /* limite do plano atual do Supabase */
var AF = null;                            /* estado do formulário de aula */

function idYouTube(txt){
  txt = String(txt || '').trim();
  if(/^[A-Za-z0-9_-]{11}$/.test(txt)) return txt;
  var m = txt.match(/(?:youtu\.be\/|[?&]v=|\/shorts\/|\/embed\/|\/live\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}
function lerDuracao(txt){
  var m = String(txt || '').trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
  if(m) return (+(m[1] || 0)) * 3600 + (+m[2]) * 60 + (+m[3]);
  var n = parseInt(txt, 10);
  return isNaN(n) ? null : n * 60;
}
function fmtDur(s){
  if(!s) return '';
  var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = Math.round(s % 60);
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0');
}
function mb(b){ return (b / 1024 / 1024).toFixed(1).replace('.', ',') + ' MB' }
function souExemplo(){ return !!(Sessao.eu && Sessao.eu.exemplo) }
/* toda aula que o supervisor enxerga pode ser editada (a conta de demonstração inclusive) */
function possoEditar(m){ return true }
/* arquivar some com a aula para TODOS: a conta de demonstração só arquiva aulas
   criadas por contas de demonstração (os supervisores que ela enxerga são da mesma classe) */
function possoArquivar(m){
  if(!souExemplo()) return true;
  return !!m.criadoPor && (Store.d.perfis || []).some(function(p){ return p.id === m.criadoPor && p.exemplo });
}
function rotuloQuem(m, n){
  if(m.publico === 'todos') return 'Todos os motoristas';
  if(m.publico === 'exemplos') return 'Todos os motoristas de exemplo';
  return n + ' motorista' + (n === 1 ? '' : 's');
}

/* ============================================================ lista */
function telaAulas(){
  var aulas = Store.d.aulas.slice().sort(function(a, b){ return (b.ativo - a.ativo) || (a.ord - b.ord) });
  var lin = aulas.map(function(m){
    var alvo = Store.d.motoristas.filter(function(d){ return Store.atribuida(d.id, m) });
    var ok = alvo.filter(function(d){ return Store.prog(d.id, m.id).status === 'concluido' }).length;
    var quem = rotuloQuem(m, alvo.length);
    return '<article class="aula-l'+(m.ativo ? '' : ' aula-off')+'">'
      + '<div class="mod-ic">'+ic(IC_TEMA[m.tema] || 'play', 22)+'</div>'
      + '<div class="aula-c">'
      +   '<div class="aula-t"><b>'+esc(m.titulo)+'</b>'
      +     (m.ativo ? '' : ' <em class="tg-a off">Arquivada</em>')
      +     (m.criadoPor ? '' : ' <em class="tg-a ok">Trilha inicial</em>') + '</div>'
      +   '<div class="aula-m">'
      +     '<span>'+ic(m.videoTipo === 'arquivo' ? 'livro' : 'play', 14)+(m.videoTipo === 'arquivo' ? 'Vídeo próprio' : 'YouTube')+'</span>'
      +     '<span>'+ic('relogio', 14)+esc(m.duracao)+'</span>'
      +     '<span>'+ic('pessoas', 14)+esc(quem)+'</span>'
      +     '<span>'+ic('check', 14)+m.quiz.length+' pergunta'+(m.quiz.length === 1 ? '' : 's')+'</span>'
      +     '<span>'+ic('grafico', 14)+ok+' de '+alvo.length+' concluíram</span>'
      +   '</div>'
      + '</div>'
      + '<div class="bts">'
      +   '<button class="bt bt-ln bt-sm" data-ir="#/gestor/aula/'+m.id+'">Editar</button>'
      +   (possoArquivar(m) ? '<button class="bt bt-gh bt-sm" data-arquiva="'+m.id+'" data-ativo="'+(m.ativo ? '0' : '1')+'">'
                          + (m.ativo ? 'Arquivar' : 'Reativar')+'</button>' : '')
      + '</div>'
      + '</article>';
  }).join('');

  return ''
  + '<div class="topo"><div><div class="lbl">Aulas</div>'
  +   '<h1 class="h1" style="margin-top:8px">Aulas da Academia</h1>'
  +   '<p class="sub" style="margin-top:7px">Vídeo do YouTube ou arquivo próprio, para todos ou para motoristas escolhidos.</p></div>'
  + '<button class="bt bt-pr bt-sm" data-ir="#/gestor/aula/nova">'+ic('play', 16)+' Nova aula</button></div>'
  + (souExemplo() ? nota('<b>Conta de demonstração:</b> as aulas que você criar alcançam só motoristas de exemplo — '
                       + '"Todos os motoristas", aqui, são todos os motoristas de exemplo.') : '')
  + '<div class="aula-lista">' + (lin || '<div class="cd vazio">Nenhuma aula.</div>') + '</div>'
  + rodape();
}

/* ============================================================ formulário */
function telaAulaForm(id){
  var nova = id === 'nova';
  var m = nova ? null : Store.d.aulas.filter(function(x){ return x.id === id })[0];
  if(!nova && (!m || !possoEditar(m))){ location.hash = '#/gestor/aulas'; return '' }
  AF = {id: nova ? null : id, carregado: nova, tipo: m ? m.videoTipo : 'youtube',
        videoId: m ? m.video : null, arquivo: m ? m.arquivo : null, file: null,
        seg: m ? m.videoSeg : null, pubOrig: m ? m.publico : null, arquivoOrig: m ? m.arquivo : null,
        /* "todos" é uma opção clicável acima da lista (não uma aba) */
        todos: m ? m.publico !== 'selecionados' : false,
        /* a conta de demonstração edita aula aberta a todos, mas não muda quem a recebe */
        publicoTravado: !!(m && souExemplo() && m.publico === 'todos'),
        motoristas: {}, perguntas: [], tentativas: 0, perguntasOrig: '', busca: ''};
  if(nova) AF.perguntas = [novaPergunta()];

  return ''
  + '<button class="volta" data-ir="#/gestor/aulas">'+ic('volta', 16)+' Voltar às aulas</button>'
  + '<div class="topo"><div><div class="lbl">'+(nova ? 'Nova aula' : 'Editar aula')+'</div>'
  +   '<h1 class="h1" style="margin-top:8px">'+(nova ? 'Criar aula' : esc(m.titulo))+'</h1></div></div>'
  + '<form id="f-aula" class="fm" novalidate>'
  +   '<div id="af-corpo">' + (nova ? corpoAula(null) : carregando('Carregando a aula…')) + '</div>'
  + '</form>'
  + rodape();
}

function novaPergunta(){ return {enunciado: '', alternativas: ['', '', '', ''], correta: null} }

function corpoAula(m){
  var travado = false;
  return ''
  /* ---- 1. vídeo ---- */
  + '<section class="cd"><div class="lbl" style="margin-bottom:14px">1 · Vídeo</div>'
  + (AF.tentativas > 0 ? nota('<b>Esta aula já tem '+AF.tentativas+' tentativa'+(AF.tentativas === 1 ? '' : 's')+' de quiz.</b> '
       + 'As notas já registradas continuam valendo; o que você mudar aqui vale para as próximas tentativas.') : '')
  + '<div class="segm" role="radiogroup">'
  +   '<button type="button" class="segm-b'+(AF.tipo === 'youtube' ? ' on' : '')+'" data-tipo="youtube"'+(travado ? ' disabled' : '')+'>'
  +     ic('play', 15)+' Link do YouTube</button>'
  +   '<button type="button" class="segm-b'+(AF.tipo === 'arquivo' ? ' on' : '')+'" data-tipo="arquivo"'+(travado ? ' disabled' : '')+'>'
  +     ic('livro', 15)+' Arquivo de vídeo</button>'
  + '</div>'
  + '<div id="af-video">' + blocoVideo(travado) + '</div>'
  + '<label class="cp" style="max-width:220px;margin-top:14px"><span class="cp-l">Duração (min:seg)</span>'
  +   '<input class="in" id="af-dur" value="'+esc(fmtDur(AF.seg))+'" placeholder="ex.: 10:30"'+(travado ? ' readonly' : '')+'></label>'
  + '<div class="sub" style="font-size:12.5px;margin-top:6px" id="af-dur-st">'
  +   (AF.seg ? 'O quiz libera depois de ' + Math.round(Store.d.limiarVideo * 100) + '% da aula assistida.' : 'Preenchida automaticamente ao escolher o vídeo.')
  + '</div></section>'

  /* ---- 2. conteúdo ---- */
  + '<section class="cd"><div class="lbl" style="margin-bottom:14px">2 · Aula</div><div class="fm-gr">'
  +   '<label class="cp cp-lg"><span class="cp-l">Título *</span>'
  +     '<input class="in" id="af-titulo" maxlength="120" value="'+esc(m ? m.titulo : '')+'"></label>'
  +   '<label class="cp cp-lg"><span class="cp-l">Descrição</span>'
  +     '<textarea class="in" id="af-desc" rows="2" maxlength="400">'+esc(m ? m.desc : '')+'</textarea></label>'
  + '</div></section>'

  /* ---- 3. quem recebe ---- */
  + '<section class="cd"><div class="lbl" style="margin-bottom:14px">3 · Quem recebe</div>'
  + '<div id="af-mot">' + blocoMotoristas() + '</div></section>'

  /* ---- 4. perguntas ---- */
  + '<section class="cd"><div class="topo" style="margin-bottom:12px;align-items:center">'
  +   '<div class="lbl">4 · Perguntas do quiz</div>'
  +   (travado ? '' : '<button type="button" class="bt bt-ln bt-sm" id="af-ia">'+ic('estrela', 15)+' Gerar com IA</button>')
  + '</div>'
  + '<div id="af-ia-p"></div>'
  + '<div id="af-qs">' + blocoPerguntasEd(false) + '</div>'
  + (travado ? '' : '<button type="button" class="bt bt-gh bt-sm" id="af-addq">+ Adicionar pergunta</button>')
  + '</section>'

  + '<div class="fm-err" id="af-err" role="alert"></div>'
  + '<div class="bts"><button class="bt bt-pr" type="submit" id="af-salvar">'+(AF.id ? 'Salvar alterações' : 'Criar aula')+'</button>'
  + '<span class="sub" id="af-prog"></span></div>';
}

function blocoVideo(travado){
  if(AF.tipo === 'youtube'){
    var link = AF.videoId ? 'https://youtu.be/' + AF.videoId : '';
    return '<label class="cp" style="margin-top:14px"><span class="cp-l">Link do vídeo no YouTube *</span>'
      + '<input class="in" id="af-link" value="'+esc(link)+'" placeholder="https://youtu.be/…"'+(travado ? ' readonly' : '')+'></label>'
      + '<div id="af-yt">' + (AF.videoId ? prevYT(AF.videoId) : '') + '</div>';
  }
  var atual = AF.file ? esc(AF.file.name) + ' · ' + mb(AF.file.size)
            : (AF.arquivo ? 'Vídeo enviado anteriormente' : '');
  return '<label class="cp" style="margin-top:14px"><span class="cp-l">Arquivo de vídeo * (MP4, WebM ou MOV, até 50 MB)</span>'
    + (travado ? '' : '<input class="in" id="af-arq" type="file" accept="video/mp4,video/webm,video/quicktime,video/ogg">')
    + '</label><div class="sub" id="af-arq-st" style="margin-top:6px">'+atual+'</div>';
}
function prevYT(id){
  return '<div class="yt-prev"><img src="https://i.ytimg.com/vi/'+id+'/mqdefault.jpg" alt="" loading="lazy">'
       + '<span>youtu.be/'+esc(id)+'</span></div>';
}

function blocoMotoristas(){
  var deEx = souExemplo() || AF.pubOrig === 'exemplos';
  var rotulo = deEx ? 'Todos os motoristas de exemplo' : 'Todos os motoristas';
  var sub = AF.publicoTravado ? 'Aula aberta a todos os motoristas. A conta de demonstração não altera quem recebe esta aula.'
          : (deEx ? 'Inclusive os motoristas de exemplo cadastrados depois. Motoristas reais não recebem.'
                          : 'Inclusive os motoristas cadastrados depois.');
  var opc = '<label class="todos-op'+(AF.todos ? ' on' : '')+'">'
    + '<input type="checkbox" id="af-todos"'+(AF.todos ? ' checked' : '')+(AF.publicoTravado ? ' disabled' : '')+'>'
    + '<span class="mot-n"><b>'+rotulo+'</b><i>'+sub+'</i></span></label>';
  if(AF.todos) return opc;
  var b = AF.busca.toLowerCase();
  var lista = Store.d.motoristas.filter(function(d){ return d.ativo !== false })
    .filter(function(d){ return !b || d.nome.toLowerCase().indexOf(b) >= 0 || d.usuario.indexOf(b) >= 0 });
  var n = Object.keys(AF.motoristas).length;
  return opc
    + '<div class="topo" style="margin:14px 0 10px;align-items:center;gap:10px">'
    + '<input class="in" id="af-busca" placeholder="Buscar motorista" value="'+esc(AF.busca)+'" style="max-width:280px">'
    + '<div class="bts mot-acoes"><span class="sub" id="af-nmot">'+n+' selecionado'+(n === 1 ? '' : 's')+'</span>'
    + '<button type="button" class="bt bt-gh bt-sm" data-selmot="todos">Marcar visíveis</button>'
    + '<button type="button" class="bt bt-gh bt-sm" data-selmot="nenhum">Limpar</button></div></div>'
    + '<div class="mot-l">' + (lista.map(function(d){
        return '<label class="mot-i"><input type="checkbox" data-mot-ck="'+d.id+'"'+(AF.motoristas[d.id] ? ' checked' : '')+'>'
             + '<span class="mot-n"><b>'+esc(d.nome)+'</b><i>'+esc(d.usuario)+(d.cidade ? ' · '+esc(d.cidade) : '')+'</i></span></label>';
      }).join('') || '<div class="sub">Nenhum motorista encontrado.</div>') + '</div>';
}

function blocoPerguntasEd(travado){
  return AF.perguntas.map(function(q, i){
    var alts = q.alternativas.map(function(a, j){
      return '<div class="qe-alt">'
        + '<label class="qe-ok" title="Marcar como correta"><input type="radio" name="qe-c-'+i+'" data-qc="'+i+'" value="'+j+'"'
        +   (q.correta === j ? ' checked' : '')+(travado ? ' disabled' : '')+'><span>'+String.fromCharCode(65 + j)+'</span></label>'
        + '<input class="in" data-qa="'+i+'" data-j="'+j+'" value="'+esc(a)+'" placeholder="Alternativa '+String.fromCharCode(65 + j)+'"'+(travado ? ' readonly' : '')+'>'
        + (travado || q.alternativas.length <= 2 ? '' : '<button type="button" class="bt bt-gh bt-sm" data-qdel-a="'+i+'" data-j="'+j+'" title="Remover">×</button>')
        + '</div>';
    }).join('');
    return '<div class="qe">'
      + '<div class="topo" style="margin-bottom:8px;align-items:center"><div class="qz-n">PERGUNTA '+(i + 1)+'</div>'
      + (travado || AF.perguntas.length <= 1 ? '' : '<button type="button" class="bt bt-gh bt-sm" data-qdel="'+i+'">Remover pergunta</button>')
      + '</div>'
      + '<textarea class="in" rows="2" data-qe="'+i+'" placeholder="Enunciado da pergunta"'+(travado ? ' readonly' : '')+'>'+esc(q.enunciado)+'</textarea>'
      + '<div class="sub" style="font-size:12px;margin:8px 0 6px">Alternativas — marque a correta</div>'
      + alts
      + (travado || q.alternativas.length >= 5 ? '' : '<button type="button" class="bt bt-gh bt-sm" data-qadd-a="'+i+'">+ alternativa</button>')
      + '</div>';
  }).join('');
}

function redesenhaQs(){ var e = $('#af-qs'); if(e) e.innerHTML = blocoPerguntasEd(false) }
function redesenhaMot(){ var e = $('#af-mot'); if(e) e.innerHTML = blocoMotoristas() }

/* ---- carrega a aula existente (perguntas COM gabarito, só para supervisor) ---- */
function montaAulaForm(id){
  if(id === 'nova') return;
  Api.rpc('aula_para_editar', {p_id: id}).then(function(r){
    if(!AF || AF.id !== id) return;
    AF.tentativas = r.tentativas;
    (r.motoristas || []).forEach(function(x){ AF.motoristas[x] = true });
    AF.perguntas = r.perguntas.map(function(q){ return {enunciado: q.enunciado, alternativas: q.alternativas.slice(), correta: q.correta} });
    AF.perguntasOrig = JSON.stringify(AF.perguntas);
    AF.carregado = true;
    var e = $('#af-corpo'); if(e) e.innerHTML = corpoAula(Store.d.aulas.filter(function(x){ return x.id === id })[0]);
  }).catch(function(e){ aviso(erroLegivel(e), 'err'); Rota.ir('#/gestor/aulas') });
}

/* ---- duração automática ---- */
function detectaYT(id){
  var st = $('#af-dur-st'); if(st) st.textContent = 'Lendo a duração do vídeo…';
  Player.carregaAPI(function(ok){
    if(!ok){ if(st) st.textContent = 'Não foi possível ler a duração. Preencha manualmente.'; return }
    var box = document.createElement('div');
    box.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;left:-9999px';
    var alvo = document.createElement('div'); box.appendChild(alvo); document.body.appendChild(box);
    var fim = function(seg){
      try{ p.destroy() }catch(e){} box.remove();
      if(!AF || AF.videoId !== id) return;
      if(seg > 0){ AF.seg = Math.round(seg); var d = $('#af-dur'); if(d) d.value = fmtDur(AF.seg);
                   if(st) st.textContent = 'Duração lida do YouTube.' }
      else if(st) st.textContent = 'Não foi possível ler a duração (vídeo privado ou sem permissão de incorporação?). Preencha manualmente.';
    };
    var p = new YT.Player(alvo, {videoId: id, events: {
      onReady: function(){ fim(p.getDuration ? p.getDuration() : 0) },
      onError: function(){ fim(0) }}});
    setTimeout(function(){ if(box.isConnected) fim(0) }, 12000);
  });
}
function detectaArquivo(f){
  var st = $('#af-arq-st'), d = $('#af-dur-st');
  if(f.size > LIMITE_ARQUIVO){
    AF.file = null; if(st) st.innerHTML = '<span style="color:var(--err)">'+esc(f.name)+' tem '+mb(f.size)
      + ' — acima do limite de 50 MB. Comprima o vídeo ou publique no YouTube (pode ser "não listado").</span>';
    return;
  }
  AF.file = f; if(st) st.textContent = f.name + ' · ' + mb(f.size);
  var u = URL.createObjectURL(f), v = document.createElement('video');
  v.preload = 'metadata';
  v.onloadedmetadata = function(){
    if(isFinite(v.duration) && v.duration > 0){ AF.seg = Math.round(v.duration); var x = $('#af-dur'); if(x) x.value = fmtDur(AF.seg);
      if(d) d.textContent = 'Duração lida do arquivo.' }
    URL.revokeObjectURL(u);
  };
  v.onerror = function(){ if(d) d.textContent = 'Não foi possível ler a duração. Preencha manualmente.'; URL.revokeObjectURL(u) };
  v.src = u;
}

/* ---- geração com IA ---- */
var IA_OK = null;   /* null = ainda não consultado */
var AVISO_IA = '<div class="trava" style="margin-bottom:12px"><span class="ic">'+ic('alerta', 18)+'</span><span>'
  + '<b>A geração por IA ainda não está ativada.</b> Nenhuma chave de serviço de IA está vinculada a este sistema. '
  + 'Quando tiver a chave, envie pelo Anycast que a geração automática é ligada. '
  + 'Enquanto isso, cadastre as perguntas manualmente.</span></div>';

function painelIA(){
  var e = $('#af-ia-p'); if(!e) return;
  if(e.innerHTML){ e.innerHTML = ''; return }
  if(IA_OK === false){ e.innerHTML = AVISO_IA; return }
  if(IA_OK === null){
    e.innerHTML = '<div class="sub" style="margin-bottom:12px">Verificando a IA…</div>';
    Api.garante().then(function(){ return Api._req('POST', '/functions/v1/gerar-perguntas', {status: true}) })
      .then(function(r){ IA_OK = !!r.configurada })
      .catch(function(){ IA_OK = null })
      .then(function(){ e.innerHTML = ''; if(IA_OK === null) e.innerHTML = '<div class="sub" style="margin-bottom:12px;color:var(--err)">Não foi possível consultar a IA agora. Tente de novo.</div>'; else painelIA() });
    return;
  }
  e.innerHTML = '<div class="ia-p">'
    + '<div class="sub" style="margin-bottom:10px">A IA escreve um <b>rascunho</b> a partir do material da aula; '
    + 'você revisa antes de salvar. Para vídeo do YouTube ela tenta ler a legenda; se não conseguir, usa a descrição do vídeo. '
    + 'O melhor resultado vem de colar abaixo a transcrição, o roteiro ou um resumo da aula.</div>'
    + '<label class="cp"><span class="cp-l">Transcrição, roteiro ou resumo (recomendado)</span>'
    + '<textarea class="in" id="ia-txt" rows="5" placeholder="Cole aqui o conteúdo falado no vídeo"></textarea></label>'
    + '<div class="bts" style="margin-top:10px"><label class="cp" style="flex-direction:row;align-items:center;gap:8px">'
    + '<span class="cp-l">Perguntas</span><select class="in" id="ia-n" style="width:80px">'
    + [3, 4, 5, 6, 8, 10].map(function(n){ return '<option'+(n === 4 ? ' selected' : '')+'>'+n+'</option>' }).join('')
    + '</select></label><button type="button" class="bt bt-pr bt-sm" id="ia-gerar">Gerar rascunho</button>'
    + '<span class="sub" id="ia-st"></span></div></div>';
}
function geraIA(){
  var bt = $('#ia-gerar'), st = $('#ia-st');
  bt.disabled = true; st.textContent = 'Gerando… (pode levar até um minuto)';
  Api.garante().then(function(){
    return Api._req('POST', '/functions/v1/gerar-perguntas', {
      titulo: ($('#af-titulo') || {}).value || '', descricao: ($('#af-desc') || {}).value || '',
      texto: $('#ia-txt').value, n: +$('#ia-n').value, video_id: AF.tipo === 'youtube' ? AF.videoId : null});
  }).then(function(r){
    var vazias = AF.perguntas.filter(function(q){ return !q.enunciado.trim() }).length === AF.perguntas.length;
    var novas = r.perguntas.map(function(q){ return {enunciado: q.enunciado, alternativas: q.alternativas.slice(0, 5), correta: q.correta} });
    AF.perguntas = vazias ? novas : AF.perguntas.concat(novas);
    redesenhaQs();
    $('#af-ia-p').innerHTML = '<div class="trava lib" style="margin-bottom:12px"><span class="ic">'+ic('check', 18)+'</span><span>'
      + '<b>'+novas.length+' pergunta'+(novas.length === 1 ? '' : 's')+' gerada'+(novas.length === 1 ? '' : 's')+'</b> a partir de: '
      + esc((r.base || []).join(', ') || 'material informado') + '. <b>Revise cada uma antes de salvar.</b></span></div>';
  }).catch(function(e){
    bt.disabled = false;
    st.innerHTML = '<span style="color:var(--err)">' + esc(
      e.status === 501 ? (IA_OK = false, 'A geração por IA ainda não está ativada: nenhuma chave de IA vinculada. Cadastre as perguntas manualmente.')
      : (e.dados && e.dados.erro === 'MATERIAL_INSUFICIENTE')
        ? 'Material insuficiente para gerar perguntas confiáveis. Cole a transcrição ou um resumo da aula (pelo menos um parágrafo).'
        : erroLegivel(e)) + '</span>';
  });
}

/* ---- envio ---- */
function enviaArquivo(f){
  var ext = (f.name.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'mp4';
  var nome = (crypto.randomUUID ? crypto.randomUUID() : ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, function(c){
    return (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16) })) + '.' + ext;
  var st = $('#af-prog');
  return Api.garante().then(function(){
    return new Promise(function(ok, falha){
      var x = new XMLHttpRequest();
      x.open('POST', SUPA_URL + '/storage/v1/object/aulas/' + nome);
      x.setRequestHeader('apikey', SUPA_KEY);
      x.setRequestHeader('Authorization', 'Bearer ' + Api.s.access_token);
      x.setRequestHeader('Content-Type', f.type || 'video/mp4');
      x.upload.onprogress = function(ev){ if(ev.lengthComputable && st) st.textContent = 'Enviando vídeo… ' + Math.round(ev.loaded / ev.total * 100) + '%' };
      x.onload = function(){ x.status < 300 ? ok(nome) : falha(new Error('Falha no envio do vídeo (' + x.status + ')')) };
      x.onerror = function(){ falha(new Error('Sem conexão durante o envio do vídeo.')) };
      x.send(f);
    });
  });
}
function apagaArquivo(nome){
  return Api._req('DELETE', '/storage/v1/object/aulas', {prefixes: [nome]}).catch(function(){});
}

function salvaAula(){
  var err = $('#af-err'), bt = $('#af-salvar'), st = $('#af-prog');
  err.textContent = '';
  var titulo = $('#af-titulo').value.trim(), seg = lerDuracao($('#af-dur').value);
  var falta = [];
  if(titulo.length < 3) falta.push('título');
  if(AF.tipo === 'youtube' && !AF.videoId) falta.push('link válido do YouTube');
  if(AF.tipo === 'arquivo' && !AF.file && !AF.arquivo) falta.push('arquivo de vídeo');
  if(!seg || seg < 5) falta.push('duração do vídeo');
  if(!AF.todos && !Object.keys(AF.motoristas).length) falta.push('ao menos um motorista (ou marque "Todos")');
  AF.perguntas.forEach(function(q, i){
    if(q.enunciado.trim().length < 5 || q.alternativas.some(function(a){ return !a.trim() }) || q.correta == null
       || q.correta >= q.alternativas.length) falta.push('pergunta ' + (i + 1) + ' completa, com a correta marcada');
  });
  if(falta.length){ err.textContent = 'Falta: ' + falta.join(', ') + '.'; return }

  bt.disabled = true;
  var enviado = null;
  var passo = (AF.tipo === 'arquivo' && AF.file) ? enviaArquivo(AF.file).then(function(n){ enviado = n; return n })
                                                  : Promise.resolve(AF.arquivo);
  passo.then(function(arq){
    if(st) st.textContent = 'Salvando…';
    return Api.rpc('salvar_aula', {p: {
      id: AF.id, titulo: titulo, descricao: $('#af-desc').value.trim(), video_tipo: AF.tipo,
      video_id: AF.tipo === 'youtube' ? AF.videoId : null, video_arquivo: AF.tipo === 'arquivo' ? arq : null,
      /* "todos" mantém o público original quando já era aberto (inclusive o "todos os de exemplo") */
      video_seg: seg, publico: AF.todos ? (AF.pubOrig === 'exemplos' ? 'exemplos' : 'todos') : 'selecionados',
      motoristas: Object.keys(AF.motoristas),
      perguntas: AF.perguntas, perguntas_alteradas: JSON.stringify(AF.perguntas) !== AF.perguntasOrig}});
  }).then(function(id){
    /* vídeo próprio substituído: tira o arquivo antigo do armazenamento (se falhar, não atrapalha) */
    var novo = AF.tipo === 'arquivo' ? (enviado || AF.arquivo) : null;
    if(AF.arquivoOrig && AF.arquivoOrig !== novo) apagaArquivo(AF.arquivoOrig);
    aviso(AF.id ? 'Aula atualizada.' : 'Aula criada.');
    AF = null;
    return Store.carrega().then(function(){ Rota.ir('#/gestor/aulas') });
  }).catch(function(e){
    if(enviado) apagaArquivo(enviado);       /* não deixa vídeo órfão no armazenamento */
    bt.disabled = false; if(st) st.textContent = '';
    err.textContent = erroLegivel(e);
  });
}

/* ============================================================ eventos */
function cliqueAulas(e){
  var t;
  if((t = e.target.closest('[data-arquiva]'))){
    var on = t.dataset.ativo === '1';
    if(!on && !confirm('Arquivar esta aula? Ela some para os motoristas; o histórico de notas é mantido.')) return true;
    t.disabled = true;
    Api.rpc('arquivar_aula', {p_id: t.dataset.arquiva, p_ativo: on})
      .then(function(){ aviso(on ? 'Aula reativada.' : 'Aula arquivada.'); return recarrega() })
      .catch(function(x){ t.disabled = false; aviso(erroLegivel(x), 'err') });
    return true;
  }
  if(!AF) return false;
  if((t = e.target.closest('[data-tipo]')) && !t.disabled){
    AF.tipo = t.dataset.tipo;
    $$('[data-tipo]').forEach(function(b){ b.classList.toggle('on', b === t) });
    $('#af-video').innerHTML = blocoVideo(false); return true;
  }
  if((t = e.target.closest('[data-selmot]'))){
    var marcar = t.dataset.selmot === 'todos';
    if(!marcar) AF.motoristas = {};
    $$('[data-mot-ck]').forEach(function(c){ if(marcar) AF.motoristas[c.dataset.motCk] = true });
    redesenhaMot(); return true;
  }
  if((t = e.target.closest('#af-addq'))){ AF.perguntas.push(novaPergunta()); redesenhaQs(); return true }
  if((t = e.target.closest('[data-qdel]'))){ AF.perguntas.splice(+t.dataset.qdel, 1); redesenhaQs(); return true }
  if((t = e.target.closest('[data-qadd-a]'))){ AF.perguntas[+t.dataset.qaddA].alternativas.push(''); redesenhaQs(); return true }
  if((t = e.target.closest('[data-qdel-a]'))){
    var q = AF.perguntas[+t.dataset.qdelA], j = +t.dataset.j;
    q.alternativas.splice(j, 1);
    if(q.correta === j) q.correta = null; else if(q.correta > j) q.correta--;
    redesenhaQs(); return true;
  }
  if((t = e.target.closest('#af-ia'))){ painelIA(); return true }
  if((t = e.target.closest('#ia-gerar'))){ geraIA(); return true }
  return false;
}

document.addEventListener('input', function(e){
  if(!AF) return;
  var t = e.target, d = t.dataset || {};
  if(d.qe !== undefined){ AF.perguntas[+d.qe].enunciado = t.value; return }
  if(d.qa !== undefined){ AF.perguntas[+d.qa].alternativas[+d.j] = t.value; return }
  if(t.id === 'af-link'){
    var id = idYouTube(t.value), y = $('#af-yt');
    if(id !== AF.videoId){ AF.videoId = id; if(y) y.innerHTML = id ? prevYT(id) : ''; if(id) detectaYT(id) }
    return;
  }
  if(t.id === 'af-busca'){
    AF.busca = t.value; clearTimeout(AF._t);
    AF._t = setTimeout(function(){ redesenhaMot(); var b = $('#af-busca'); if(b){ b.focus(); b.setSelectionRange(b.value.length, b.value.length) } }, 200);
  }
});
document.addEventListener('change', function(e){
  if(!AF) return;
  var t = e.target, d = t.dataset || {};
  if(d.qc !== undefined){ AF.perguntas[+d.qc].correta = +t.value; return }
  if(t.id === 'af-todos'){ AF.todos = t.checked; redesenhaMot(); return }
  if(d.motCk !== undefined){
    if(t.checked) AF.motoristas[d.motCk] = true; else delete AF.motoristas[d.motCk];
    var n = Object.keys(AF.motoristas).length, s = $('#af-nmot'); if(s) s.textContent = n + ' selecionado' + (n === 1 ? '' : 's');
    return;
  }
  if(t.id === 'af-arq' && t.files && t.files[0]) detectaArquivo(t.files[0]);
});
