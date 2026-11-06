// Avisos dos veículos pessoais por e-mail (executado todo dia pelo GitHub Actions, .github/workflows/alertas-veiculos.yml).
// Para cada pessoa com veículos: preventivas vencidas ou dentro da antecedência do aviso (por tempo, km ou horas) e
// leituras de km/horas com mais de 3 meses (ou perto disso). As contas são as mesmas da tela (area/veiculos-regras.js).
// Um e-mail por pessoa, só quando há aviso novo; o que está vencido volta uma vez por semana até ser resolvido.
// Os avisos enviados ficam em veiculos_avisos. O envio é pelo Gmail (SMTP com senha de app), como os avisos de ART.
//
// Teste local, sem banco e sem envio:  node ferramentas/alertas-veiculos.mjs --teste

import { quadroVeiculo, alertasVeiculos, dataBR, hojeISO, somarDias, kmBR, horasBR, usaKm, usaHoras } from "../area/veiculos-regras.js";

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: CHAVE, GMAIL_USUARIO, GMAIL_SENHA_APP, ALERTA_LINK } = process.env;
const TESTE = process.argv.includes("--teste");
const hoje = hojeISO();
const SITE = (ALERTA_LINK || "https://mvzanette.github.io/area-restrita.html").replace(/area\/.*$|area-restrita\.html.*$/, "").replace(/\/?$/, "/");
const PAGINA = SITE + "area/veiculos.html";

async function rest(caminho, opcoes = {}) {
  const resposta = await fetch(`${SUPABASE_URL}/rest/v1/${caminho}`, {
    ...opcoes,
    headers: {
      apikey: CHAVE,
      ...(CHAVE.startsWith("sb_") ? {} : { Authorization: `Bearer ${CHAVE}` }),
      "Content-Type": "application/json",
      ...(opcoes.headers || {}),
    },
  });
  if (!resposta.ok) throw new Error(`Supabase ${resposta.status}: ${await resposta.text()}`);
  return resposta.status === 204 ? null : resposta.json();
}

const escapar = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// Avisos de cada pessoa: { perfil_id: { alertas, novos, quadros } } (novos = chaves ainda não enviadas)
export function avisosPorPessoa({ veiculos, marcadores, planos, servicos, enviados = new Set(), dia = hoje }) {
  const porPessoa = new Map();
  for (const v of veiculos.filter((x) => x.ativo !== false)) {
    if (!porPessoa.has(v.perfil_id)) porPessoa.set(v.perfil_id, []);
    porPessoa.get(v.perfil_id).push(quadroVeiculo(v, { marcadores, planos, servicos, hoje: dia }));
  }
  const r = new Map();
  for (const [perfilId, quadros] of porPessoa) {
    const alertas = alertasVeiculos(quadros, dia);
    const novos = alertas.filter((a) => !enviados.has(a.chave));
    if (novos.length) r.set(perfilId, { alertas, novos, quadros });
  }
  return r;
}

export function montarEmail(nome, { alertas, novos, quadros }) {
  const venc = alertas.filter((a) => a.gravidade === "vencida");
  const prox = alertas.filter((a) => a.gravidade !== "vencida");
  const novo = new Set(novos.map((a) => a.chave));
  const assunto = venc.length
    ? `Veículos: ${venc.length} ${venc.length === 1 ? "aviso vencido" : "avisos vencidos"}${prox.length ? ` e ${prox.length} ${prox.length === 1 ? "próximo" : "próximos"}` : ""}`
    : `Veículos: ${prox.length} ${prox.length === 1 ? "manutenção ou leitura próxima" : "manutenções ou leituras próximas"}`;
  const leitura = (q) => (q.atual ? `${[usaKm(q.veiculo) && q.atual.km != null ? kmBR(q.atual.km) : "", usaHoras(q.veiculo) && q.atual.horas != null ? horasBR(q.atual.horas) : ""].filter(Boolean).join(" · ")} em ${dataBR(q.atual.data)}` : "sem leitura");
  const linhaTexto = (a) => `- ${novo.has(a.chave) ? "[NOVO] " : ""}${a.titulo}. ${a.texto}`;
  const texto = [
    `Olá, ${nome}.`,
    "",
    ...(venc.length ? ["VENCIDOS", ...venc.map(linhaTexto), ""] : []),
    ...(prox.length ? ["PRÓXIMOS", ...prox.map(linhaTexto), ""] : []),
    "Leitura atual de cada veículo:",
    ...quadros.map((q) => `- ${q.veiculo.nome}: ${leitura(q)}`),
    "",
    "Lembre: a quilometragem e as horas precisam ser lançadas pelo menos a cada 3 meses.",
    `Lançar leitura ou registrar o serviço: ${PAGINA}`,
  ].join("\n");
  const item = (a) => `<li style="margin:0 0 10px"><b>${escapar(a.titulo)}</b>${novo.has(a.chave) ? ' <span style="background:#f5b800;color:#111;padding:1px 6px;font-size:11px;font-weight:bold">NOVO</span>' : ""}<br><span style="color:#59616a">${escapar(a.texto)}</span></li>`;
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#1e2125;max-width:640px">
  <div style="background:#16181b;color:#fff;padding:16px 20px;border-bottom:4px solid #f5b800"><b>Veículos pessoais</b> · avisos de manutenção</div>
  <div style="padding:20px">
    <p>Olá, ${escapar(nome)}.</p>
    ${venc.length ? `<h3 style="color:#c62828;margin:18px 0 8px">Vencidos</h3><ul style="padding-left:18px">${venc.map(item).join("")}</ul>` : ""}
    ${prox.length ? `<h3 style="color:#8a6400;margin:18px 0 8px">Próximos</h3><ul style="padding-left:18px">${prox.map(item).join("")}</ul>` : ""}
    <h3 style="margin:18px 0 8px">Leitura atual</h3>
    <ul style="padding-left:18px">${quadros.map((q) => `<li>${escapar(q.veiculo.nome)}: ${escapar(leitura(q))}</li>`).join("")}</ul>
    <p style="color:#59616a;font-size:13px">A quilometragem e as horas precisam ser lançadas pelo menos a cada 3 meses.</p>
    <p><a href="${PAGINA}" style="display:inline-block;background:#f5b800;color:#111214;padding:10px 18px;text-decoration:none;font-weight:bold">Abrir Veículos pessoais</a></p>
  </div></div>`;
  return { assunto, texto, html };
}

async function principal() {
  if (TESTE) {
    const v = { id: "v1", perfil_id: "p1", nome: "Carro de teste", medidor: "km", ativo: true };
    const t = { id: "v2", perfil_id: "p1", nome: "Trator de teste", medidor: "horas", ativo: true };
    const dados = {
      veiculos: [v, t],
      marcadores: [{ veiculo_id: "v1", data: somarDias(hoje, -200), km: 30000 }, { veiculo_id: "v1", data: somarDias(hoje, -20), km: 39500 },
        { veiculo_id: "v2", data: somarDias(hoje, -100), horas: 1200 }],
      planos: [{ id: "a", veiculo_id: "v1", nome: "Troca de óleo", intervalo_km: 10000, intervalo_meses: 12, ultima_data: somarDias(hoje, -200), ultima_km: 30000 },
        { id: "b", veiculo_id: "v2", nome: "Óleo do motor", intervalo_horas: 250, ultima_horas: 1000 }],
      servicos: [],
    };
    for (const [, x] of avisosPorPessoa(dados)) {
      const m = montarEmail("Teste", x);
      console.log(`Assunto: ${m.assunto}\n\n${m.texto}\n---\nChaves: ${x.novos.map((a) => a.chave).join(" | ")}`);
    }
    return;
  }
  if (!SUPABASE_URL || !CHAVE) {
    console.log("Sem SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY nos secrets do GitHub: nada a fazer.");
    return;
  }
  if (!GMAIL_USUARIO || !GMAIL_SENHA_APP) {
    console.log("Sem GMAIL_USUARIO e GMAIL_SENHA_APP nos secrets do GitHub: os avisos dos veículos não são enviados.");
    return;
  }
  const [veiculos, marcadores, planos, servicos, avisos, perfis] = await Promise.all([
    rest("veiculos?select=*&ativo=is.true"),
    rest("veiculos_marcadores?select=veiculo_id,data,km,horas,id"),
    rest("veiculos_planos?select=*&ativo=is.true"),
    rest("veiculos_servicos?select=id,veiculo_id,data,km,horas,planos"),
    rest("veiculos_avisos?select=chave"),
    rest("perfis?select=id,email,nome,situacao&situacao=eq.ativo"),
  ]);
  const enviados = new Set(avisos.map((a) => a.chave));
  const lista = avisosPorPessoa({ veiculos, marcadores, planos, servicos, enviados });
  console.log(`${lista.size} pessoa(s) com aviso novo dos veículos hoje (${dataBR(hoje)}).`);
  if (!lista.size) return;

  const { default: nodemailer } = await import("nodemailer");
  const correio = nodemailer.createTransport({ service: "gmail", auth: { user: GMAIL_USUARIO, pass: GMAIL_SENHA_APP } });
  let falhas = 0;
  for (const [perfilId, x] of lista) {
    const p = perfis.find((y) => y.id === perfilId);
    if (!p || !p.email) continue;
    const m = montarEmail((p.nome || p.email).split(" ")[0], x);
    try {
      await correio.sendMail({ from: `"Veículos pessoais" <${GMAIL_USUARIO}>`, to: p.email, replyTo: GMAIL_USUARIO, subject: m.assunto, text: m.texto, html: m.html });
      await rest("veiculos_avisos?on_conflict=chave", {
        method: "POST",
        headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
        body: JSON.stringify(x.alertas.map((a) => ({ chave: a.chave, perfil_id: perfilId }))),
      });
      console.log(`Enviado para ${p.email}: ${x.alertas.length} aviso(s), ${x.novos.length} novo(s).`);
    } catch (err) {
      falhas += 1;
      console.error(`Falhou (${p.email}): ${err.message}`);
    }
  }
  if (falhas) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) principal().catch((err) => {
  console.error(err);
  process.exit(1);
});
