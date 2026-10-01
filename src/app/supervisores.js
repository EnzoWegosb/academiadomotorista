/* ============================================================
   Supervisores — convidar outro supervisor.
   O convidado herda a CLASSE de quem convida (decidido no servidor):
   convidado por uma conta de demonstração também é de demonstração e só
   enxerga motoristas de exemplo; convidado por supervisor real tem acesso completo.
   ============================================================ */
function telaSupervisores(){
  /* só a equipe da mesma classe (o supervisor real também enxerga as contas de demonstração, mas elas não são equipe) */
  var sup = (Store.d.perfis || []).filter(function(p){ return p.papel === 'supervisor' && !!p.exemplo === souExemplo() })
    .sort(function(a, b){ return a.nome.localeCompare(b.nome, 'pt-BR') });
  var nome = function(id){ var p = (Store.d.perfis || []).filter(function(x){ return x.id === id })[0]; return p ? p.nome : '—' };
  var lin = sup.map(function(p){
    return '<tr><td><div class="nm"><div class="av av-sm">'+esc(iniciais(p.nome))+'</div>'
      + '<div><b>'+esc(p.nome)+'</b><span>'+esc(p.usuario)+'</span></div></div></td>'
      + '<td>'+(p.id === Sessao.eu.id ? '<em class="tg-a ok">Você</em>' : '')+'</td>'
      + '<td class="mono">'+(dataBR(p.criado_em) || '—')+'</td>'
      + '<td>'+(p.convidado_por ? esc(nome(p.convidado_por)) : '<span class="sub" style="font-size:12.5px">conta inicial</span>')+'</td></tr>';
  }).join('');

  return ''
  + '<div class="topo"><div><div class="lbl">Supervisores</div>'
  +   '<h1 class="h1" style="margin-top:8px">Equipe de supervisão</h1>'
  +   '<p class="sub" style="margin-top:7px">'+(souExemplo()
        ? 'Supervisores convidados por esta conta também são de demonstração: enxergam e gerenciam só os motoristas de exemplo.'
        : 'Supervisores convidados por você têm as mesmas permissões que você: todos os motoristas e todas as aulas.')+'</p></div></div>'
  + '<section class="cd" style="margin-bottom:18px"><div class="lbl" style="margin-bottom:14px">Convidar supervisor</div>'
  + '<form id="f-sup" class="fm"><div class="fm-gr">'
  +   '<label class="cp"><span class="cp-l">Nome completo *</span><input class="in" name="nome" required></label>'
  +   '<label class="cp"><span class="cp-l">Usuário (opcional)</span>'
  +     '<input class="in" name="usuario" autocapitalize="none" spellcheck="false" placeholder="gerado a partir do nome"></label>'
  +   '<label class="cp"><span class="cp-l">Senha inicial *</span>'
  +     '<div class="in-g"><input class="in" name="senha" id="sup-senha" minlength="8" required autocomplete="off" value="'+sugereSenha()+'">'
  +     '<button type="button" class="bt bt-ln bt-sm" id="sup-sug">Outra</button></div></label>'
  + '</div><div class="fm-err" id="sup-err" role="alert"></div>'
  + '<div class="bts"><button class="bt bt-pr" type="submit" id="sup-salvar">Convidar supervisor</button></div></form>'
  + '<div id="sup-res"></div></section>'
  + '<div class="tb-w"><table class="tb"><thead><tr><th>Supervisor</th><th></th><th>Desde</th><th>Convidado por</th></tr></thead>'
  + '<tbody>'+lin+'</tbody></table></div>'
  + rodape();
}

function msgSupervisor(r, senha){
  return 'Olá, ' + r.nome.split(' ')[0] + '! Você foi cadastrado como supervisor na Academia do Motorista.\n\n'
       + 'Acesse: ' + location.origin + location.pathname + '\n'
       + 'Usuário: ' + r.usuario + '\nSenha: ' + senha;
}

function enviaSupervisor(f){
  var bt = $('#sup-salvar'), err = $('#sup-err'), senha = f.senha.value;
  err.textContent = '';
  bt.disabled = true; bt.textContent = 'Convidando…';
  var corpo = {acao: 'criar_supervisor', nome: f.nome.value.trim(), senha: senha};
  if(f.usuario.value.trim()) corpo.usuario = f.usuario.value.trim().toLowerCase();
  Api.fn(corpo).then(function(r){
    var m = msgSupervisor(r, senha);
    f.reset(); $('#sup-senha').value = sugereSenha();
    bt.disabled = false; bt.textContent = 'Convidar supervisor';
    $('#sup-res').innerHTML = '<div class="convite-ok" style="margin-top:18px">'
      + '<div class="trava lib" style="margin-bottom:12px"><span class="ic">'+ic('check', 18)+'</span><span><b>'+esc(r.nome)
      + '</b> foi cadastrado como supervisor'+(r.exemplo ? ' de demonstração' : '')+'. Envie a mensagem abaixo — '
      + '<b>esta é a única vez que a senha aparece.</b></span></div>'
      + '<pre class="cv-msg" id="sup-msg">'+esc(m)+'</pre>'
      + '<div class="bts" style="margin-top:12px"><button class="bt bt-pr bt-sm" data-copia="'+esc(m)+'">'+ic('livro', 15)+' Copiar mensagem</button></div></div>';
    Store.carrega().then(function(){
      var tb = document.querySelector('.tb-w'); if(!tb || location.hash !== '#/gestor/supervisores') return;
      var tmp = document.createElement('div'); tmp.innerHTML = telaSupervisores();
      tb.replaceWith(tmp.querySelector('.tb-w'));
    });
  }).catch(function(e){
    err.textContent = erroLegivel(e);
    bt.disabled = false; bt.textContent = 'Convidar supervisor';
  });
}

document.addEventListener('click', function(e){
  if(e.target.closest && e.target.closest('#sup-sug')){ $('#sup-senha').value = sugereSenha() }
});
document.addEventListener('submit', function(e){
  if(e.target.id === 'f-sup'){ e.preventDefault(); enviaSupervisor(e.target) }
});
