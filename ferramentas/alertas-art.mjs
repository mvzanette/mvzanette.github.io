// Rotina diária de alertas da área restrita (executada pelo GitHub Actions).
// Lê as ARTs sem baixa no Supabase, identifica os alertas do dia (30 dias, 7 dias, no dia e
// semanalmente após o vencimento), junta os lembretes de prazos das demandas e de recebimentos
// em atraso, envia um e-mail-resumo pelo Resend e registra o envio dos alertas de ART.
//
// Teste local, sem banco e sem envio:  node ferramentas/alertas-art.mjs --teste

import { alertasPendentes, dataBR } from "../area/regras.js";
import { lembretesDemandas, lembretesRecebimentos } from "../area/regras-gestao.js";

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: CHAVE, RESEND_API_KEY, ALERTA_EMAIL, ALERTA_REMETENTE, ALERTA_LINK } = process.env;
const TESTE = process.argv.includes("--teste");

// Data de hoje no horário de Brasília (o servidor do GitHub usa UTC)
const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

async function rest(caminho, opcoes = {}) {
  const resposta = await fetch(`${SUPABASE_URL}/rest/v1/${caminho}`, {
    ...opcoes,
    headers: {
      apikey: CHAVE,
      // A chave nova (sb_secret_…) vai só no apikey; a antiga (service_role, JWT) também no Authorization
      ...(CHAVE.startsWith("sb_") ? {} : { Authorization: `Bearer ${CHAVE}` }),
      "Content-Type": "application/json",
      ...(opcoes.headers || {}),
    },
  });
  if (!resposta.ok) throw new Error(`Supabase ${resposta.status}: ${await resposta.text()}`);
  return resposta.status === 204 || resposta.status === 201 ? null : resposta.json();
}

function exemplo() {
  const somar = (dias) => new Date(Date.parse(hoje) + dias * 86400000).toISOString().slice(0, 10);
  return [
    { id: "1", numero: "MG0000000001", contratante: "CLIENTE EXEMPLO A", fim: somar(30) },
    { id: "2", numero: "RJ0000000002", contratante: "CLIENTE EXEMPLO B", fim: somar(7) },
    { id: "3", numero: "MG0000000003", contratante: "CLIENTE EXEMPLO C", fim: somar(-10) },
    { id: "4", numero: "MG0000000004", contratante: "CLIENTE EXEMPLO D", fim: somar(120) },
  ];
}

const escapar = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function exemploGestao() {
  const somar = (dias) => new Date(Date.parse(hoje) + dias * 86400000).toISOString().slice(0, 10);
  return {
    demandas: [
      { titulo: "Laudo NR-12 de 2 escavadeiras", cliente: "CLIENTE EXEMPLO E", etapa: "proposta", prazo: somar(1) },
      { titulo: "PMOC de escritório", cliente: "CLIENTE EXEMPLO F", etapa: "execucao", prazo: somar(-7) },
    ],
    lancamentos: [{ tipo: "receita", descricao: "Laudo NR-12", cliente: "CLIENTE EXEMPLO G", valor: 1800, vencimento: somar(-14) }],
  };
}

// Seções do e-mail: [título, itens, orientação]
function montarEmail(secoes) {
  const total = secoes.reduce((t, [, itens]) => t + itens.length, 0);
  const assunto = `Área restrita: ${total} aviso${total > 1 ? "s" : ""} – ${dataBR(hoje)}`;
  const texto = [
    `Avisos de ${dataBR(hoje)}`,
    ...secoes.flatMap(([titulo, itens, orientacao]) => ["", `${titulo}:`, ...itens.map((i) => `• ${i.mensagem}`), ...(orientacao ? [orientacao] : [])]),
    ALERTA_LINK ? `Área restrita: ${ALERTA_LINK}` : "",
  ].join("\n");
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#1e2125">
    ${secoes
      .map(
        ([titulo, itens, orientacao]) => `<p style="border-left:4px solid #f5b800;padding-left:10px"><b>${escapar(titulo)}</b></p>
    <ul>${itens.map((i) => `<li style="margin-bottom:8px">${escapar(i.mensagem)}</li>`).join("")}</ul>
    ${orientacao ? `<p>${escapar(orientacao)}</p>` : ""}`
      )
      .join("")}
    ${ALERTA_LINK ? `<p><a href="${escapar(ALERTA_LINK)}">Abrir a área restrita</a></p>` : ""}
  </div>`;
  return { assunto, texto, html };
}

// Tabelas do financeiro e das demandas: se ainda não existirem no banco, a rotina segue só com as ARTs
async function lerOpcional(caminho) {
  try {
    return await rest(caminho);
  } catch (erro) {
    console.log(`Aviso: não foi possível ler ${caminho.split("?")[0]} (${erro.message.slice(0, 80)}).`);
    return [];
  }
}

async function enviarEmail({ assunto, texto, html }) {
  const resposta = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: ALERTA_REMETENTE || "Área restrita <onboarding@resend.dev>",
      to: ALERTA_EMAIL.split(",").map((e) => e.trim()),
      subject: assunto,
      text: texto,
      html,
    }),
  });
  if (!resposta.ok) throw new Error(`Resend ${resposta.status}: ${await resposta.text()}`);
}

async function principal() {
  if (!TESTE && (!SUPABASE_URL || !CHAVE)) {
    console.log("Supabase ainda não configurado (secrets SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY). Nada a fazer.");
    return;
  }

  const arts = TESTE ? exemplo() : await rest("arts?select=*&baixa_data=is.null");
  const tratados = TESTE
    ? new Set()
    : new Set(
        (await rest("alertas?select=art_id,marco&or=(email_enviado_em.not.is.null,lido_em.not.is.null)")).map(
          (a) => `${a.art_id}:${a.marco}`
        )
      );

  const alertas = alertasPendentes(arts, tratados, hoje);
  const gestao = TESTE
    ? exemploGestao()
    : {
        demandas: await lerOpcional("demandas?select=*&etapa=in.(recebida,proposta,aprovada,execucao)&prazo=not.is.null"),
        lancamentos: await lerOpcional("lancamentos?select=*&tipo=eq.receita&pago_em=is.null&vencimento=not.is.null"),
      };
  const demandas = lembretesDemandas(gestao.demandas, hoje);
  const recebimentos = lembretesRecebimentos(gestao.lancamentos, hoje);
  console.log(
    `${dataBR(hoje)}: ${arts.length} ART(s) sem baixa, ${alertas.length} alerta(s) novo(s), ` +
      `${demandas.length} prazo(s) de demanda e ${recebimentos.length} recebimento(s) a cobrar.`
  );
  const secoes = [
    ["Alertas de ART", alertas, "Verifique se é preciso dar baixa ou emitir nova ART."],
    ["Prazos das demandas", demandas, ""],
    ["Recebimentos a cobrar", recebimentos, ""],
  ].filter(([, itens]) => itens.length);
  if (!secoes.length) return;

  const email = montarEmail(secoes);
  if (TESTE) {
    console.log(`\nAssunto: ${email.assunto}\n\n${email.texto}`);
    return;
  }

  if (RESEND_API_KEY && ALERTA_EMAIL) {
    await enviarEmail(email);
    console.log(`E-mail enviado para ${ALERTA_EMAIL}.`);
  } else {
    console.log("Resend não configurado (RESEND_API_KEY e ALERTA_EMAIL): alertas registrados sem e-mail.");
  }

  if (!alertas.length) return;
  const agora = new Date().toISOString();
  await rest("alertas?on_conflict=art_id,marco", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(
      alertas.map((a) => ({
        user_id: a.art.user_id,
        art_id: a.art.id,
        marco: a.marco,
        mensagem: a.mensagem,
        email_enviado_em: RESEND_API_KEY && ALERTA_EMAIL ? agora : null,
      }))
    ),
  });
}

principal().catch((erro) => {
  console.error(erro.message);
  process.exit(1);
});
