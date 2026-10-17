// Painel gerencial da área restrita (area/painel.html): indicadores de ARTs, financeiro e demandas,
// gráfico mensal e listas de prazos. Cada bloco aparece só para quem tem permissão no módulo.
import { abrirPagina } from "./sessao.js";
import { pode } from "./modulos.js";
import * as R from "./regras.js";
import * as G from "./regras-gestao.js";
import { $, esc, moeda, moedaCurta, porcento, opcoes } from "./ui.js";

const hoje = R.hojeISO();
const dados = { arts: [], tratados: new Set(), lancamentos: [], demandas: [] };
let chavePeriodo = "ano";
try {
  chavePeriodo = localStorage.getItem("mz-painel-periodo") || "ano";
} catch {
  /* sem armazenamento: usa o padrão */
}


function renderizar() {
  const p = G.periodo(chavePeriodo, hoje);
  renderArts();
  renderFinanceiro(p);
  renderDemandas(p);
  desenharGrafico();
  renderPorServico(p);
  renderListas();
}

// ---------------------------------------------------------------- cards de indicador
function kpi({ rotulo, valor, detalhe = "", href, destaque = false, alerta = false }) {
  return `<a class="kpi kpi-link${destaque ? " kpi-destaque" : ""}${alerta ? " kpi-alerta" : ""}" href="${href}">
      <span class="kpi-rotulo">${rotulo}</span>
      <strong class="kpi-valor">${valor}</strong>
      ${detalhe ? `<span class="kpi-detalhe">${detalhe}</span>` : ""}
    </a>`;
}
const nomePeriodo = () => G.PERIODOS.find(([k]) => k === chavePeriodo)[1].toLowerCase();
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

function renderArts() {
  const { arts, tratados } = dados;
  const sit = (s) => arts.filter((a) => R.situacao(a, hoje) === s).length;
  const proximas = arts.filter((a) => !a.baixa_data && a.fim && R.diasAte(a.fim, hoje) >= 0 && R.diasAte(a.fim, hoje) <= G.PRAZO_ART_PAINEL);
  const alertas = R.alertasPendentes(arts, tratados, hoje).length;
  const vencidas = sit("vencida");
  $("#kpis-art").innerHTML = [
    kpi({ rotulo: "ARTs ativas", valor: sit("ativa") + sit("vencendo"), detalhe: `${plural(sit("baixada"), "baixada", "baixadas")} no total`, href: "art.html" }),
    kpi({ rotulo: "Próximas do vencimento", valor: proximas.length, detalhe: `fim previsto nos próximos ${G.PRAZO_ART_PAINEL} dias`, href: "art.html", alerta: proximas.length > 0 }),
    kpi({ rotulo: "Vencidas sem baixa", valor: vencidas, detalhe: vencidas ? "verificar baixa ou nova ART" : "nenhuma pendência", href: "art.html", alerta: vencidas > 0 }),
    kpi({ rotulo: "Alertas pendentes", valor: alertas, detalhe: "no Controle de ART", href: "art.html", alerta: alertas > 0 }),
  ].join("");
}

function renderFinanceiro(p) {
  const r = G.resumoFinanceiro(dados.lancamentos, p, hoje);
  $("#kpis-fin").innerHTML = [
    kpi({ rotulo: "Lucro líquido", valor: moedaCurta(r.lucro), detalhe: r.margem == null ? nomePeriodo() : `margem de ${porcento(r.margem)} · ${nomePeriodo()}`, href: "financeiro.html", destaque: true }),
    kpi({ rotulo: "Total recebido", valor: moedaCurta(r.recebido), detalhe: plural(r.qtdRecebidas, "recebimento", "recebimentos"), href: "financeiro.html" }),
    kpi({ rotulo: "Gastos totais", valor: moedaCurta(r.gastos), detalhe: r.aPagar ? `${moedaCurta(r.aPagar)} a pagar` : nomePeriodo(), href: "financeiro.html" }),
    kpi({ rotulo: "A receber", valor: moedaCurta(r.aReceber), detalhe: "dentro do prazo", href: "financeiro.html" }),
    kpi({ rotulo: "Em atraso", valor: moedaCurta(r.atrasado), detalhe: plural(r.qtdAtrasado, "recebimento", "recebimentos"), href: "financeiro.html", alerta: r.atrasado > 0 }),
    kpi({ rotulo: "Ticket médio", valor: r.ticket == null ? "—" : moedaCurta(r.ticket), detalhe: "por recebimento", href: "financeiro.html" }),
  ].join("");
}

function renderDemandas(p) {
  const d = G.resumoDemandas(dados.demandas, p, hoje);
  $("#kpis-dem").innerHTML = [
    kpi({ rotulo: "Demandas em aberto", valor: d.abertas, detalhe: `${plural(d.novas, "nova", "novas")} · ${nomePeriodo()}`, href: "demandas.html" }),
    kpi({ rotulo: "Propostas aguardando resposta", valor: d.propostas, detalhe: d.valorPropostas ? moedaCurta(d.valorPropostas) + " em propostas" : "sem valor informado", href: "demandas.html" }),
    kpi({ rotulo: "Taxa de aprovação", valor: porcento(d.taxaAprovacao), detalhe: `propostas decididas · ${nomePeriodo()}`, href: "demandas.html" }),
    kpi({ rotulo: "Carteira aprovada", valor: moedaCurta(d.valorCarteira), detalhe: `${plural(d.porEtapa.aprovada + d.porEtapa.execucao, "serviço", "serviços")} aprovados ou em execução`, href: "demandas.html" }),
    kpi({ rotulo: "Prazos vencidos", valor: d.prazosVencidos, detalhe: "demandas em aberto", href: "demandas.html", alerta: d.prazosVencidos > 0 }),
  ].join("");
}

// ---------------------------------------------------------------- gráfico mensal (colunas agrupadas)
const NS = "http://www.w3.org/2000/svg";
const el = (nome, attrs = {}) => {
  const n = document.createElementNS(NS, nome);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};
function passoRedondo(max) {
  const bruto = max / 4;
  const ordem = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * ordem).find((v) => v >= bruto);
  return passo || ordem * 10;
}
// Coluna com topo arredondado (4px) e base reta
const coluna = (x, y, w, h) => {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
};

function desenharGrafico() {
  const caixa = $("#grafico-mensal");
  if (!caixa || caixa.closest("[hidden]")) return;
  const p = G.periodo(chavePeriodo, hoje);
  const meses = G.porMes(dados.lancamentos, p.meses);
  $("#tabela-mensal tbody").innerHTML = meses
    .map((m) => `<tr><td>${G.rotuloMes(m.mes)}</td><td class="num">${moeda(m.receitas)}</td><td class="num">${moeda(m.despesas)}</td><td class="num">${moeda(m.resultado)}</td></tr>`)
    .join("");

  const max = Math.max(...meses.map((m) => Math.max(m.receitas, m.despesas)));
  caixa.replaceChildren();
  if (!max) {
    caixa.innerHTML = `<p class="vazio">Sem valores recebidos ou pagos nestes meses. Os lançamentos do Controle financeiro aparecem aqui.</p>`;
    return;
  }

  const L = caixa.clientWidth || 600;
  const A = 260;
  const m = { cima: 12, dir: 8, baixo: 28, esq: 64 };
  const larg = L - m.esq - m.dir;
  const alt = A - m.cima - m.baixo;
  const passo = passoRedondo(max);
  const topo = Math.ceil(max / passo) * passo;
  const y = (v) => m.cima + alt - (v / topo) * alt;
  const grupo = larg / meses.length;
  const barra = Math.max(4, Math.min(24, (grupo - 10) / 2 - 1));

  const svg = el("svg", { width: L, height: A, viewBox: `0 0 ${L} ${A}`, role: "img", "aria-label": "Recebido e gasto por mês" });
  for (let v = 0; v <= topo + 0.001; v += passo) {
    const yy = Math.round(y(v)) + 0.5;
    svg.append(el("line", { x1: m.esq, x2: L - m.dir, y1: yy, y2: yy, class: v === 0 ? "eixo" : "grade" }));
    const t = el("text", { x: m.esq - 8, y: yy + 4, "text-anchor": "end", class: "rotulo-eixo" });
    t.textContent = moedaCurta(v).replace(",00", "");
    svg.append(t);
  }

  const dica = Object.assign(document.createElement("div"), { className: "dica-grafico", hidden: true });
  meses.forEach((mes, i) => {
    const x0 = m.esq + i * grupo;
    const centro = x0 + grupo / 2;
    const g = el("g", { class: "grupo-mes", tabindex: "0", "aria-label": `${G.rotuloMes(mes.mes)}: recebido ${moeda(mes.receitas)}, gasto ${moeda(mes.despesas)}` });
    g.append(el("rect", { x: x0, y: m.cima, width: grupo, height: alt, class: "alvo" }));
    [[mes.receitas, "serie-1", centro - barra - 1], [mes.despesas, "serie-2", centro + 1]].forEach(([v, classe, x]) => {
      if (v > 0) g.append(el("path", { d: coluna(x, y(v), barra, y(0) - y(v)), class: classe }));
    });
    const t = el("text", { x: centro, y: A - 8, "text-anchor": "middle", class: "rotulo-eixo" });
    t.textContent = G.rotuloMes(mes.mes);
    g.append(t);
    const mostrar = () => {
      dica.replaceChildren();
      const titulo = document.createElement("b");
      titulo.textContent = G.rotuloMes(mes.mes);
      dica.append(titulo);
      [["serie-1", mes.receitas, "Recebido"], ["serie-2", mes.despesas, "Gasto"], ["", mes.resultado, "Resultado"]].forEach(([classe, v, nome]) => {
        const linha = document.createElement("span");
        linha.className = "linha-dica";
        linha.innerHTML = `<i class="chave-linha ${classe}"></i><strong></strong><em></em>`;
        linha.querySelector("strong").textContent = moeda(v);
        linha.querySelector("em").textContent = nome;
        dica.append(linha);
      });
      dica.hidden = false;
      const esquerda = Math.min(Math.max(centro - 90, 0), L - 180);
      dica.style.left = `${esquerda}px`;
      dica.style.top = `${Math.max(0, y(Math.max(mes.receitas, mes.despesas)) - 96)}px`;
      g.classList.add("ativo");
    };
    const esconder = () => {
      dica.hidden = true;
      g.classList.remove("ativo");
    };
    g.addEventListener("pointerenter", mostrar);
    g.addEventListener("pointerleave", esconder);
    g.addEventListener("focus", mostrar);
    g.addEventListener("blur", esconder);
    svg.append(g);
  });
  caixa.append(svg, dica);
}

// ---------------------------------------------------------------- receita por tipo de serviço (barras horizontais)
function renderPorServico(p) {
  const lista = G.receitaPorCategoria(dados.lancamentos, p);
  if (!lista.length) {
    $("#por-servico").innerHTML = `<p class="vazio">Sem receitas recebidas no período.</p>`;
    return;
  }
  const max = lista[0].valor;
  const total = lista.reduce((t, x) => t + x.valor, 0);
  $("#por-servico").innerHTML = `<ul class="barras">${lista
    .map(
      (x) => `<li>
        <span class="barra-rotulo">${esc(x.categoria)}</span>
        <span class="barra-trilho"><span class="barra serie-1" style="width:${Math.max(2, (x.valor / max) * 100)}%"></span>
        <span class="barra-valor">${moedaCurta(x.valor)} <small>${porcento(x.valor / total)}</small></span></span>
      </li>`
    )
    .join("")}</ul>`;
}

// ---------------------------------------------------------------- listas de prazos
function itemLista(titulo, detalhe, classe = "") {
  return `<li class="${classe}"><span>${titulo}</span><small>${detalhe}</small></li>`;
}
const quandoDias = (dias) =>
  dias < 0 ? `há ${plural(-dias, "dia", "dias")}` : dias === 0 ? "hoje" : dias === 1 ? "amanhã" : `em ${dias} dias`;

function renderListas() {
  const arts = dados.arts
    .filter((a) => !a.baixa_data && a.fim && R.diasAte(a.fim, hoje) >= 0 && R.diasAte(a.fim, hoje) <= G.PRAZO_ART_PAINEL)
    .sort((a, b) => a.fim.localeCompare(b.fim));
  $("#lista-art").innerHTML = arts.length
    ? arts.slice(0, 6).map((a) => {
        const dias = R.diasAte(a.fim, hoje);
        return itemLista(`ART ${esc(a.numero)} – ${esc(a.contratante || "cliente não informado")}`, `vence ${quandoDias(dias)} (${R.dataBR(a.fim)})`, dias <= 7 ? "urgente" : "");
      }).join("")
    : `<li class="nada">Nenhuma ART vence nos próximos ${G.PRAZO_ART_PAINEL} dias.</li>`;

  const dem = dados.demandas
    .map((d) => ({ d, dias: G.diasPrazo(d, hoje) }))
    .filter(({ dias }) => dias !== null && dias <= 15)
    .sort((a, b) => a.dias - b.dias);
  $("#lista-dem").innerHTML = dem.length
    ? dem.slice(0, 6).map(({ d, dias }) =>
        itemLista(`${esc(d.titulo)} – ${esc(d.cliente || d.contato || "")}`, `${G.ROTULO_ETAPA[d.etapa]} · prazo ${dias < 0 ? "vencido " : ""}${quandoDias(dias)}`, dias <= 0 ? "urgente" : "")
      ).join("")
    : `<li class="nada">Nenhum prazo nos próximos 15 dias.</li>`;

  const atrasados = dados.lancamentos
    .filter((l) => l.tipo === "receita" && G.situacaoLancamento(l, hoje) === "atrasado")
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  $("#lista-rec").innerHTML = atrasados.length
    ? atrasados.slice(0, 6).map((l) =>
        itemLista(`${esc(l.cliente || l.descricao)} – ${moeda(Number(l.valor))}`, `venceu ${quandoDias(R.diasAte(l.vencimento, hoje))} (${R.dataBR(l.vencimento)})`, "urgente")
      ).join("")
    : `<li class="nada">Nenhum recebimento em atraso.</li>`;
}

// Início: roda depois de todo o módulo carregado
async function iniciar() {
  const sessao = await abrirPagina("painel.html");
  if (!sessao) return;
  const { armazem, perfil } = sessao;
  const tem = (modulo) => pode(perfil, modulo);
  document.querySelectorAll("[data-modulo]").forEach((el) => (el.hidden = !tem(el.dataset.modulo)));
  $("#conteudo").hidden = false;
  $("#periodo").innerHTML = opcoes(G.PERIODOS, chavePeriodo);
  $("#periodo").addEventListener("change", (e) => {
    chavePeriodo = e.target.value;
    try {
      localStorage.setItem("mz-painel-periodo", chavePeriodo);
    } catch {
      /* ignora */
    }
    renderizar();
  });
  try {
    [dados.arts, dados.tratados, dados.lancamentos, dados.demandas] = await Promise.all([
      tem("art") ? armazem.listar() : [],
      tem("art") ? armazem.tratados() : new Set(),
      tem("financeiro") ? armazem.colecao("lancamentos").listar() : [],
      tem("demandas") ? armazem.colecao("demandas").listar() : [],
    ]);
  } catch (err) {
    $(".area-cabecalho").insertAdjacentHTML("afterend", `<p class="erro">Não foi possível carregar os dados: ${esc(err.message)}</p>`);
  }
  renderizar();
  new ResizeObserver(() => desenharGrafico()).observe($("#grafico-mensal"));
}

iniciar();
