/* ============================================================
   Player de vídeo — YouTube IFrame API + registro no servidor.

   Duas camadas de controle do tempo assistido:
   1. NO NAVEGADOR: só entra na conta o avanço contínuo da reprodução. Um salto
      maior que UM_PULO entre duas leituras é arrastar a barra — não conta.
   2. NO SERVIDOR (registrar_video): o banco credita no máximo o dobro do tempo
      real decorrido entre dois registros. É o número do servidor que libera o
      quiz — mexer no navegador não adianta.

   Sem vídeo, sem aula: se o YouTube não carregar, a tela mostra o erro e
   oferece tentar de novo. Não existe modo simulado nem botão de adiantar.
   ============================================================ */
var Player = {
  yt:null, tid:null, mod:null, ultT:0, dur:0,
  servidor:0,      /* segundos creditados pelo banco — a fonte da verdade */
  pend:0,          /* avanço contínuo ainda não enviado */
  liberado:false, pronto:false, tocando:false, enviando:false, ultEnvio:0, falhas:0,

  UM_PULO: 1.6,    /* avanço máximo aceito entre duas leituras, em segundos */
  ENVIO_S: 5,      /* envia a cada ~5 s de aula */

  carregaAPI: function(cb){
    if(window.YT && window.YT.Player) return cb(true);
    if(Player._fila){ Player._fila.push(cb); return }
    Player._fila = [cb];
    var fim = function(ok){
      if(!Player._fila) return;
      var f = Player._fila; Player._fila = null;
      f.forEach(function(x){ x(ok) });
    };
    window.onYouTubeIframeAPIReady = function(){ fim(true) };
    var s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = function(){ fim(false) };
    document.head.appendChild(s);
    setTimeout(function(){ fim(!!(window.YT && window.YT.Player)) }, 9000);
  },

  monta: function(mod, prog, aoMudar){
    this.destroi();
    this.mod = mod;
    this.dur = mod.videoSeg;
    this.servidor = prog ? (prog.assistido || 0) : 0;
    this.liberado = !!(prog && (prog.videoConcluido || this.servidor >= Store.d.limiarVideo * this.dur));
    this.pend = 0; this.ultT = 0; this.pronto = false; this.falhas = 0;
    this.aoMudar = aoMudar || function(){};
    var self = this;
    this.pinta();
    this.carregaAPI(function(ok){
      if(!$('#pl-alvo')) return;
      if(ok) self.montaYT(); else self.semVideo();
    });
  },

  montaYT: function(){
    var self = this;
    try{
      this.yt = new YT.Player('pl-alvo', {
        videoId: this.mod.video,
        playerVars:{rel:0, modestbranding:1, playsinline:1},
        events:{
          onReady: function(){
            self.pronto = true;
            if(self.servidor > 2 && self.servidor < self.dur - 3){
              try{ self.yt.seekTo(self.servidor, true) }catch(e){}
            }
            self.ultT = self.servidor;
            self.relogio();
            self.pinta();
          },
          onStateChange: function(e){
            self.tocando = (e.data === 1);
            if(e.data === 1){ try{ self.ultT = self.yt.getCurrentTime() }catch(x){} }
            if(e.data === 0 || e.data === 2) self.envia();   /* terminou ou pausou */
            self.pinta();
          },
          onError: function(e){ self.semVideo(e && e.data) }
        }
      });
    }catch(e){ this.semVideo() }
  },

  /* Erro 153: o YouTube recusa incorporar vídeo quando a página foi aberta como
     ARQUIVO (file://) — ele exige saber de que site o vídeo está sendo exibido.
     Pelo link publicado (https) funciona. Medido em 30/09/2026. */
  semVideo: function(codigo){
    var alvo = $('#pl-alvo');
    if(!alvo) return;
    var arquivo = location.protocol === 'file:' || codigo === 153;
    alvo.outerHTML = '<div class="pl-sim" id="pl-alvo">'
      + '<div style="font-size:34px">'+ic('alerta',34)+'</div>'
      + '<div class="ttl">Não foi possível carregar o vídeo</div>'
      + '<div class="nt">' + (arquivo
          ? 'Esta página foi aberta como arquivo baixado, e o YouTube só exibe o vídeo dentro de um site. '
            + 'Abra a Academia pelo link que o seu supervisor enviou.'
          : 'Verifique a conexão. Se estiver numa rede que bloqueia o YouTube, '
            + 'use os dados móveis do celular ou outra rede.') + '</div>'
      + (arquivo ? '' : '<button class="bt bt-az bt-sm" id="pl-retenta">Tentar de novo</button>') + '</div>';
  },

  relogio: function(){
    var self = this;
    clearInterval(this.tid);
    this.tid = setInterval(function(){ self.tique() }, 500);
  },

  tique: function(){
    if(!this.pronto || !this.yt || !this.yt.getCurrentTime) return;
    var t = this.yt.getCurrentTime();
    if(this.tocando){
      var d = t - this.ultT;
      if(d > 0 && d <= this.UM_PULO) this.pend += d;
    }
    this.ultT = t;
    if(this.pend >= this.ENVIO_S) this.envia();
    this.pinta();
  },

  envia: function(){
    if(this.enviando || this.pend < 0.2 || !this.mod) return;
    var self = this, x = Math.round(this.pend * 100) / 100, mod = this.mod.id;
    this.pend = 0; this.enviando = true;
    Api.rpc('registrar_video', {p_modulo: mod, p_delta: x}).then(function(r){
      self.falhas = 0;
      Store.ajustaProg(Sessao.motorista, mod, {status: r.status, assistido: +r.segundos,
                                               videoConcluido: !!r.liberado, ultima: dataBR(new Date().toISOString())});
      if(!self.mod || self.mod.id !== mod) return;   /* saiu da aula enquanto enviava */
      self.servidor = +r.segundos;
      self.liberado = !!r.liberado;
    }).catch(function(e){
      self.pend += x;                       /* não perde o que foi assistido */
      if(++self.falhas === 3) aviso('Sem conexão com o servidor — seu progresso será enviado quando voltar.', 'err');
      if(/INATIVO/.test(e.message)) aviso(erroLegivel(e), 'err');
    }).then(function(){ self.enviando = false; self.pinta() });
  },

  /* Modo demonstração: libera o quiz sem assistir. O servidor só aceita com
     config.modo_demo = 1 e marca o registro como "aula adiantada". */
  adianta: function(){
    var self = this, mod = this.mod && this.mod.id;
    if(!mod) return Promise.resolve();
    this.pend = 0;
    return Api.rpc('adiantar_aula', {p_modulo: mod}).then(function(r){
      Store.ajustaProg(Sessao.motorista, mod, {status: r.status, assistido: +r.segundos,
                       videoConcluido: true, aulaAdiantada: true, ultima: dataBR(new Date().toISOString())});
      if(!self.mod || self.mod.id !== mod) return;
      self.servidor = +r.segundos; self.liberado = true;
      try{ if(self.yt && self.yt.pauseVideo) self.yt.pauseVideo() }catch(e){}
      self.pinta();
    });
  },

  frac: function(){ return this.dur > 0 ? Math.min((this.servidor + this.pend) / this.dur, 1) : 0 },
  completo: function(){ return this.liberado },

  pinta: function(){
    var p = this.liberado ? 100 : Math.min(Math.floor(this.frac() * 100), 99);
    var bf = $('#pl-bar-f'), bn = $('#pl-bar-n'), st = $('#pl-st');
    if(bf){ bf.style.width = p + '%'; bf.className = 'bar-f' + (this.liberado ? ' ok' : '') }
    if(bn) bn.textContent = p + '%';
    if(st){
      var vis = Math.min(this.servidor + this.pend, this.dur);
      st.className = 'pl-st' + (this.liberado ? ' fim' : '');
      st.innerHTML = '<span class="pd"></span>' + (this.liberado ? 'Aula concluída'
        : (this.tocando ? 'Assistindo' : (this.pronto ? 'Pausado' : 'Carregando'))
          + ' · ' + mmss(vis) + ' de ' + mmss(this.dur));
    }
    this.aoMudar(this.liberado, p);
  },

  destroi: function(){
    if(this.pend >= 0.2) this.envia();
    clearInterval(this.tid); this.tid = null;
    if(this.yt && this.yt.destroy){ try{ this.yt.destroy() }catch(e){} }
    this.yt = null; this.mod = null; this.pronto = false; this.tocando = false;
    this.aoMudar = function(){};
  }
};
