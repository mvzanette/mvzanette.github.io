// Área restrita – Ações e dividendos: as principais ações da B3 com os indicadores do mercado, os proventos com as
// datas, a nota de confiabilidade (histórico) e a lista de cada pessoa, com alvos de compra e venda e alerta por
// e-mail. Os dados de mercado vêm da rotina diária (ferramentas/acoes-atualizar.mjs); as contas, de regras-acoes.js.
// Informativo: nada aqui é recomendação de investimento.
import { abrirPagina } from "./sessao.js";
import * as R from "./regras-acoes.js";
import { ACOES_EXEMPLO } from "./acoes-exemplo.js";
import { $, $$, esc, moeda, avisar, numeroDigitado, prepararDialogos } from "./ui.js";

const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
let armazem, perfil;
let mercado = []; // ações com dados de mercado (formato de R.deLinha)
let minhas = []; // acompanhamentos desta pessoa
const filtro = { busca: "", setor: "", ordem: "nota", soTeto: false };
const calc = new Map(); // ticker -> { ind, conf, zona } (contas feitas uma vez por carga)

// ---------------------------------------------------------------- formatos
const nf = (v, casas = 2) => (v == null || !Number.isFinite(v) ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas }));
const pct = (v, casas = 1) => (v == null || !Number.isFinite(v) ? "—" : `${nf(v * 100, casas)}%`);
const sinal = (v) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${nf(v * 100, 2)}%`);
const dataBR = (iso) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
const bilhoes = (v) => (v == null ? "—" : v >= 1e9 ? `R$ ${nf(v / 1e9, 1)} bi` : `R$ ${nf(v / 1e6, 0)} mi`);
const cls = (v, bom, ruim, maiorMelhor = true) => (v == null ? "" : (maiorMelhor ? v >= bom : v <= bom) ? "ac-bom" : (maiorMelhor ? v < ruim : v > ruim) ? "ac-ruim" : "");
const SETORES = {
  "Financial Services": "Financeiro", Utilities: "Energia e saneamento", Energy: "Petróleo e gás", "Basic Materials": "Materiais básicos",
  Industrials: "Indústria", "Consumer Cyclical": "Consumo cíclico", "Consumer Defensive": "Consumo não cíclico", Healthcare: "Saúde",
  "Communication Services": "Telecomunicações", Technology: "Tecnologia", "Real Estate": "Imóveis",
};
const setorBR = (s) => SETORES[s] || s || "Sem setor";

// ---------------------------------------------------------------- carga
async function carregar() {
  const [linhas, acomp] = await Promise.all([
    armazem.colecao("acoes_mercado").listar().catch(() => null),
    armazem.colecao("acoes_acompanhamento").listar().catch(() => null),
  ]);
  if (linhas === null || acomp === null) {
    $("#ac-atualizado").innerHTML = '<b>O banco de dados precisa ser atualizado:</b> rode de novo o arquivo supabase/schema.sql no SQL Editor do Supabase.';
  }
  const deMercado = linhas && linhas.length ? linhas : armazem.modo === "demo" ? ACOES_EXEMPLO : [];
  mercado = deMercado.map(R.deLinha);
  minhas = (acomp || []).filter((a) => a.perfil_id === perfil.id);
  calc.clear();
  for (const a of mercado) calc.set(a.ticker, { ind: R.indicadores(a, hoje), conf: R.confiabilidade(a, hoje), zona: R.zonaReferencia(a, hoje) });
  renderizar();
}

function renderizar() {
  renderCabecalho();
  renderMinhas();
  renderTodas();
  renderProventos();
}

function renderCabecalho() {
  if (!mercado.length) {
    if (!$("#ac-atualizado").innerHTML) $("#ac-atualizado").innerHTML = "Os dados das ações ainda não chegaram: a rotina diária roda de segunda a sexta às 18h30 (Brasília). Para buscar agora, abra no GitHub <b>Actions → Ações e dividendos → Run workflow</b>.";
    $("#ac-resumo").innerHTML = "";
    return;
  }
  const ultima = mercado.map((a) => a.atualizado_em || "").sort().pop();
  const exemplo = mercado.some((a) => (a.fontes || []).some((f) => /exemplo/i.test(f)));
  const fontes = [...new Set(mercado.flatMap((a) => a.fontes))].join(" e ");
  if (!$("#ac-atualizado").innerHTML.includes("banco de dados"))
    $("#ac-atualizado").innerHTML = `${exemplo ? "<b>Dados fictícios de exemplo</b> (modo demonstração). " : ""}Atualizado em ${ultima ? new Date(ultima).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—"} · fonte: ${esc(fontes)} · <b>informativo, não é recomendação de compra ou venda.</b>`;
  const lista = [...calc.values()];
  const abaixo = lista.filter((c) => c.zona.zona === "abaixo").length;
  const altas = lista.filter((c) => c.conf.nivel === "alta").length;
  const naCompra = minhas.filter((m) => R.situacaoAlvo(precoDe(m.ticker), m).tipo === "compra").length;
  const naVenda = minhas.filter((m) => R.situacaoAlvo(precoDe(m.ticker), m).tipo === "venda").length;
  const kpi = (rotulo, valor, detalhe) => `<div class="kpi"><span class="kpi-rotulo">${rotulo}</span><strong class="kpi-valor">${valor}</strong><span class="kpi-detalhe">${detalhe}</span></div>`;
  $("#ac-resumo").innerHTML = [
    kpi("Ações acompanhadas", mercado.length, "as principais da B3 e as da sua lista"),
    kpi("Confiabilidade alta", altas, "nota 75 ou mais"),
    kpi("Abaixo do preço-teto", abaixo, "proventos médios rendem 6% ou mais"),
    kpi("Na sua zona de compra", naCompra, naVenda ? `e ${naVenda} na zona de venda` : "pelos seus alvos"),
  ].join("");
}

const precoDe = (t) => (mercado.find((a) => a.ticker === t) || {}).preco ?? null;
const etiquetaZona = (z) => `<span class="etiqueta ac-z-${z.zona}">${esc(z.texto)}</span>`;
const etiquetaAlvo = (s) => `<span class="etiqueta ac-a-${s.tipo}">${esc(s.texto)}</span>`;
const notaHtml = (c) => (c.nota == null ? "—" : `<span class="ac-nota ac-n-${c.nivel.normalize("NFD").replace(/[̀-ͯ]/g, "")}" title="Confiabilidade ${c.nivel}">${c.nota}</span>`);

function renderMinhas() {
  const corpo = $("#ac-minhas tbody");
  $("#ac-minhas-vazio").hidden = minhas.length > 0;
  corpo.innerHTML = [...minhas]
    .sort((a, b) => a.ticker.localeCompare(b.ticker))
    .map((m) => {
      const a = mercado.find((x) => x.ticker === m.ticker);
      const preco = a ? a.preco : null;
      const s = R.situacaoAlvo(preco, m);
      const pos = m.quantidade > 0 && m.preco_medio > 0 && preco ? `${moeda(m.quantidade * preco)}<br><small class="${preco >= m.preco_medio ? "ac-bom" : "ac-ruim"}">${sinal(preco / m.preco_medio - 1)}</small>` : "—";
      return `<tr class="clicavel" data-ticker="${esc(m.ticker)}">
        <td><b>${esc(m.ticker)}</b><br><small>${esc(a ? a.nome : "aguardando a próxima atualização")}</small></td>
        <td class="num">${moeda(preco)}</td>
        <td class="num ${a && a.variacao >= 0 ? "ac-bom" : "ac-ruim"}">${a ? sinal(a.variacao) : "—"}</td>
        <td class="num">${moeda(m.preco_compra)}</td>
        <td class="num">${moeda(m.preco_venda)}</td>
        <td>${etiquetaAlvo(s)}</td>
        <td class="num">${pos}</td>
        <td>${m.alertar ? "Ligado" : "Desligado"}</td>
      </tr>`;
    })
    .join("");
}

function valorOrdem(a, ordem) {
  const c = calc.get(a.ticker);
  if (ordem === "nota") return c.conf.nota;
  if (ordem === "margemTeto") return c.zona.teto && a.preco ? c.zona.teto / a.preco : null;
  if (ordem === "variacao") return a.variacao;
  return c.ind[ordem];
}

function renderTodas() {
  const setores = [...new Set(mercado.map((a) => a.setor || ""))].sort((a, b) => setorBR(a).localeCompare(setorBR(b)));
  const sel = $("#ac-setor");
  sel.innerHTML = `<option value="">Todos os setores</option>${setores.map((s) => `<option value="${esc(s)}"${s === filtro.setor ? " selected" : ""}>${esc(setorBR(s))}</option>`).join("")}`;
  const busca = filtro.busca.trim().toLowerCase();
  const menorMelhor = ["pl", "pvp"].includes(filtro.ordem);
  const lista = mercado
    .filter((a) => !busca || a.ticker.toLowerCase().includes(busca) || (a.nome || "").toLowerCase().includes(busca))
    .filter((a) => !filtro.setor || (a.setor || "") === filtro.setor)
    .filter((a) => !filtro.soTeto || calc.get(a.ticker).zona.zona === "abaixo")
    .sort((a, b) => {
      if (filtro.ordem === "ticker") return a.ticker.localeCompare(b.ticker);
      let va = valorOrdem(a, filtro.ordem), vb = valorOrdem(b, filtro.ordem);
      // P/L e P/VP: menor primeiro, mas negativos (prejuízo) vão para o fim
      if (menorMelhor) { va = va > 0 ? va : null; vb = vb > 0 ? vb : null; }
      if (va == null && vb == null) return a.ticker.localeCompare(b.ticker);
      if (va == null) return 1;
      if (vb == null) return -1;
      return menorMelhor ? va - vb : vb - va;
    });
  const vazio = $("#ac-todas-vazio");
  vazio.hidden = lista.length > 0;
  vazio.textContent = mercado.length ? "Nenhuma ação com esses filtros." : "Sem dados de mercado ainda.";
  $("#ac-todas tbody").innerHTML = lista
    .map((a) => {
      const { ind: i, conf, zona } = calc.get(a.ticker);
      const minha = minhas.some((m) => m.ticker === a.ticker);
      return `<tr class="clicavel" data-ticker="${esc(a.ticker)}">
        <td><b>${esc(a.ticker)}</b>${minha ? ' <span class="ac-marca" title="Na sua lista">★</span>' : ""}<br><small>${esc(a.nome)}</small></td>
        <td class="num">${moeda(a.preco)}</td>
        <td class="num ${a.variacao >= 0 ? "ac-bom" : "ac-ruim"}">${sinal(a.variacao)}</td>
        <td class="num ${cls(i.dy12m, 0.06, 0.03)}">${pct(i.dy12m)}</td>
        <td class="num ${cls(i.dy5a, 0.06, 0.03)}">${pct(i.dy5a)}</td>
        <td class="num ${i.pl != null && i.pl <= 0 ? "ac-ruim" : cls(i.pl, 15, 25, false)}">${nf(i.pl, 1)}</td>
        <td class="num ${cls(i.pvp, 1.5, 3, false)}">${nf(i.pvp, 2)}</td>
        <td class="num ${cls(i.roe, 0.15, 0.08)}">${pct(i.roe, 0)}</td>
        <td class="num ${cls(i.divEbitda, 2, 3.5, false)}">${R.ehFinanceira(a) ? '<small title="Não se aplica a bancos e seguradoras">n/a</small>' : nf(i.divEbitda, 1)}</td>
        <td class="num">${notaHtml(conf)}</td>
        <td class="num">${moeda(zona.teto)}</td>
        <td>${etiquetaZona(zona)}</td>
      </tr>`;
    })
    .join("");
}

function renderProventos() {
  const inicio = new Date(Date.parse(hoje) - 60 * 86400000).toISOString().slice(0, 10);
  const lista = mercado
    .flatMap((a) => a.proventos.map((p) => ({ ...p, ticker: a.ticker, preco: a.preco, direito: R.dataDoDireito(p) })))
    .filter((p) => p.direito && p.direito >= inicio)
    .sort((a, b) => b.direito.localeCompare(a.direito) || a.ticker.localeCompare(b.ticker));
  $("#ac-proventos-vazio").hidden = lista.length > 0;
  $("#ac-proventos tbody").innerHTML = lista
    .map((p) => `<tr class="clicavel" data-ticker="${esc(p.ticker)}">
      <td><b>${esc(p.ticker)}</b></td>
      <td>${dataBR(p.direito)}${p.direito > hoje ? ' <span class="etiqueta ac-a-compra">a vir</span>' : ""}${p.data_com ? "" : ' <small title="Estimada: dia útil antes da data ex">(est.)</small>'}</td>
      <td>${p.pagamento ? dataBR(p.pagamento) : "—"}</td>
      <td>${esc(p.tipo || "Provento")}</td>
      <td class="num">R$ ${nf(p.valor, 4)}</td>
      <td class="num">${p.preco ? pct(p.valor / p.preco, 2) : "—"}</td>
    </tr>`)
    .join("");
}

// ---------------------------------------------------------------- detalhe de uma ação
function grafico(a, alvo) {
  const pts = (a.historico && a.historico.semanal) || [];
  if (pts.length < 2) return '<p class="dica">Sem histórico de preços para o gráfico.</p>';
  const { zona } = calc.get(a.ticker);
  const linhas = [
    ["Preço-teto", zona.teto, "var(--ok)"],
    ["Preço justo (Graham)", zona.justo, "var(--c-8a6400)"],
    ["Sua compra", alvo && alvo.preco_compra, "var(--ok)"],
    ["Sua venda", alvo && alvo.preco_venda, "var(--erro)"],
  ].filter(([, v]) => v > 0);
  const valores = pts.map((p) => p[1]);
  const visiveis = linhas.map((l) => l[1]).filter((v) => v < Math.max(...valores) * 1.6 && v > Math.min(...valores) * 0.5);
  const min = Math.min(...valores, ...visiveis) * 0.97, max = Math.max(...valores, ...visiveis) * 1.03;
  const L = 640, A = 200, x = (i) => (i / (pts.length - 1)) * L, y = (v) => A - ((v - min) / (max - min)) * A;
  const caminho = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[1]).toFixed(1)}`).join("");
  const refs = linhas.filter(([, v]) => v >= min && v <= max).map(([nome, v, cor], k) =>
    `<line x1="0" x2="${L}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="${cor}" stroke-dasharray="${k > 1 ? "2 3" : "6 4"}" stroke-width="1.5"/>
     <text x="${L - 4}" y="${(y(v) - 4).toFixed(1)}" text-anchor="end" fill="${cor}" font-size="11">${esc(nome)} ${moeda(v)}</text>`).join("");
  return `<figure class="ac-grafico">
    <svg viewBox="0 0 ${L} ${A}" preserveAspectRatio="none" role="img" aria-label="Preço nos últimos 12 meses">
      ${refs}<path d="${caminho}" fill="none" stroke="var(--graphite-900)" stroke-width="2" vector-effect="non-scaling-stroke"/>
    </svg>
    <figcaption>Últimos 12 meses (preço semanal): de ${dataBR(pts[0][0])} a ${dataBR(pts[pts.length - 1][0])} · mínima ${moeda(a.historico.min52)} · máxima ${moeda(a.historico.max52)}</figcaption>
  </figure>`;
}

function barrasProventos(a) {
  const porAno = R.proventosPorAno(a.proventos);
  const ano = Number(hoje.slice(0, 4));
  const anos = Array.from({ length: 11 }, (_, k) => ano - 10 + k);
  const max = Math.max(...anos.map((x) => porAno[x] || 0));
  if (!(max > 0)) return '<p class="dica">Nenhum provento registrado nos últimos 10 anos.</p>';
  return `<div class="ac-barras" role="img" aria-label="Proventos por ano">${anos
    .map((x) => {
      const v = porAno[x] || 0;
      return `<div class="ac-barra${x === ano ? " parcial" : ""}" title="${x}: R$ ${nf(v, 4)} por ação${x === ano ? " (ano em curso)" : ""}">
        <span class="ac-barra-v">${v ? nf(v, 2) : "0"}</span><span class="ac-barra-c" style="height:${Math.max(2, (v / max) * 100)}%"></span><span class="ac-barra-a">${String(x).slice(2)}</span></div>`;
    })
    .join("")}</div><p class="dica">Soma por ano da data com, em R$ por ação (o último ano ainda está em curso).</p>`;
}

function indicador(nome, valor, classe, explica) {
  return `<div class="ac-ind ${classe}"><span class="kpi-rotulo">${nome}</span><b>${valor}</b><small>${explica}</small></div>`;
}

function abrirAcao(ticker) {
  const a = mercado.find((x) => x.ticker === ticker);
  if (!a) return abrirNovo(ticker);
  const { ind: i, conf, zona } = calc.get(ticker);
  const alvo = minhas.find((m) => m.ticker === ticker);
  const sug = R.alvosSugeridos(a, hoje);
  const h = a.historico || {};
  const dlg = $("#dlg-acao");
  const provs = [...a.proventos].sort((x, y) => (R.dataDoDireito(y) || "").localeCompare(R.dataDoDireito(x) || ""));
  dlg.innerHTML = `<form id="form-acao">
    <div class="dlg-cab">
      <h2>${esc(a.ticker)} · ${esc(a.nome)} <small class="ac-setor">${esc(setorBR(a.setor))}</small></h2>
      <button class="btn-link" data-fechar type="button">Fechar</button>
    </div>
    <div class="dlg-corpo">
      <div class="ac-topo">
        <div><span class="kpi-rotulo">Preço</span><b class="ac-preco">${moeda(a.preco)}</b> <span class="${a.variacao >= 0 ? "ac-bom" : "ac-ruim"}">${sinal(a.variacao)} no dia</span><br><small>fechamento de ${dataBR(a.data_preco)}</small></div>
        <div><span class="kpi-rotulo">Confiabilidade</span>${notaHtml(conf)} <small>${conf.nivel}${conf.cobertura < 0.8 ? ` · só ${Math.round(conf.cobertura * 100)}% dos critérios com dado` : ""}</small></div>
        <div><span class="kpi-rotulo">Preço de referência</span>${etiquetaZona(zona)}<br><small>teto ${moeda(zona.teto)} · justo ${moeda(zona.justo)}${zona.margem != null ? ` (${zona.margem >= 0 ? "margem de" : "acima em"} ${pct(Math.abs(zona.margem), 0)})` : ""}</small></div>
      </div>
      ${grafico(a, alvo)}

      <h3 class="ac-h3">Indicadores</h3>
      <div class="ac-inds">
        ${indicador("Dividend yield 12m", pct(i.dy12m), cls(i.dy12m, 0.06, 0.03), `R$ ${nf(i.proventos12m, 2)} por ação nos últimos 12 meses`)}
        ${indicador("Yield médio 5 anos", pct(i.dy5a), cls(i.dy5a, 0.06, 0.03), "média anual de 5 anos ÷ preço de hoje")}
        ${indicador("P/L", nf(i.pl, 1), i.pl != null && i.pl <= 0 ? "ac-ruim" : cls(i.pl, 15, 25, false), i.pl != null && i.pl <= 0 ? "prejuízo nos últimos 12 meses" : "anos de lucro para pagar o preço")}
        ${indicador("P/VP", nf(i.pvp, 2), cls(i.pvp, 1.5, 3, false), "preço ÷ patrimônio por ação")}
        ${indicador("ROE", pct(i.roe), cls(i.roe, 0.15, 0.08), "lucro ÷ patrimônio")}
        ${indicador("Margem líquida", pct(i.margem), cls(i.margem, 0.1, 0.03), "lucro ÷ receita")}
        ${R.ehFinanceira(a) ? "" : indicador("Dív. líquida/EBITDA", nf(i.divEbitda, 1), cls(i.divEbitda, 2, 3.5, false), "anos de geração de caixa para quitar a dívida")}
        ${R.ehFinanceira(a) ? "" : indicador("EV/EBITDA", nf(i.evEbitda, 1), cls(i.evEbitda, 6, 12, false), "valor da empresa ÷ geração de caixa")}
        ${indicador("Payout", pct(i.payout, 0), i.payout == null ? "" : i.payout >= 0.25 && i.payout <= 0.9 ? "ac-bom" : i.payout > 1 ? "ac-ruim" : "", "parte do lucro paga em proventos")}
        ${indicador("Crescimento do lucro", pct(i.cagrLucro), cls(i.cagrLucro, 0.05, 0), "média ao ano nos balanços disponíveis")}
        ${indicador("LPA · VPA", `${nf(i.lpa, 2)} · ${nf(i.vpa, 2)}`, "", "lucro e patrimônio por ação (R$)")}
        ${indicador("Valor de mercado", bilhoes(i.valorMercado), "", "preço × número de ações")}
        ${indicador("Liquidez diária", bilhoes(i.liquidez), cls(i.liquidez, 5e7, 5e6), "média negociada por dia (60 pregões)")}
        ${indicador("Média de 200 dias", moeda(h.mm200), h.mm200 && a.preco ? (a.preco >= h.mm200 ? "ac-bom" : "ac-ruim") : "", h.mm200 && a.preco ? `preço ${sinal(a.preco / h.mm200 - 1)} da média (tendência)` : "tendência de prazo mais longo")}
        ${indicador("Retorno 12 meses · 5 anos", `${sinal(h.ret12m)} · ${sinal(h.ret5a)}`, "", "só a variação do preço, sem os proventos")}
        ${indicador("Beta", nf(i.beta, 2), cls(i.beta, 0.8, 1.3, false), "oscilação diante do mercado (1 = igual)")}
      </div>

      <h3 class="ac-h3">Nota de confiabilidade: ${conf.nota ?? "—"}</h3>
      <div class="ac-partes">${conf.partes
        .map((p) => `<div class="ac-parte"><span>${esc(p.nome)}</span><span class="ac-trilho"><span style="width:${p.pontos == null ? 0 : (p.pontos / p.max) * 100}%"></span></span><b>${p.pontos == null ? "sem dado" : `${nf(p.pontos, 1).replace(",0", "")} de ${p.max}`}</b><small>${esc(p.detalhe)}</small></div>`)
        .join("")}</div>

      <h3 class="ac-h3">Proventos por ano</h3>
      ${barrasProventos(a)}
      <details class="ac-lista-prov"><summary>Todos os proventos (${provs.length})</summary>
        <div class="tabela-wrap"><table class="tabela compacta"><thead><tr><th>Data com</th><th>Data ex</th><th>Pagamento</th><th>Tipo</th><th class="num">R$ por ação</th></tr></thead><tbody>
        ${provs.map((p) => `<tr><td>${dataBR(R.dataDoDireito(p))}${p.data_com ? "" : " <small>(est.)</small>"}</td><td>${dataBR(p.data_ex)}</td><td>${p.pagamento ? dataBR(p.pagamento) : "—"}</td><td>${esc(p.tipo || "Provento")}</td><td class="num">${nf(p.valor, 4)}</td></tr>`).join("")}
        </tbody></table></div>
        ${provs.some((p) => !p.data_com) ? '<p class="dica">"(est.)": a fonte só informa a data ex; a data com é o pregão anterior a ela (sem contar feriados).</p>' : ""}
      </details>

      <fieldset class="bloco ac-alvos">
        <legend>${alvo ? "Seus alvos e alerta" : "Acompanhar esta ação"}</legend>
        <div class="campos">
          <label class="c2">Comprar até (R$)<input name="preco_compra" inputmode="decimal" value="${alvo && alvo.preco_compra ? nf(alvo.preco_compra) : ""}" placeholder="${sug.compra ? nf(sug.compra) : ""}"></label>
          <label class="c2">Vender a partir de (R$)<input name="preco_venda" inputmode="decimal" value="${alvo && alvo.preco_venda ? nf(alvo.preco_venda) : ""}" placeholder="${sug.venda ? nf(sug.venda) : ""}"></label>
          <label class="c2 ac-check"><input type="checkbox" name="alertar"${!alvo || alvo.alertar ? " checked" : ""}> Alerta diário por e-mail</label>
          <label class="c2">Quantidade que tenho<input name="quantidade" inputmode="decimal" value="${alvo && alvo.quantidade ? nf(alvo.quantidade, 0) : ""}"></label>
          <label class="c2">Preço médio (R$)<input name="preco_medio" inputmode="decimal" value="${alvo && alvo.preco_medio ? nf(alvo.preco_medio) : ""}"></label>
          <label class="c6">Observação<input name="observacao" maxlength="300" value="${esc(alvo ? alvo.observacao : "")}"></label>
        </div>
        ${sug.compra || sug.venda ? `<p class="dica">Sugestão pelos preços de referência: comprar até ${moeda(sug.compra)} (preço-teto) e vender ou rever a partir de ${moeda(sug.venda)}. <button class="btn-link" type="button" id="btn-sugestao">Usar a sugestão</button></p>` : ""}
      </fieldset>
      ${(a.avisos || []).length ? `<p class="dica">Dados incompletos nesta atualização: ${esc(a.avisos.join("; "))}.</p>` : ""}
      <p class="dica">Fonte: ${esc((a.fontes || []).join(" e "))}. Indicadores do último balanço divulgado; a cotação é a do fechamento. Informativo: não é recomendação de compra ou venda.</p>
    </div>
    <div class="dlg-rodape">
      ${alvo ? '<button class="btn btn-perigo esquerda" type="button" id="btn-tirar">Tirar da minha lista</button>' : ""}
      <button class="btn btn-claro" type="button" data-fechar>Fechar</button>
      <button class="btn btn-primary" type="submit">${alvo ? "Salvar alvos" : "Acompanhar"}</button>
    </div>
  </form>`;
  const form = $("#form-acao", dlg);
  const btnSug = $("#btn-sugestao", dlg);
  if (btnSug) btnSug.addEventListener("click", () => {
    if (sug.compra) form.preco_compra.value = nf(sug.compra);
    if (sug.venda) form.preco_venda.value = nf(sug.venda);
  });
  const tirar = $("#btn-tirar", dlg);
  if (tirar) tirar.addEventListener("click", async () => {
    if (!confirm(`Tirar ${ticker} da sua lista? Os alvos e o alerta desta ação são apagados.`)) return;
    try {
      await armazem.colecao("acoes_acompanhamento").remover(alvo.id);
      dlg.close();
      avisar(`${ticker} saiu da sua lista.`);
      await carregar();
    } catch (e) { avisar(e.message); }
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    await salvarAlvo(ticker, alvo, form, dlg);
  });
  dlg.showModal();
  dlg.scrollTop = 0;
  $(".dlg-corpo", dlg).scrollTop = 0;
}

async function salvarAlvo(ticker, alvo, form, dlg) {
  const n = (campo) => {
    const v = numeroDigitado(form[campo].value);
    return v > 0 ? Math.round(v * 100) / 100 : null;
  };
  const linha = {
    ...(alvo ? { id: alvo.id } : {}),
    perfil_id: perfil.id,
    ticker,
    preco_compra: n("preco_compra"),
    preco_venda: n("preco_venda"),
    alertar: form.alertar.checked,
    quantidade: n("quantidade"),
    preco_medio: n("preco_medio"),
    observacao: form.observacao.value.trim().slice(0, 300) || null,
  };
  if (linha.preco_compra && linha.preco_venda && linha.preco_compra >= linha.preco_venda) {
    avisar("O preço de compra precisa ser menor que o de venda.");
    return;
  }
  try {
    await armazem.colecao("acoes_acompanhamento").salvar(linha);
    dlg.close();
    avisar(alvo ? `Alvos de ${ticker} salvos.` : `${ticker} entrou na sua lista.`);
    await carregar();
  } catch (e) {
    avisar(/duplicate|23505/.test(e.message) ? `${ticker} já está na sua lista.` : e.message);
  }
}

// Acompanhar um código que ainda não está nos dados (entra na próxima atualização diária)
function abrirNovo(codigo = "") {
  const dlg = $("#dlg-novo");
  dlg.innerHTML = `<form id="form-novo">
    <div class="dlg-cab"><h2>Acompanhar ação</h2><button class="btn-link" data-fechar type="button">Fechar</button></div>
    <div class="dlg-corpo">
      <div class="campos">
        <label class="c2">Código na B3<input name="ticker" value="${esc(codigo)}" placeholder="Ex.: TAEE11" maxlength="6" required autocomplete="off"></label>
      </div>
      <p class="dica">Se a ação já estiver no painel, abre o detalhe dela, com os alvos. Um código novo entra na lista e ganha os dados na próxima atualização diária (de segunda a sexta, às 18h30).</p>
    </div>
    <div class="dlg-rodape"><button class="btn btn-claro" type="button" data-fechar>Cancelar</button><button class="btn btn-primary" type="submit">Continuar</button></div>
  </form>`;
  const form = $("#form-novo", dlg);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const t = R.normalizarCodigo(form.ticker.value);
    if (!R.codigoValido(t)) return avisar("Código inválido: são 4 letras e 1 ou 2 números (ex.: PETR4, TAEE11).");
    if (mercado.some((a) => a.ticker === t)) {
      dlg.close();
      return abrirAcao(t);
    }
    if (minhas.some((m) => m.ticker === t)) return avisar(`${t} já está na sua lista.`);
    try {
      await armazem.colecao("acoes_acompanhamento").salvar({ perfil_id: perfil.id, ticker: t, alertar: true });
      dlg.close();
      avisar(`${t} entrou na sua lista. Os dados chegam na próxima atualização; depois defina os alvos.`);
      await carregar();
    } catch (err) { avisar(err.message); }
  });
  dlg.showModal();
  form.ticker.focus();
}

// ---------------------------------------------------------------- ajuda
function renderAjuda() {
  $("#ac-ajuda").innerHTML = `
    <p>Os dados vêm de fontes públicas e gratuitas e são atualizados uma vez por dia útil, depois do fechamento da B3. Podem ter atraso ou erro: antes de decidir, confira no site de RI da empresa. <b>Nada aqui é recomendação de compra ou venda.</b></p>
    <ul>
      <li><b>Dividend yield (DY):</b> proventos (dividendos + JCP) dos últimos 12 meses ÷ preço. Acima de 6% é considerado alto; um DY muito alto pode vir de um pagamento extraordinário que não se repete, por isso compare com o <b>yield médio de 5 anos</b>.</li>
      <li><b>P/L:</b> quantos anos de lucro pagam o preço. Abaixo de 15 costuma ser barato; negativo significa prejuízo.</li>
      <li><b>P/VP:</b> preço ÷ patrimônio por ação. Abaixo de 1 a empresa vale menos que o patrimônio na bolsa.</li>
      <li><b>ROE:</b> lucro ÷ patrimônio, a rentabilidade do negócio. 15% ou mais é bom.</li>
      <li><b>Dívida líquida/EBITDA:</b> anos de geração de caixa para quitar a dívida. Até 2 é confortável; acima de 3,5 pede atenção. Não se aplica a bancos e seguradoras.</li>
      <li><b>Payout:</b> parte do lucro distribuída. Entre 25% e 90% é sustentável; acima de 100% a empresa paga mais do que lucra.</li>
      <li><b>Preço-teto (Bazin):</b> média anual dos proventos dos últimos 5 anos ÷ 6%. Comprando até esse preço, o rendimento esperado em proventos é de 6% ao ano ou mais, se a empresa mantiver os pagamentos.</li>
      <li><b>Preço justo (Graham):</b> √(22,5 × LPA × VPA). A diferença para o preço de hoje é a margem de segurança.</li>
      <li><b>Média de 200 dias:</b> preço acima da média indica tendência de alta; abaixo, de baixa. Ajuda a escolher o momento, não a empresa.</li>
      <li><b>Data com:</b> quem tem a ação no fim desse pregão recebe o provento. No dia seguinte (data ex) o preço costuma cair mais ou menos o valor do provento.</li>
    </ul>
    <p><b>Nota de confiabilidade (0 a 100):</b> mede a consistência ao longo do tempo, não se a ação está barata.</p>
    <ul>
      <li>Anos pagando proventos nos últimos 10 (25 pontos) e regularidade, sem queda de mais de 25% de um ano para o outro (15).</li>
      <li>Anos com lucro (15) e crescimento do lucro (5, cheio com 10% ao ano ou mais).</li>
      <li>Tempo de bolsa (10, cheio com 15 anos), ROE (10, cheio com 15%), endividamento (10, cheio até 1× o EBITDA; bancos ficam de fora) e liquidez diária (10, cheio com R$ 50 milhões por dia).</li>
      <li>Critério sem dado fica de fora e a nota é refeita sobre os outros. 75 ou mais: alta · 55 a 74: média · abaixo de 55: baixa.</li>
    </ul>
    <p><b>Alertas:</b> cada pessoa define, na própria lista, até quanto compraria e a partir de quanto venderia. Em cada dia de pregão, quem tem o alerta ligado recebe por e-mail a cotação de fechamento dessas ações, com as que entraram na zona de compra ou de venda em destaque. A sugestão de alvos usa o preço-teto para a compra e 40% acima dele (ou 20% acima do preço justo) para a venda; ajuste ao seu objetivo.</p>`;
}

// ---------------------------------------------------------------- início
async function iniciar() {
  const sessao = await abrirPagina("acoes.html");
  if (!sessao) return;
  ({ armazem, perfil } = sessao);
  prepararDialogos();
  renderAjuda();
  $("#tela").hidden = false;
  $("#btn-acompanhar").addEventListener("click", () => abrirNovo());
  $("#ac-busca").addEventListener("input", (e) => { filtro.busca = e.target.value; renderTodas(); });
  $("#ac-setor").addEventListener("change", (e) => { filtro.setor = e.target.value; renderTodas(); });
  $("#ac-ordem").addEventListener("change", (e) => { filtro.ordem = e.target.value; renderTodas(); });
  $("#ac-so-teto").addEventListener("change", (e) => { filtro.soTeto = e.target.checked; renderTodas(); });
  document.addEventListener("click", (e) => {
    const tr = e.target.closest("tr.clicavel[data-ticker]");
    if (tr && !e.target.closest("dialog")) abrirAcao(tr.dataset.ticker);
  });
  try {
    await carregar();
  } catch (e) {
    avisar(e.message);
  }
}

iniciar();
