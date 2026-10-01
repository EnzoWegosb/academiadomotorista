/* ============================================================
   Academia do Motorista — núcleo
   Store (lido do Supabase), sessão, rotas, casco, login e convite.
   ============================================================ */
var $  = function(s,c){return (c||document).querySelector(s)};
var $$ = function(s,c){return Array.prototype.slice.call((c||document).querySelectorAll(s))};


/* ------------------------------------------------------------ ícones */
var IC = {
  casa:'<path d="M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
  livro:'<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v16H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20v4H6.5A2.5 2.5 0 0 1 4 20.5z"/>',
  grafico:'<path d="M3 3v18h18"/><path d="M7 15l4-5 3.5 3.5L21 6"/>',
  pessoas:'<circle cx="9" cy="8" r="3.4"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16.5 5.2a3.4 3.4 0 0 1 0 5.6M18 20a6.4 6.4 0 0 0-2.2-4.8"/>',
  escudo:'<path d="M12 2.5 20 6v6c0 4.7-3.2 8.6-8 9.5-4.8-.9-8-4.8-8-9.5V6z"/><path d="M9 12.2l2.2 2.2L15.4 10"/>',
  cel:'<rect x="6.5" y="2.5" width="11" height="19" rx="2.6"/><path d="M10.6 5.6h2.8"/><circle cx="12" cy="18" r=".9" fill="currentColor"/>',
  estrela:'<path d="M12 3.2l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.7l6.1-.9z"/>',
  relogio:'<circle cx="12" cy="12" r="9.2"/><path d="M12 6.6V12l3.6 2.2"/>',
  play:'<path d="M7.5 4.8v14.4l12-7.2z"/>',
  check:'<path d="M4.5 12.5l5 5 10-11"/>',
  cadeado:'<rect x="4.5" y="10.5" width="15" height="11" rx="2.4"/><path d="M8 10.5V7.2a4 4 0 0 1 8 0v3.3"/>',
  seta:'<path d="M5 12h14M13 6l6 6-6 6"/>',
  volta:'<path d="M19 12H5M11 18l-6-6 6-6"/>',
  sair:'<path d="M10 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/><path d="M16 17l5-5-5-5M21 12H9"/>',
  alerta:'<path d="M12 3.2 22 20H2z"/><path d="M12 9.6v4.2"/><circle cx="12" cy="16.9" r=".95" fill="currentColor"/>',
  menu:'<path d="M3.5 6.5h17M3.5 12h17M3.5 17.5h17"/>',
  folha:'<path d="M20 4.5c0 8.5-4.4 13-11 13H5.5"/><path d="M4.5 21c0-6.5 3.2-10.6 9-12"/>',
  bussola:'<circle cx="12" cy="12" r="9.2"/><path d="M15.6 8.4l-2 5.2-5.2 2 2-5.2z"/>',
  freio:'<circle cx="12" cy="12" r="9.2"/><circle cx="12" cy="12" r="3.6"/><path d="M12 2.8v5.6M12 15.6v5.6M2.8 12h5.6M15.6 12h5.6"/>',
  grade:'<rect x="3" y="3" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2"/>'
};
function ic(n,t){
  return '<svg width="'+(t||20)+'" height="'+(t||20)+'" viewBox="0 0 24 24" fill="none" '
       + 'stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" '
       + 'aria-hidden="true">'+(IC[n]||'')+'</svg>';
}
var IC_TEMA = {economia:'folha', piloto:'bussola', freio:'freio'};

/* ------------------------------------------------------------ utilidades */
function esc(s){
  return String(s).replace(/[&<>"']/g,function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}
function pct(a,b){ return b>0 ? Math.round(a/b*100) : 0 }
function mmss(s){
  s = Math.max(0,Math.round(s));
  return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');
}
var ROT = {concluido:'Concluído', andamento:'Em andamento',
           nao_iniciado:'Não iniciado', reprovado:'Reprovado'};
var CLS = {concluido:'is-ok', andamento:'is-and', nao_iniciado:'is-neu', reprovado:'is-err'};
var ABR = {concluido:'ok', andamento:'and', nao_iniciado:'neu', reprovado:'err'};
var ORDEM_ST = ['nao_iniciado','andamento','reprovado','concluido'];
function selo(st){
  return '<span class="pill '+CLS[st]+'"><span class="pd"></span>'+ROT[st]+'</span>';
}


/* datas do banco (ISO) → dd/mm/aaaa */
function dataBR(iso){
  if(!iso) return null;
  var s = String(iso);
  if(/^\d{4}-\d{2}-\d{2}$/.test(s)){ var p = s.split('-'); return p[2]+'/'+p[1]+'/'+p[0] }
  var d = new Date(s);
  if(isNaN(d)) return null;
  return String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear();
}
function dataHoraBR(iso){
  if(!iso) return null;
  var d = new Date(iso);
  return dataBR(iso)+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
}
function cmpData(a, b){
  if(!a) return b ? -1 : 0;
  if(!b) return 1;
  var x = a.split('/'), y = b.split('/');
  return (x[2]+x[1]+x[0]).localeCompare(y[2]+y[1]+y[0]);
}
function iniciais(nome){
  return String(nome||'').split(/\s+/).filter(function(p){ return p.length > 2 })
    .map(function(p){ return p[0] }).join('').slice(0,2).toUpperCase() || '··';
}

/* ============================================================ Store
   Tudo vem do Supabase. As regras de linha (RLS) já filtram na origem:
   o motorista recebe só os próprios registros; o supervisor recebe todos.
   Nenhuma escrita é feita por aqui — só por RPC e pela função de servidor. */
var Store = {
  d: {modulos:[], aulas:[], atrib:{}, motoristas:[], progresso:{}, aprovacao:70, limiarVideo:0.95},
  pronto: false,

  carrega: function(){
    var self = this;
    return Promise.all([
      Api.sel('modulos',    'select=*&order=ordem'),
      Api.sel('perguntas',  'select=id,modulo_id,ordem,enunciado,alternativas&order=modulo_id,ordem'),
      Api.sel('config',     'select=*'),
      Api.sel('perfis',     'select=id,papel,nome,usuario,criado_em,exemplo,convidado_por'),
      Api.sel('motoristas', 'select=*'),
      Api.sel('progresso',  'select=*'),
      Api.sel('modulo_motoristas', 'select=*')
    ]).then(function(r){
      var mods = r[0], pergs = r[1], cfg = r[2], perfis = r[3], cads = r[4], prog = r[5], atr = r[6];
      /* quem recebe cada aula aberta só aos selecionados */
      self.d.atrib = {};
      atr.forEach(function(x){ (self.d.atrib[x.modulo_id] = self.d.atrib[x.modulo_id] || {})[x.motorista_id] = true });
      /* todas as aulas (inclusive arquivadas) para a tela de gestão; as ativas para o resto */
      self.d.aulas = mods.map(function(m){
        return {id:m.id, ord:m.ordem, titulo:m.titulo, curto:m.curto, desc:m.descricao,
                duracao:m.duracao_txt, video:m.video_id, videoSeg:m.video_seg, fonte:m.fonte, tema:m.tema,
                videoTipo:m.video_tipo || 'youtube', arquivo:m.video_arquivo, publico:m.publico || 'todos',
                criadoPor:m.criado_por, ativo:m.ativo, criadoEm:m.criado_em,
                quiz: pergs.filter(function(q){ return q.modulo_id === m.id })
                           .map(function(q){ return [q.enunciado, q.alternativas] })};
      });
      self.d.modulos = self.d.aulas.filter(function(m){ return m.ativo });
      cfg.forEach(function(c){
        if(c.chave === 'aprovacao')    self.d.aprovacao   = +c.valor;
        if(c.chave === 'limiar_video') self.d.limiarVideo = +c.valor;
        if(c.chave === 'modo_demo')    self.d.modoDemo    = +c.valor === 1;
      });
      var cadPor = {};
      cads.forEach(function(c){ cadPor[c.id] = c });
      self.d.perfis = perfis;
      self.d.motoristas = perfis.filter(function(p){ return p.papel === 'motorista' && cadPor[p.id] })
        .map(function(p){
          var c = cadPor[p.id];
          return Object.assign({}, c, {id:p.id, nome:p.nome, usuario:p.usuario, ini:iniciais(p.nome),
                                       admissao:dataBR(c.inicio), criadoEm:p.criado_em});
        }).sort(function(a,b){ return a.nome.localeCompare(b.nome, 'pt-BR') });
      self.d.progresso = {};
      prog.forEach(function(x){
        (self.d.progresso[x.motorista_id] = self.d.progresso[x.motorista_id] || {})[x.modulo_id] = self._prog(x);
      });
      self.pronto = true;
      self.carregadoEm = Date.now();
    });
  },
  carregadoEm: 0,
  /* dados com mais de 20 s: recarrega em segundo plano ao navegar */
  velho: function(){ return Date.now() - this.carregadoEm > 20000 },

  _prog: function(x){
    return {
      status: x.status, assistido: +x.segundos || 0,
      nota: x.status === 'concluido' ? x.nota_aprovacao : x.nota_ultima,
      notaPrimeira: x.nota_primeira, acertos: x.acertos_ultima, tentativas: x.tentativas || 0,
      concluidoEm: dataBR(x.concluido_em),
      ultima: x.status === 'nao_iniciado' && !(+x.segundos) ? null : dataBR(x.atualizado_em),
      videoConcluido: !!x.video_concluido_em,
      aulaAdiantada: !!x.aula_adiantada
    };
  },
  /* atualiza o cache local com o que uma RPC acabou de devolver */
  ajustaProg: function(mot, mod, patch){
    var p = (this.d.progresso[mot] = this.d.progresso[mot] || {});
    p[mod] = Object.assign(p[mod] || this._vazio(), patch);
  },
  _vazio: function(){
    return {status:'nao_iniciado', assistido:0, nota:null, notaPrimeira:null, acertos:null,
            tentativas:0, concluidoEm:null, ultima:null, videoConcluido:false};
  },

  prog: function(mot, mod){ return ((this.d.progresso[mot]||{})[mod]) || this._vazio() },
  mod: function(id){ return this.d.modulos.filter(function(m){ return m.id === id })[0] },
  motorista: function(id){ return this.d.motoristas.filter(function(m){ return m.id === id })[0] },

  /* progresso da trilha: vídeo vale metade do módulo, quiz aprovado a outra metade */
  /* aulas ativas que valem para um motorista: abertas a todos ou atribuídas a ele */
  atribuida: function(mot, mod){
    var m = typeof mod === 'string' ? this.mod(mod) : mod;
    if(!m) return false;
    if(m.publico === 'todos') return true;
    if(m.publico === 'exemplos'){ var d = this.motorista(mot); return !!d && /^EXEMPLO/.test(d.observacoes || '') }
    return !!((this.d.atrib[m.id] || {})[mot]);
  },
  modsDe: function(mot){
    return this.d.modulos.filter(function(m){ return this.atribuida(mot, m) }, this);
  },

  resumo: function(mot){
    var mods = this.modsDe(mot), ok = 0, soma = 0;
    mods.forEach(function(m){
      var p = this.prog(mot, m.id);
      if(p.status === 'concluido'){ ok++; soma += 1 }
      else soma += Math.min(p.assistido / m.videoSeg, 1) * 0.5;
    }, this);
    return {ok:ok, pend:mods.length-ok, total:mods.length, pct:pct(soma, mods.length)};
  },

  /* concluiu tudo > tem reprovado > começou > não começou */
  estado: function(mot){
    var mods = this.modsDe(mot), ok = 0, repr = false, algum = false;
    mods.forEach(function(m){
      var p = this.prog(mot, m.id);
      if(p.status === 'concluido'){ ok++; algum = true }
      else if(p.status === 'reprovado'){ repr = true; algum = true }
      else if(p.status === 'andamento' || p.assistido > 0){ algum = true }
    }, this);
    if(mods.length && ok === mods.length) return 'concluido';
    if(repr) return 'reprovado';
    return algum ? 'andamento' : 'nao_iniciado';
  },

  /* média das notas atuais (aprovação ou última tentativa) */
  media: function(mot){
    var ns = this.modsDe(mot).map(function(m){ return this.prog(mot, m.id).nota }, this)
                           .filter(function(n){ return n != null });
    return ns.length ? Math.round(ns.reduce(function(s,x){ return s+x },0) / ns.length) : null;
  },

  /* APROVEITAMENTO = média da nota na PRIMEIRA tentativa de cada módulo feito.
     É o que mede aprendizado: com tentativas ilimitadas, a nota final tende a
     100% por eliminação; a primeira tentativa é a que reflete a aula. */
  aproveitamento: function(mot){
    var ns = this.modsDe(mot).map(function(m){ return this.prog(mot, m.id).notaPrimeira }, this)
                           .filter(function(n){ return n != null });
    return ns.length ? Math.round(ns.reduce(function(s,x){ return s+x },0) / ns.length) : null;
  },

  ultima: function(mot){
    var d = null;
    this.modsDe(mot).forEach(function(m){
      var u = this.prog(mot, m.id).ultima;
      if(u && (!d || cmpData(u, d) > 0)) d = u;
    }, this);
    var c = this.motorista(mot);
    var a = c && dataBR(c.ultimo_acesso_em);
    if(a && (!d || cmpData(a, d) > 0)) d = a;
    return d;
  }
};

/* ============================================================ sessão */
var Sessao = {
  perfil: null, motorista: null, eu: null,

  /* depois do login (ou ao reabrir a aba com sessão válida) */
  inicia: function(){
    var self = this, uid = Api.s && Api.s.user && Api.s.user.id;
    if(!uid) return Promise.reject(new Error('sem sessão'));
    return Api.sel('perfis', 'select=id,papel,nome,usuario,exemplo&id=eq.' + uid).then(function(r){
      if(!r || !r[0]) throw new Error('Perfil não encontrado para esta conta.');
      self.eu = r[0];
      self.perfil = r[0].papel === 'supervisor' ? 'gestor' : 'motorista';
      self.motorista = self.perfil === 'motorista' ? uid : null;
      if(self.perfil === 'motorista') Api.rpc('registrar_acesso', {}).catch(function(){});
      return Store.carrega();
    });
  },
  sai: function(){
    Api.sair();
    this.perfil = this.motorista = this.eu = null;
    Store.pronto = false;
    Store.d = {modulos:[], aulas:[], atrib:{}, motoristas:[], progresso:{}, aprovacao:70, limiarVideo:0.95};
    Rota.ir('#/');
  }
};

/* ============================================================ rotas */
var Rota = {
  atual: '#/',
  ir: function(h){ if(location.hash === h) desenha(); else location.hash = h },
  liga: function(){
    addEventListener('hashchange', function(){ Rota.atual = location.hash || '#/'; desenha() });
    Rota.atual = location.hash || '#/';
  }
};

var MENU_MOT = [
  {h:'#/motorista', t:'Meus treinamentos', i:'casa'},
  {h:'#/motorista/historico', t:'Meu histórico', i:'livro'},
  {h:'#/motorista/cadastro', t:'Meu cadastro', i:'escudo'}
];
var MENU_GES = [
  {h:'#/gestor', t:'Visão geral', i:'grafico'},
  {h:'#/gestor/treinamentos', t:'Gestão de Treinamentos', i:'pessoas'},
  {h:'#/gestor/aulas', t:'Aulas', i:'play'},
  {h:'#/gestor/supervisores', t:'Supervisores', i:'escudo'},
  {h:'#/gestor/novo', t:'Convidar motorista', i:'seta'}
];
function menu(){ return Sessao.perfil === 'gestor' ? MENU_GES : MENU_MOT }

function ativo(h){
  var a = Rota.atual;
  if(h === '#/motorista') return a === '#/motorista' || a.indexOf('#/motorista/treino') === 0;
  if(h === '#/gestor') return a === '#/gestor';
  if(h === '#/gestor/aulas') return a.indexOf('#/gestor/aula') === 0;
  if(h === '#/gestor/treinamentos')
    return a.indexOf('#/gestor/treinamentos') === 0 || a.indexOf('#/gestor/motorista/') === 0;
  return a.indexOf(h) === 0;
}

function casco(conteudo){
  var m = menu();
  var eu = {nome: Sessao.eu.nome, ini: iniciais(Sessao.eu.nome),
            papel: Sessao.perfil === 'gestor' ? 'Supervisor' : 'Motorista parceiro'};

  var itens = m.map(function(x){
    return '<button class="nv-it'+(ativo(x.h)?' on':'')+'" data-ir="'+x.h+'">'
         + '<span class="ic">'+ic(x.i,19)+'</span>'+esc(x.t)+'</button>';
  }).join('');
  var bitens = m.map(function(x){
    return '<button class="bn-it'+(ativo(x.h)?' on':'')+'" data-ir="'+x.h+'">'
         + '<span class="ic">'+ic(x.i,21)+'</span>'+esc(x.t.split(' ').slice(-1)[0])+'</button>';
  }).join('') + '<button class="bn-it" data-sair="1"><span class="ic">'+ic('sair',21)+'</span>Sair</button>';

  return ''
  + '<div class="app">'
  +   '<aside class="lat">'
  +     marca()
  +     '<div class="lat-tag">Academia do Motorista</div>'
  +     '<nav aria-label="Principal">'+itens+'</nav>'
  +     '<div class="lat-ft">'
  +       '<div class="who"><div class="av">'+esc(eu.ini)+'</div>'
  +         '<div><div class="who-n">'+esc(eu.nome)+'</div><div class="who-r">'+esc(eu.papel)+'</div></div></div>'
  +       '<button class="nv-it" data-sair="1"><span class="ic">'+ic('sair',19)+'</span>Sair</button>'
  +     '</div>'
  +   '</aside>'
  +   '<div class="main">'
  +     '<div class="tbar">'+marca()
  +       '<div style="margin-left:auto;display:flex;align-items:center;gap:10px">'
  +         '<div class="av av-sm">'+esc(eu.ini)+'</div></div></div>'
  +     conteudo
  +   '</div>'
  + '</div>'
  + '<nav class="bnav" aria-label="Principal"><div class="bnav-in">'+bitens+'</div></nav>';
}

/* logo Anycast: ícone oficial + nome */
function marca(){
  return '<div class="marca"><img src="'+LOGO_ICONE+'" alt=""><span>anycast</span></div>';
}

function nota(txt){ return '<div class="nota">'+txt+'</div>' }

function rodape(){
  return '<div class="rodape-s">Academia do Motorista · feito com Anycast · aulas em vídeo do canal '
       + 'Condução EXTRAeconômica (YouTube)</div>';
}

/* aviso flutuante */
function aviso(msg, tipo){
  var el = $('#aviso');
  if(!el){ el = document.createElement('div'); el.id = 'aviso'; document.body.appendChild(el) }
  el.className = 'aviso ' + (tipo || 'ok');
  el.textContent = msg;
  el.style.display = 'block';
  clearTimeout(aviso._t);
  aviso._t = setTimeout(function(){ el.style.display = 'none' }, 4200);
}

function carregando(txt){
  return '<div class="carreg"><div class="spin"></div><div>'+esc(txt || 'Carregando…')+'</div></div>';
}

/* ============================================================ desenho */
function desenha(){
  var a = Rota.atual = location.hash || '#/';
  var el = $('#app');

  if(a.indexOf('#/convite/') === 0){
    Player.destroi();
    el.innerHTML = telaConvite(a.split('/')[2]);
    el.className = 'fade';
    if(typeof aoDesenhar === 'function') aoDesenhar(a);
    return;
  }
  if(!Sessao.perfil || !Store.pronto){
    if(a !== '#/'){ location.hash = '#/'; return }
    el.innerHTML = telaLogin();
    el.className = 'fade';
    return;
  }
  if(a === '#/'){ location.hash = Sessao.perfil === 'gestor' ? '#/gestor' : '#/motorista'; return }
  if(Sessao.perfil === 'gestor' && a.indexOf('#/gestor') !== 0){ location.hash = '#/gestor'; return }
  if(Sessao.perfil === 'motorista' && a.indexOf('#/motorista') !== 0){ location.hash = '#/motorista'; return }

  var c;
  if(a.indexOf('#/motorista/treino/') === 0)      c = telaTreino(a.split('/')[3]);
  else if(a === '#/motorista/historico')          c = telaHistorico();
  else if(a === '#/motorista/cadastro')           c = telaMeuCadastro();
  else if(a === '#/motorista')                    c = telaMotorista();
  else if(a.indexOf('#/gestor/editar/') === 0)    c = telaGestorForm(a.split('/')[3]);
  else if(a.indexOf('#/gestor/motorista/') === 0) c = telaGestorDetalhe(a.split('/')[3]);
  else if(a === '#/gestor/treinamentos')          c = telaGestorTreinamentos();
  else if(a === '#/gestor/novo')                  c = telaGestorForm(null);
  else if(a === '#/gestor/aulas')                 c = telaAulas();
  else if(a === '#/gestor/supervisores')          c = telaSupervisores();
  else if(a.indexOf('#/gestor/aula/') === 0)      c = telaAulaForm(a.split('/')[3]);
  else                                            c = telaGestor();

  el.innerHTML = casco(c);
  el.className = '';
  $('.main').classList.add('fade');
  if(typeof aoDesenhar === 'function') aoDesenhar(a);
  window.scrollTo(0,0);
}

/* Área do supervisor: os dados mudam enquanto a tela está aberta (motoristas
   treinando). Ao navegar com dados velhos, ao voltar para a aba e a cada 60 s,
   recarrega e redesenha — sem isso o painel mostrava o estado da hora do login. */
var Atualiza = {
  rodando: false,
  agora: function(){
    if(this.rodando || Sessao.perfil !== 'gestor' || !Store.pronto) return;
    if(document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;  /* não atrapalha quem digita */
    if($('#f-motorista') || $('#f-senha') || $('#resultado-convite .convite-ok')) return;
    var self = this; this.rodando = true;
    var y = window.scrollY;
    Store.carrega().then(function(){ self.rodando = false; desenha(); window.scrollTo(0, y) })
      .catch(function(){ self.rodando = false });
  }
};
document.addEventListener('visibilitychange', function(){
  if(document.visibilityState === 'visible' && Store.velho()) Atualiza.agora();
});
setInterval(function(){ if(document.visibilityState === 'visible') Atualiza.agora() }, 60000);

/* recarrega do banco e redesenha — depois de qualquer alteração */
function recarrega(){
  return Store.carrega().then(desenha).catch(function(e){ aviso(erroLegivel(e), 'err') });
}

/* ------------------------------------------------------------ eventos
   UM delegado, ligado UMA vez. Religar a cada render acumula ouvintes e um
   clique dispara N vezes (armadilha já paga neste ambiente). */
function ligaEventos(){
  document.addEventListener('click', function(e){
    var t;
    if((t = e.target.closest('[data-ir]')))   { Rota.ir(t.dataset.ir); return }
    if((t = e.target.closest('[data-sair]'))) { Player.destroi(); Sessao.sai(); return }
    if((t = e.target.closest('[data-copia]'))){ copia(t.dataset.copia, t); return }
    if(typeof cliqueTreino === 'function' && cliqueTreino(e)) return;
    if(typeof cliqueAulas === 'function' && cliqueAulas(e)) return;
    if(typeof cliqueGestor === 'function' && cliqueGestor(e)) return;
  });
  document.addEventListener('submit', function(e){
    var f = e.target;
    if(f.id === 'f-login')  { e.preventDefault(); enviaLogin(f); return }
    if(f.id === 'f-convite'){ e.preventDefault(); enviaLogin(f); return }
    if(f.id === 'f-aula')   { e.preventDefault(); salvaAula(); return }
    if(typeof submitGestor === 'function' && submitGestor(e)) return;
  });
}

function copia(texto, bt){
  var ok = function(){ if(bt){ var o = bt.innerHTML; bt.innerHTML = ic('check',15)+' Copiado'; setTimeout(function(){ bt.innerHTML = o }, 1800) } };
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(texto).then(ok, function(){ prompt('Copie o texto:', texto) });
  } else { prompt('Copie o texto:', texto) }
}

/* ============================================================ login */
function marcasLogin(){
  return ['Vídeo obrigatório, sem pular para o fim',
          'Quiz liberado só depois da aula completa',
          'Progresso acompanhado pela supervisão'].map(function(x){
    return '<div class="i"><span class="ck">' + ic('check',12) + '</span>' + x + '</div>';
  }).join('');
}

function artLogin(){
  return ''
  + '<div class="lg-art">'
  +   marca()
  +   '<div>'
  +     '<div class="lbl lbl-nv" style="margin-bottom:14px">Academia do Motorista</div>'
  +     '<h1>Todo motorista começa <span style="color:var(--az-cl)">preparado.</span></h1>'
  +     '<p>Trilha de integração para motoristas que acabam de chegar à operação: '
  +       'direção econômica, piloto automático e frenagem planejada.</p>'
  +     '<div class="lg-mk">' + marcasLogin() + '</div>'
  +   '</div>'
  +   '<div style="font-family:var(--mono);font-size:10.5px;letter-spacing:.15em;'
  +     'text-transform:uppercase;color:var(--on-nv3)">Treinamento corporativo · feito com Anycast</div>'
  + '</div>';
}

function telaLogin(){
  return ''
  + '<div class="lg-wrap">' + artLogin()
  +   '<div class="lg-fm"><div class="lg-in">'
  +     '<div class="lbl">Acesso</div>'
  +     '<h2 class="h1" style="margin:10px 0 6px">Entrar na Academia</h2>'
  +     '<p class="sub">Use o usuário e a senha que o seu supervisor enviou.</p>'
  +     '<form id="f-login" class="fm" autocomplete="on" style="margin-top:24px">'
  +       '<label class="cp"><span class="cp-l">Usuário</span>'
  +         '<input class="in" name="usuario" autocomplete="username" autocapitalize="none" '
  +           'spellcheck="false" required placeholder="ex.: luciano.goes"></label>'
  +       '<label class="cp"><span class="cp-l">Senha</span>'
  +         '<input class="in" name="senha" type="password" autocomplete="current-password" required></label>'
  +       '<div class="fm-err" id="lg-err" role="alert"></div>'
  +       '<button class="bt bt-pr bt-bl" type="submit" id="bt-entrar">Entrar</button>'
  +     '</form>'
  +     '<div class="nota" style="margin-top:22px">Ainda não tem acesso? O cadastro é feito pelo seu '
  +       'supervisor, que envia um link de convite com o seu usuário e a sua senha.</div>'
  +   '</div></div>'
  + '</div>';
}

function telaConvite(token){
  return ''
  + '<div class="lg-wrap">' + artLogin()
  +   '<div class="lg-fm"><div class="lg-in" id="cv-corpo">' + carregando('Conferindo o convite…') + '</div></div>'
  + '</div>';
}

function montaConvite(token){
  var el = $('#cv-corpo');
  Api.rpc('convite_info', {p_token: token}, true).then(function(r){
    if(!el) return;
    if(!r || !r[0]){
      el.innerHTML = '<div class="lbl">Convite</div><h2 class="h1" style="margin:10px 0 8px">Convite inválido</h2>'
        + '<p class="sub">Este link não é mais válido — ele pode ter sido substituído por um novo. '
        + 'Peça ao seu supervisor para reenviar o convite.</p>'
        + '<button class="bt bt-ln" data-ir="#/" style="margin-top:22px">Ir para o login</button>';
      return;
    }
    var c = r[0];
    if(!c.ativo){
      el.innerHTML = '<div class="lbl">Convite</div><h2 class="h1" style="margin:10px 0 8px">Acesso desativado</h2>'
        + '<p class="sub">O acesso de '+esc(c.nome)+' está desativado. Fale com o seu supervisor.</p>';
      return;
    }
    el.innerHTML = ''
      + '<div class="lbl">Convite</div>'
      + '<h2 class="h1" style="margin:10px 0 6px">Olá, '+esc(c.nome.split(' ')[0])+'.</h2>'
      + '<p class="sub">Você foi convidado para a Academia do Motorista. Confirme seu nome e '
      +   'digite a senha que o seu supervisor informou.</p>'
      + '<form id="f-convite" class="fm" style="margin-top:22px">'
      +   '<div class="cp"><span class="cp-l">Nome</span><div class="in in-ro">'+esc(c.nome)+'</div></div>'
      +   '<label class="cp"><span class="cp-l">Usuário</span>'
      +     '<input class="in in-ro" name="usuario" value="'+esc(c.usuario)+'" readonly autocomplete="username"></label>'
      +   '<label class="cp"><span class="cp-l">Senha</span>'
      +     '<input class="in" name="senha" type="password" autocomplete="current-password" required autofocus></label>'
      +   '<div class="fm-err" id="lg-err" role="alert"></div>'
      +   '<button class="bt bt-pr bt-bl" type="submit" id="bt-entrar">Entrar e começar</button>'
      + '</form>'
      + '<div class="nota" style="margin-top:20px">Guarde o seu usuário: <b>'+esc(c.usuario)+'</b>. '
      +   'Nas próximas vezes, entre por este mesmo link ou pela tela de login.</div>';
  }).catch(function(e){
    if(el) el.innerHTML = '<p class="sub">'+esc(erroLegivel(e))+'</p>';
  });
}

function enviaLogin(f){
  var bt = $('#bt-entrar', f), err = $('#lg-err', f);
  var u = f.usuario.value, s = f.senha.value;
  err.textContent = '';
  bt.disabled = true; bt.textContent = 'Entrando…';
  Api.entrar(u, s)
    .then(function(){ return Sessao.inicia() })
    .then(function(){ Rota.ir(Sessao.perfil === 'gestor' ? '#/gestor' : '#/motorista') })
    .catch(function(e){
      Api.guarda(null);
      err.textContent = erroLegivel(e);
      bt.disabled = false; bt.textContent = f.id === 'f-convite' ? 'Entrar e começar' : 'Entrar';
    });
}

/* ============================================================ início */
function ajustaSelo(){
  document.body.classList.toggle('tem-selo', !!document.getElementById('ac-badge'));
}

function inicia(){
  ligaEventos();
  Rota.liga();
  ajustaSelo();
  addEventListener('DOMContentLoaded', ajustaSelo);
  addEventListener('load', ajustaSelo);
  setTimeout(ajustaSelo, 600);

  if(Api.carregaSessao() && Rota.atual.indexOf('#/convite/') !== 0){
    $('#app').innerHTML = carregando('Abrindo a Academia…');
    Sessao.inicia().then(desenha).catch(function(){ Api.guarda(null); desenha() });
  } else {
    desenha();
  }
}
