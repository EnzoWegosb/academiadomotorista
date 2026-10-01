// ============================================================================
// Academia do Motorista — função `gerar-perguntas`
//
// Gera um RASCUNHO de quiz a partir do material da aula. O supervisor revisa e
// edita antes de salvar: nada vai direto para o motorista.
//
// Precisa do segredo ANTHROPIC_API_KEY na função (Supabase → Edge Functions →
// Secrets). Sem ele, responde 501 e a tela explica o que falta.
//
// Material usado, em ordem de qualidade:
//   1. o texto que o supervisor colar (transcrição, roteiro, resumo da aula)
//   2. para vídeo do YouTube: a legenda, se o YouTube entregar; senão a descrição
//   3. título e descrição da aula
// Com material insuficiente a função RECUSA, em vez de inventar perguntas.
// ============================================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const MODELO = "claude-sonnet-5";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const resp = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const SISTEMA = `Você escreve quizzes de treinamento para motoristas profissionais no Brasil.
Regras:
- Use SOMENTE o material fornecido. Não acrescente fatos que não estejam nele.
- Cada pergunta testa um ponto prático e importante do material, não um detalhe trivial.
- 4 alternativas por pergunta, todas plausíveis, só UMA correta, sem "todas as anteriores".
- Português do Brasil, linguagem simples e direta.
- Varie a posição da alternativa correta.
Responda APENAS com JSON no formato:
{"perguntas":[{"enunciado":"...","alternativas":["...","...","...","..."],"correta":0}]}`;

async function legendaOuDescricao(videoId: string): Promise<{ texto: string; base: string }> {
  try {
    const r = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=pt`, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0 Safari/537.36",
                 "Accept-Language": "pt-BR,pt;q=0.9" } });
    const h = await r.text();
    const trilhas = h.match(/"captionTracks":(\[.*?\])/);
    if (trilhas) {
      const t = JSON.parse(trilhas[1]);
      const url = (t.find((x: { languageCode: string }) => x.languageCode?.startsWith("pt")) ?? t[0])?.baseUrl;
      if (url) {
        const xml = await (await fetch(url.replace(/\\u0026/g, "&"))).text();
        const txt = [...xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)].map((m) => m[1]).join(" ")
          .replace(/&amp;#39;|&#39;/g, "'").replace(/&amp;quot;|&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
        if (txt.length > 400) return { texto: txt.slice(0, 60000), base: "legenda do vídeo" };
      }
    }
    const d = h.match(/"shortDescription":"((?:[^"\\]|\\.)*)"/);
    if (d) {
      const desc = JSON.parse(`"${d[1]}"`).trim();
      if (desc) return { texto: desc, base: "descrição do vídeo no YouTube" };
    }
  } catch (_) { /* sem rede ou bloqueado: segue sem */ }
  return { texto: "", base: "" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return resp(405, { erro: "Use POST" });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } });
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: quem } = await admin.auth.getUser(token);
  if (!quem?.user) return resp(401, { erro: "Sessão inválida ou expirada" });
  const { data: perfil } = await admin.from("perfis").select("papel").eq("id", quem.user.id).maybeSingle();
  if (perfil?.papel !== "supervisor") return resp(403, { erro: "Somente supervisores" });

  const chave = Deno.env.get("ANTHROPIC_API_KEY");
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return resp(400, { erro: "Corpo inválido" }); }
  // consulta rápida: a tela pergunta antes de pedir material ao supervisor
  if (b.status) return resp(200, { configurada: !!chave });
  if (!chave) return resp(501, { erro: "GERACAO_NAO_CONFIGURADA" });
  const titulo = String(b.titulo ?? "").trim();
  const descricao = String(b.descricao ?? "").trim();
  const colado = String(b.texto ?? "").trim().slice(0, 60000);
  const n = Math.min(Math.max(parseInt(String(b.n ?? 4)) || 4, 1), 10);

  const partes: string[] = []; const bases: string[] = [];
  if (colado) { partes.push("MATERIAL INFORMADO PELO SUPERVISOR:\n" + colado); bases.push("texto informado pelo supervisor"); }
  if (typeof b.video_id === "string" && /^[A-Za-z0-9_-]{11}$/.test(b.video_id)) {
    const y = await legendaOuDescricao(b.video_id);
    if (y.texto) { partes.push(`${y.base.toUpperCase()}:\n${y.texto}`); bases.push(y.base); }
  }
  const corpo = partes.join("\n\n");
  // Só título não sustenta perguntas sobre o conteúdo: recusa em vez de inventar.
  if (corpo.length < 300) return resp(422, { erro: "MATERIAL_INSUFICIENTE", base: bases });

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": chave, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODELO, max_tokens: 4000,
      system: [{ type: "text", text: SISTEMA, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content:
        `Aula: ${titulo}\n${descricao ? "Descrição: " + descricao + "\n" : ""}\n${corpo}\n\nEscreva ${n} perguntas.` }],
    }),
  });
  if (!r.ok) return resp(502, { erro: "Falha no serviço de IA (" + r.status + ")" });
  const d = await r.json();
  const txt = (d.content ?? []).map((c: { text?: string }) => c.text ?? "").join("");
  let qs;
  try { qs = JSON.parse(txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1)).perguntas; } catch { qs = null; }
  const validas = Array.isArray(qs) ? qs.filter((q) =>
    q && typeof q.enunciado === "string" && Array.isArray(q.alternativas) && q.alternativas.length >= 2 &&
    q.alternativas.length <= 5 && Number.isInteger(q.correta) && q.correta >= 0 && q.correta < q.alternativas.length) : [];
  if (!validas.length) return resp(502, { erro: "A IA não devolveu perguntas válidas. Tente de novo." });
  return resp(200, { perguntas: validas.slice(0, n), base: bases });
});
