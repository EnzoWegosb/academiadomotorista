/* ============================================================
   Cliente do Supabase — sem biblioteca externa, direto na API REST.

   Sessão guardada em sessionStorage (por aba), NÃO em localStorage:
   o link público mora num domínio compartilhado com outras páginas
   publicadas, e o localStorage é legível por qualquer página do mesmo
   domínio. Fechar a aba encerra a sessão.
   ============================================================ */
var DOMINIO_LOGIN = 'academia-motorista.invalid';
var CHAVE_SESSAO  = 'academia-sessao-v2';

var Api = {
  s: null,                                   /* {access_token, refresh_token, expires_at, user} */

  /* ---------------------------------------------------------- sessão */
  carregaSessao: function(){
    try{ this.s = JSON.parse(sessionStorage.getItem(CHAVE_SESSAO) || 'null') }catch(e){ this.s = null }
    return this.s;
  },
  guarda: function(s){
    this.s = s;
    try{
      if(s) sessionStorage.setItem(CHAVE_SESSAO, JSON.stringify(s));
      else  sessionStorage.removeItem(CHAVE_SESSAO);
    }catch(e){}
  },

  /* usuário → e-mail interno. Supervisor e motorista entram pelo usuário. */
  emailDe: function(usuario){
    usuario = String(usuario || '').trim().toLowerCase();
    return usuario.indexOf('@') >= 0 ? usuario : usuario + '@' + DOMINIO_LOGIN;
  },

  _req: function(metodo, caminho, corpo, semLogin, extra){
    var h = {'apikey': SUPA_KEY, 'Content-Type': 'application/json'};
    if(!semLogin && this.s) h['Authorization'] = 'Bearer ' + this.s.access_token;
    if(extra) for(var k in extra) h[k] = extra[k];
    return fetch(SUPA_URL + caminho, {
      method: metodo, headers: h, body: corpo === undefined ? undefined : JSON.stringify(corpo)
    }).then(function(r){
      return r.text().then(function(t){
        var d = null; try{ d = t ? JSON.parse(t) : null }catch(e){ d = t }
        if(!r.ok){
          var m = (d && (d.message || d.msg || d.erro || d.error_description || d.error)) || ('Erro ' + r.status);
          var err = new Error(m); err.status = r.status; err.dados = d; throw err;
        }
        return d;
      });
    });
  },

  entrar: function(usuario, senha){
    var self = this;
    return this._req('POST', '/auth/v1/token?grant_type=password',
                     {email: this.emailDe(usuario), password: senha}, true)
      .then(function(d){ self.guarda(self._sess(d)); return d })
      .catch(function(e){
        if(e.status === 400) e.message = 'Usuário ou senha incorretos.';
        if(e.dados && /banned/i.test(JSON.stringify(e.dados))) e.message = 'Este acesso está desativado. Fale com o seu supervisor.';
        throw e;
      });
  },
  _sess: function(d){
    return {access_token: d.access_token, refresh_token: d.refresh_token,
            expires_at: Math.floor(Date.now()/1000) + (d.expires_in || 3600), user: d.user};
  },
  sair: function(){
    var s = this.s;
    this.guarda(null);
    if(s) this._reqCom(s, 'POST', '/auth/v1/logout').catch(function(){});
  },
  _reqCom: function(s, m, c){
    return fetch(SUPA_URL + c, {method: m, headers: {'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + s.access_token}});
  },

  /* renova o token se faltar menos de 90 s para expirar */
  garante: function(){
    var self = this, s = this.s;
    if(!s) return Promise.reject(new Error('Sessão encerrada'));
    if(s.expires_at - Date.now()/1000 > 90) return Promise.resolve(s);
    return this._req('POST', '/auth/v1/token?grant_type=refresh_token', {refresh_token: s.refresh_token}, true)
      .then(function(d){ self.guarda(self._sess(d)); return self.s })
      .catch(function(e){ self.guarda(null); throw e });
  },

  /* ---------------------------------------------------------- dados */
  sel: function(tabela, consulta){
    var self = this;
    return this.garante().then(function(){ return self._req('GET', '/rest/v1/' + tabela + '?' + consulta) });
  },
  rpc: function(nome, args, semLogin){
    var self = this;
    if(semLogin) return this._req('POST', '/rest/v1/rpc/' + nome, args || {}, true);
    return this.garante().then(function(){ return self._req('POST', '/rest/v1/rpc/' + nome, args || {}) });
  },
  fn: function(corpo){
    var self = this;
    return this.garante().then(function(){ return self._req('POST', '/functions/v1/gestao-motoristas', corpo) });
  }
};

/* mensagens de erro do banco → português para o usuário */
function erroLegivel(e){
  var m = String((e && e.message) || e || '');
  if(/VIDEO_INCOMPLETO/.test(m))   return 'O servidor ainda não registrou a aula completa. Assista até o fim.';
  if(/JA_APROVADO/.test(m))        return 'Você já foi aprovado neste treinamento.';
  if(/RESPOSTAS_INVALIDAS/.test(m))return 'Responda todas as perguntas antes de enviar.';
  if(/ADIANTAR_DESATIVADO/.test(m))return 'O botão de adiantar foi desligado pela supervisão.';
  if(/AULA_COM_TENTATIVAS/.test(m)) return 'Esta aula já tem tentativas de quiz: vídeo e perguntas não podem mais mudar. Crie uma aula nova.';
  if(/AULA_SEM_MOTORISTAS/.test(m)) return 'Escolha ao menos um motorista para receber a aula.';
  if(/AULA_PERGUNTA_INVALIDA/.test(m)) return 'Há pergunta incompleta: enunciado, 2 a 5 alternativas preenchidas e a correta marcada.';
  if(/AULA_PERGUNTAS/.test(m))     return 'A aula precisa de 1 a 15 perguntas.';
  if(/AULA_VIDEO/.test(m))         return 'Vídeo inválido: confira o link do YouTube ou envie o arquivo de novo.';
  if(/AULA_DURACAO/.test(m))       return 'Informe a duração do vídeo.';
  if(/AULA_TITULO/.test(m))        return 'Dê um título à aula (mínimo de 3 letras).';
  if(/AULA_SEM_PERMISSAO/.test(m)) return 'Você não tem permissão para alterar esta aula.';
  if(/MOTORISTA_INATIVO/.test(m))  return 'Seu acesso foi desativado. Fale com o seu supervisor.';
  if(/Failed to fetch|NetworkError/i.test(m)) return 'Sem conexão com o servidor. Verifique a internet e tente de novo.';
  return m;
}
