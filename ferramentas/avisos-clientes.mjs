// Aviso de vencimento de ART para o cliente (executado todo dia pelo GitHub Actions, .github/workflows/avisos-clientes.yml).
// Para cada ART acompanhada por um cliente com o aviso ligado (Controle de ART → Acompanhamento pelo cliente), quando faltam
// aviso_dias dias ou menos para o fim previsto, manda UM e-mail para os e-mails do aviso (ou, sem eles, os do cliente na
// base), com cópia para o engenheiro, e guarda a data do envio (aviso_enviado_em). Se o fim previsto mudar, o banco
// zera a data e o aviso volta a valer. ARTs baixadas ou arquivadas não geram aviso.
// O envio é pelo Gmail (SMTP com senha de app), o mesmo usado nos convites do Supabase.
//
// Teste local, sem banco e sem envio:  node ferramentas/avisos-clientes.mjs --teste

import { dataBR, diasAte } from "../area/regras.js";

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: CHAVE, GMAIL_USUARIO, GMAIL_SENHA_APP, ALERTA_LINK } = process.env;
const TESTE = process.argv.includes("--teste");
const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const SITE = (ALERTA_LINK || "https://mvzanette.github.io/area-restrita.html").replace(/area\/.*$|area-restrita\.html.*$/, "").replace(/\/?$/, "/");
const PORTAL = SITE + "area/arquivos.html";
const WHATSAPP = "5532998111414";

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
const valido = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

// ARTs que pedem o aviso hoje
export function avisosDoDia(arts, dia = hoje) {
  return arts
    .filter((a) => a.acompanhada && a.aviso_cliente && !a.baixa_data && a.acao !== "arquivada" && a.fim && !a.aviso_enviado_em)
    .map((a) => ({ art: a, dias: diasAte(a.fim, dia), para: ((a.aviso_emails || []).length ? a.aviso_emails : (a.clientes && a.clientes.emails) || []).filter(valido) }))
    .filter((x) => x.dias >= 0 && x.dias <= (x.art.aviso_dias || 30) && x.para.length);
}

export function montarAviso({ art, dias }) {
  const cliente = (art.clientes && art.clientes.nome) || art.contratante || "cliente";
  const quando = dias === 0 ? "vence hoje" : `vencerá em ${dias} ${dias === 1 ? "dia" : "dias"}`;
  const servico = [art.local, art.observacao].filter(Boolean).join(" – ").slice(0, 240);
  const assunto = `Aviso: a ART nº ${art.numero} ${dias === 0 ? "vence hoje" : `vence em ${dataBR(art.fim)}`}`;
  const texto = [
    `Olá, ${cliente}.`,
    "",
    `A ART nº ${art.numero} (CREA-${art.crea || "MG"})${servico ? `, referente a ${servico},` : ""} ${quando}: o fim previsto é ${dataBR(art.fim)}.`,
    "",
    "Se o serviço continua depois dessa data, é preciso emitir uma nova ART (ou a substituta) antes do vencimento, para a atividade continuar com responsável técnico registrado.",
    `Para providenciar, responda este e-mail ou chame no WhatsApp: https://wa.me/${WHATSAPP}`,
    "",
    `Você acompanha esta e as outras ARTs da sua empresa em: ${PORTAL}`,
    "",
    "Marcos Zanette – Engenheiro Mecânico",
    "CREA/RNP 1420122860",
  ].join("\n");
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#1e2125;max-width:600px">
  <div style="background:#16181b;color:#fff;padding:16px 20px;border-bottom:4px solid #f5b800"><b>Marcos Zanette</b> · Engenharia Mecânica</div>
  <div style="padding:20px">
    <p>Olá, ${escapar(cliente)}.</p>
    <p>A <b>ART nº ${escapar(art.numero)}</b> (CREA-${escapar(art.crea || "MG")})${servico ? `, referente a ${escapar(servico)},` : ""} <b>${quando}</b>: o fim previsto é <b>${dataBR(art.fim)}</b>.</p>
    <p>Se o serviço continua depois dessa data, é preciso emitir uma nova ART (ou a substituta) antes do vencimento, para a atividade continuar com responsável técnico registrado.</p>
    <p>Para providenciar, responda este e-mail ou <a href="https://wa.me/${WHATSAPP}">chame no WhatsApp</a>.</p>
    <p><a href="${PORTAL}" style="display:inline-block;background:#f5b800;color:#111214;padding:10px 18px;text-decoration:none;font-weight:bold">Ver minhas ARTs</a></p>
    <p style="color:#59616a;font-size:13px">Marcos Zanette – Engenheiro Mecânico · CREA/RNP 1420122860</p>
  </div></div>`;
  return { assunto, texto, html };
}

async function principal() {
  if (TESTE) {
    const somar = (n) => new Date(Date.parse(hoje) + n * 86400000).toISOString().slice(0, 10);
    const exemplo = [
      { id: "1", numero: "MG0000000001", crea: "MG", local: "Pátio da obra", fim: somar(30), acompanhada: true, aviso_cliente: true, aviso_dias: 30, aviso_emails: [], clientes: { nome: "CLIENTE EXEMPLO", emails: ["compras@exemplo.com.br"] } },
      { id: "2", numero: "MG0000000002", crea: "MG", fim: somar(45), acompanhada: true, aviso_cliente: true, aviso_dias: 30, aviso_emails: ["a@exemplo.com"] },
      { id: "3", numero: "MG0000000003", crea: "MG", fim: somar(10), acompanhada: true, aviso_cliente: true, aviso_dias: 30, aviso_emails: [], aviso_enviado_em: "2026-01-01" },
    ];
    for (const a of avisosDoDia(exemplo)) {
      const m = montarAviso(a);
      console.log(`Para: ${a.para.join(", ")}\nAssunto: ${m.assunto}\n\n${m.texto}\n---`);
    }
    return;
  }
  if (!SUPABASE_URL || !CHAVE) {
    console.log("Sem SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY nos secrets do GitHub: nada a fazer.");
    return;
  }
  if (!GMAIL_USUARIO || !GMAIL_SENHA_APP) {
    console.log("Sem GMAIL_USUARIO e GMAIL_SENHA_APP nos secrets do GitHub: os avisos aos clientes não são enviados.");
    return;
  }
  const arts = await rest("arts?select=*,clientes(nome,emails)&acompanhada=is.true&aviso_cliente=is.true&baixa_data=is.null&aviso_enviado_em=is.null");
  const avisos = avisosDoDia(arts);
  console.log(`${avisos.length} aviso(s) de vencimento para clientes hoje (${dataBR(hoje)}).`);
  if (!avisos.length) return;

  const { default: nodemailer } = await import("nodemailer");
  const correio = nodemailer.createTransport({ service: "gmail", auth: { user: GMAIL_USUARIO, pass: GMAIL_SENHA_APP } });
  let falhas = 0;
  for (const a of avisos) {
    const m = montarAviso(a);
    try {
      await correio.sendMail({
        from: `"Marcos Zanette – Engenharia Mecânica" <${GMAIL_USUARIO}>`,
        to: a.para.join(", "),
        bcc: GMAIL_USUARIO,
        replyTo: GMAIL_USUARIO,
        subject: m.assunto,
        text: m.texto,
        html: m.html,
      });
      await rest(`arts?id=eq.${encodeURIComponent(a.art.id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ aviso_enviado_em: new Date().toISOString() }),
      });
      console.log(`Enviado: ART ${a.art.numero} → ${a.para.join(", ")}`);
    } catch (err) {
      falhas += 1;
      console.error(`Falhou: ART ${a.art.numero}: ${err.message}`);
    }
  }
  if (falhas) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) principal().catch((err) => {
  console.error(err);
  process.exit(1);
});
