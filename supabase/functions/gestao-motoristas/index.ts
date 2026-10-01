// ============================================================================
// Academia do Motorista — função de servidor `gestao-motoristas`
//
// Única peça do sistema que usa a chave secreta. Só atende SUPERVISORES:
// o papel é conferido na tabela `perfis` a cada chamada (nunca em metadados
// que o próprio usuário consegue editar).
//
// Ações: criar · atualizar · senha · desativar · reativar · novo_convite · criar_supervisor
// ============================================================================
import { createClient } from "npm:@supabase/supabase-js@2";

// Domínio RESERVADO por norma (RFC 2606): ninguém consegue registrá-lo, então
// nenhum e-mail — inclusive de recuperação de senha — pode chegar a um estranho.
const DOMINIO = "academia-motorista.invalid";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const resp = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const CAMPOS = ["cpf", "telefone", "email_contato", "cidade", "uf", "cnh_categoria",
                "cnh_validade", "veiculo", "placa", "inicio", "observacoes"] as const;

function slug(nome: string): string {
  const p = nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z\s]/g, " ").split(/\s+/).filter((x) => x.length > 1);
  if (!p.length) return "motorista";
  return (p.length > 1 ? p[0] + "." + p[p.length - 1] : p[0]).slice(0, 36);
}

// Valida e normaliza os campos do cadastro. Devolve [dados, erro].
function limpa(b: Record<string, unknown>): [Record<string, unknown>, string | null] {
  const d: Record<string, unknown> = {};
  for (const k of CAMPOS) {
    if (!(k in b)) continue;
    const v = b[k];
    d[k] = (v === "" || v === undefined) ? null : typeof v === "string" ? v.trim() : v;
  }
  if (d.cpf != null) {
    d.cpf = String(d.cpf).replace(/\D/g, "");
    if (String(d.cpf).length !== 11) return [d, "CPF deve ter 11 dígitos"];
  }
  if (d.uf != null) {
    d.uf = String(d.uf).toUpperCase();
    if (!/^[A-Z]{2}$/.test(String(d.uf))) return [d, "UF deve ter 2 letras"];
  }
  if (d.placa != null) d.placa = String(d.placa).toUpperCase().replace(/[^A-Z0-9]/g, "");
  for (const k of ["cnh_validade", "inicio"]) {
    if (d[k] != null && !/^\d{4}-\d{2}-\d{2}$/.test(String(d[k]))) return [d, `Data inválida em ${k}`];
  }
  return [d, null];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return resp(405, { erro: "Use POST" });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } });

  // ---- quem está chamando? ----
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: quem } = await admin.auth.getUser(token);
  if (!quem?.user) return resp(401, { erro: "Sessão inválida ou expirada" });
  const { data: perfil } = await admin.from("perfis").select("papel, exemplo").eq("id", quem.user.id).maybeSingle();
  if (perfil?.papel !== "supervisor") return resp(403, { erro: "Somente supervisores podem gerenciar motoristas" });
  // Supervisor de EXEMPLO: tudo o que ele cria nasce marcado como exemplo, e ele
  // só age sobre exemplos e sobre o que ele mesmo criou. Motorista real fica fora.
  const exemplo = !!perfil.exemplo;
  const MARCA = "EXEMPLO — criado pelo supervisor de exemplo.";
  const marca = (obs: unknown) => {
    const t = typeof obs === "string" ? obs.trim() : "";
    return t.startsWith("EXEMPLO") ? t : (MARCA + (t ? " " + t : ""));
  };

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return resp(400, { erro: "Corpo inválido" }); }
  const acao = String(b.acao ?? "");
  const id = typeof b.id === "string" ? b.id : "";

  // garante que o alvo é um MOTORISTA (supervisor não gerencia outro supervisor por aqui)
  async function alvoMotorista(): Promise<boolean> {
    if (!id) return false;
    const { data } = await admin.from("perfis").select("papel").eq("id", id).maybeSingle();
    if (data?.papel !== "motorista") return false;
    if (!exemplo) return true;
    const { data: m } = await admin.from("motoristas").select("observacoes, criado_por").eq("id", id).maybeSingle();
    return !!m && ((m.observacoes ?? "").startsWith("EXEMPLO") || m.criado_por === quem.user.id);
  }

  // ============================================================ criar
  if (acao === "criar") {
    const nome = String(b.nome ?? "").trim().replace(/\s+/g, " ");
    const senha = String(b.senha ?? "");
    if (nome.length < 3) return resp(400, { erro: "Informe o nome completo" });
    if (senha.length < 8) return resp(400, { erro: "A senha precisa ter pelo menos 8 caracteres" });
    const [dados, erro] = limpa(b);
    if (erro) return resp(400, { erro });
    if (exemplo) dados.observacoes = marca(dados.observacoes);

    // usuário: o informado, ou derivado do nome; único
    let base = String(b.usuario ?? "").trim().toLowerCase() || slug(nome);
    if (!/^[a-z0-9._-]{3,40}$/.test(base)) return resp(400, { erro: "Usuário: 3 a 40 caracteres, letras minúsculas, números, ponto, hífen" });
    let usuario = base;
    for (let n = 2; n < 200; n++) {
      const { data } = await admin.from("perfis").select("id").eq("usuario", usuario).maybeSingle();
      if (!data) break;
      if (b.usuario) return resp(409, { erro: `O usuário "${usuario}" já existe` });
      usuario = `${base}${n}`;
    }

    const { data: novo, error: e1 } = await admin.auth.admin.createUser({
      email: `${usuario}@${DOMINIO}`, password: senha, email_confirm: true,
      app_metadata: { papel: "motorista" },
    });
    if (e1 || !novo?.user) return resp(400, { erro: "Não foi possível criar o acesso: " + (e1?.message ?? "") });
    const uid = novo.user.id;

    // se qualquer passo seguinte falhar, desfaz a conta criada
    const desfaz = async (msg: string) => { await admin.auth.admin.deleteUser(uid); return resp(400, { erro: msg }); };

    const { error: e2 } = await admin.from("perfis").insert({ id: uid, papel: "motorista", nome, usuario });
    if (e2) return desfaz("Falha ao gravar o perfil: " + e2.message);
    const { data: mot, error: e3 } = await admin.from("motoristas")
      .insert({ id: uid, ...dados, criado_por: quem.user.id }).select("convite_token").single();
    if (e3) return desfaz("Falha ao gravar o cadastro: " + e3.message);
    const { data: mods } = await admin.from("modulos").select("id").eq("ativo", true);
    if (mods?.length) {
      await admin.from("progresso").insert(mods.map((m) => ({ motorista_id: uid, modulo_id: m.id })));
    }
    return resp(200, { id: uid, usuario, nome, convite_token: mot.convite_token });
  }

  // ============================================================ convidar supervisor
  // O novo supervisor herda a CLASSE de quem convida: convidado por uma conta de
  // demonstração também é de demonstração (só enxerga exemplos); convidado por
  // um supervisor real tem acesso completo.
  if (acao === "criar_supervisor") {
    const nome = String(b.nome ?? "").trim().replace(/\s+/g, " ");
    const senha = String(b.senha ?? "");
    if (nome.length < 3) return resp(400, { erro: "Informe o nome completo" });
    if (senha.length < 8) return resp(400, { erro: "A senha precisa ter pelo menos 8 caracteres" });
    let base = String(b.usuario ?? "").trim().toLowerCase() || slug(nome);
    if (!/^[a-z0-9._-]{3,40}$/.test(base)) return resp(400, { erro: "Usuário: 3 a 40 caracteres, letras minúsculas, números, ponto, hífen" });
    let usuario = base;
    for (let n = 2; n < 200; n++) {
      const { data } = await admin.from("perfis").select("id").eq("usuario", usuario).maybeSingle();
      if (!data) break;
      if (b.usuario) return resp(409, { erro: `O usuário "${usuario}" já existe` });
      usuario = `${base}${n}`;
    }
    const { data: novo, error: e1 } = await admin.auth.admin.createUser({
      email: `${usuario}@${DOMINIO}`, password: senha, email_confirm: true,
      app_metadata: { papel: "supervisor", exemplo },
    });
    if (e1 || !novo?.user) return resp(400, { erro: "Não foi possível criar o acesso: " + (e1?.message ?? "") });
    const { error: e2 } = await admin.from("perfis").insert({
      id: novo.user.id, papel: "supervisor", nome, usuario, exemplo, convidado_por: quem.user.id });
    if (e2) { await admin.auth.admin.deleteUser(novo.user.id); return resp(400, { erro: "Falha ao gravar o perfil: " + e2.message }); }
    return resp(200, { id: novo.user.id, usuario, nome, exemplo });
  }

  if (!(await alvoMotorista())) return resp(404, { erro: "Motorista não encontrado" });

  // ============================================================ atualizar
  if (acao === "atualizar") {
    const [dados, erro] = limpa(b);
    if (erro) return resp(400, { erro });
    if (exemplo && "observacoes" in dados) dados.observacoes = marca(dados.observacoes);
    if (typeof b.nome === "string") {
      const nome = b.nome.trim().replace(/\s+/g, " ");
      if (nome.length < 3) return resp(400, { erro: "Nome muito curto" });
      const { error } = await admin.from("perfis").update({ nome }).eq("id", id);
      if (error) return resp(400, { erro: error.message });
    }
    const { error } = await admin.from("motoristas").update({ ...dados, atualizado_em: new Date().toISOString() }).eq("id", id);
    if (error) return resp(400, { erro: error.message });
    return resp(200, { ok: true });
  }

  // ============================================================ senha
  if (acao === "senha") {
    const senha = String(b.senha ?? "");
    if (senha.length < 8) return resp(400, { erro: "A senha precisa ter pelo menos 8 caracteres" });
    // autoriza a troca por 1 minuto — o gatilho do banco recusa sem isso
    const { error: ea } = await admin.rpc("autorizar_troca_senha", { p_id: id });
    if (ea) return resp(500, { erro: "Falha ao autorizar a troca: " + ea.message });
    const { error } = await admin.auth.admin.updateUserById(id, { password: senha });
    if (error) return resp(400, { erro: "Não foi possível trocar a senha: " + error.message });
    return resp(200, { ok: true });
  }

  // ============================================================ desativar / reativar
  if (acao === "desativar" || acao === "reativar") {
    const ativo = acao === "reativar";
    // banir no Auth impede o login; o campo `ativo` bloqueia as funções do banco
    const { error } = await admin.auth.admin.updateUserById(id, { ban_duration: ativo ? "none" : "876000h" });
    if (error) return resp(400, { erro: error.message });
    await admin.from("motoristas").update({ ativo, atualizado_em: new Date().toISOString() }).eq("id", id);
    return resp(200, { ok: true, ativo });
  }

  // ============================================================ novo convite
  if (acao === "novo_convite") {
    const { data, error } = await admin.from("motoristas")
      .update({ convite_token: crypto.randomUUID(), convite_criado_em: new Date().toISOString() })
      .eq("id", id).select("convite_token").single();
    if (error) return resp(400, { erro: error.message });
    return resp(200, { convite_token: data.convite_token });
  }

  return resp(400, { erro: "Ação desconhecida" });
});
