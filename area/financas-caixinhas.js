// Caixinhas de provisão (aba Caixinhas): dinheiro guardado para gastos futuros (IPTU, IPVA, seguro, viagem, casa...).
// Cada caixinha tem meta, data alvo e saldo (informado de tempos em tempos, como os saldos dos investimentos). O site
// calcula quanto guardar por mês, a parte de cada um (nas do casal: 50/50, pela renda do mês ou fixo), a situação e o
// progresso. Regra para não contar em dobro:
//   - o depósito na caixinha (gasto na categoria Caixinhas ligado a ela) sai do caixa na linha "(−) Caixinhas", como o
//     investimento, e não é gasto;
//   - o gasto pago com o dinheiro da caixinha ("Pago com: caixinha X") não entra nos gastos nem no caixa do mês: só
//     tira do saldo dela.
// Nenhum dado pessoal aqui: nomes, valores e caixinhas vêm do banco.
import { $, esc, avisar, numeroDigitado } from "./ui.js";

export const CATEGORIA = "Caixinhas";
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const semAcento = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const centavos = (v) => Math.round((Number(v) || 0) * 100) / 100;
const brl = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const valorBR = (v) => Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rotuloMes = (chave) => `${MESES[Number(chave.slice(5, 7)) - 1]}/${chave.slice(2, 4)}`;
const dataBR = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");
const idx = (chave) => Number(chave.slice(0, 4)) * 12 + Number(chave.slice(5, 7)) - 1;
const mesesEntre = (de, ate) => idx(ate) - idx(de);
const hojeISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const maisUmAno = (iso) => { const [a, m, d] = iso.split("-").map(Number); const ult = new Date(a + 1, m, 0).getDate(); return `${a + 1}-${String(m).padStart(2, "0")}-${String(Math.min(d, ult)).padStart(2, "0")}`; };

// Depósito na caixinha: gasto na categoria Caixinhas (o que for de outra categoria ligado a ela foi pago com ela)
export const ehDeposito = (categoria) => /^caixinha/.test(semAcento(categoria));

// Movimentos das caixinhas: os gastos lançados no site ligados a uma caixinha (perfilId: de quem é o painel)
export function movimentosDe(gastos, perfilId = null) {
  return (gastos || []).filter((g) => g && g.caixinha_id).map((g) => ({
    id: g.id, caixinha_id: g.caixinha_id, data: String(g.data || "").slice(0, 10), valor: Number(g.valor) || 0, deposito: ehDeposito(g.categoria),
    perfil_id: perfilId || g.perfil_id, criado_em: g.criado_em || "", descricao: g.descricao || "", forma: g.forma || "", categoria: g.categoria || "",
  }));
}

// O movimento entra no saldo? Os de depois da data do saldo; no mesmo dia, os lançados depois de o saldo ser informado
const depoisDoSaldo = (cx, m) => {
  if (!cx.saldo_em) return true;
  if (m.data !== cx.saldo_em) return m.data > cx.saldo_em;
  const marco = Date.parse(cx.saldo_atualizado || cx.criado_em || "");
  const quando = Date.parse(m.criado_em || "");
  return Number.isFinite(marco) && Number.isFinite(quando) ? quando > marco : false;
};

// Conta de uma caixinha hoje: saldo (o informado + depósitos − gastos pagos com ela depois da data do saldo), quanto
// falta, meses até a data alvo, quanto guardar por mês (estável no mês: parte do saldo do começo do mês), o esperado
// pelo tempo passado desde o início, a situação (em dia, atrasada ou completa), o progresso e o alerta (atrasada e
// faltam 3 meses ou menos)
export function calcular(cx, movimentos, hoje = hojeISO()) {
  const mes = hoje.slice(0, 7);
  const alvo = String(cx.data_alvo).slice(0, 7);
  const ini = String(cx.inicio || cx.criado_em || hoje).slice(0, 7);
  const daqui = (movimentos || []).filter((m) => m.caixinha_id === cx.id && depoisDoSaldo(cx, m));
  const soma = (f) => centavos(daqui.filter(f).reduce((t, m) => t + m.valor, 0));
  const doMes = (m) => m.data.slice(0, 7) === mes;
  const saldo = centavos(Number(cx.saldo) + soma((m) => m.deposito) - soma((m) => !m.deposito));
  const depMes = soma((m) => m.deposito && doMes(m)), pagMes = soma((m) => !m.deposito && doMes(m));
  const saldoInicio = centavos(saldo - depMes + pagMes);
  const meta = Number(cx.meta) || 0;
  const mesesAte = mesesEntre(mes, alvo);
  const meses = Math.max(1, mesesAte);
  // Aporte mensal fixo (opcional): guarda esse valor todo mês, sem passar do que falta; sem ele, divide o que falta
  const fixo = Number(cx.aporte_mensal) > 0 ? centavos(cx.aporte_mensal) : 0;
  const faltaInicio = centavos(meta - saldoInicio);
  const porMes = faltaInicio <= 0.005 ? 0 : fixo ? Math.min(fixo, faltaInicio) : centavos(faltaInicio / meses);
  // Com o fixo, quanto ela deve ter na data alvo (para avisar se não chega na meta)
  const naData = fixo ? centavos(saldoInicio + fixo * meses) : null;
  const total = Math.max(1, mesesEntre(ini, alvo));
  const passados = Math.min(total, Math.max(0, mesesEntre(ini, mes)));
  const esperado = centavos((meta * passados) / total);
  const completa = saldo >= meta - 0.005;
  const situacao = completa ? "completa" : saldo + 0.005 < esperado ? "atrasada" : "em dia";
  return {
    saldo, meta, falta: centavos(Math.max(0, meta - saldo)), depMes, pagMes, saldoInicio, porMes, faltaNoMes: centavos(Math.max(0, porMes - depMes)),
    meses, mesesAte, esperado, situacao, fixo, naData, naoChega: fixo > 0 && naData + 0.005 < meta, progresso: meta > 0 ? Math.min(1, Math.max(0, saldo / meta)) : 0,
    alerta: situacao === "atrasada" && mesesAte <= 3, vencida: String(cx.data_alvo) < hoje && !completa, movimentos: daqui,
  };
}

// Quanto guardar na caixinha (somando o casal) num mês: no mês atual e até a data alvo, o "por mês"; depois dela, na
// recorrente, o ciclo seguinte (meta ÷ 12); na meta única, nada. Arquivada ou mês passado: nada.
export function valorNoMes(cx, chave, conta, mesAtual) {
  if (cx.ativa === false || chave < mesAtual || !conta) return 0;
  if (chave === mesAtual || chave < String(cx.data_alvo).slice(0, 7)) return conta.porMes;
  return cx.tipo === "recorrente" ? (Number(cx.aporte_mensal) > 0 ? centavos(cx.aporte_mensal) : centavos(Number(cx.meta) / 12)) : 0;
}

// Aporte inicial de cada pessoa (o que cada um já tinha posto antes de lançar no site): { perfil_id: valor }
export const aportesIniciais = (cx) => {
  const a = cx && cx.aportes_iniciais && typeof cx.aportes_iniciais === "object" ? cx.aportes_iniciais : {};
  return Object.fromEntries(Object.entries(a).map(([k, v]) => [k, centavos(v)]).filter(([, v]) => v > 0));
};
const temAportes = (cx) => cx.dono === "casal" && Object.keys(aportesIniciais(cx)).length > 0;

// Quanto a pessoa já pôs na caixinha neste ciclo antes do mês: o aporte inicial informado mais os depósitos dela
// desde o início do ciclo (com data antes do mês, para a parte ficar estável no mês, como o "por mês")
export function aportadoAntes(cx, movimentos, perfilId, mes) {
  const ini = String(cx.inicio || "").slice(0, 10);
  const dep = (movimentos || []).filter((m) => m.caixinha_id === cx.id && m.deposito && m.perfil_id === perfilId && m.data >= ini && m.data.slice(0, 7) < mes);
  return centavos((aportesIniciais(cx)[perfilId] || 0) + dep.reduce((t, m) => t + m.valor, 0));
}

// Parte de cada pessoa no "por mês" de uma caixinha do casal com aporte inicial informado: a parte de cada um na meta
// (pela divisão) menos o que cada um já pôs; quem pôs mais no começo guarda menos por mês, até os dois chegarem na sua
// parte. Sem aporte inicial informado (ou só uma pessoa), fica a divisão de sempre (base: { perfil_id: fração }).
export function partesComAportes(cx, base, movimentos, mes) {
  const ids = Object.keys(base);
  if (ids.length < 2 || !temAportes(cx)) return base;
  const meta = Number(cx.meta) || 0;
  const devido = Object.fromEntries(ids.map((id) => [id, Math.max(0, meta * base[id] - aportadoAntes(cx, movimentos, id, mes))]));
  const soma = ids.reduce((t, id) => t + devido[id], 0);
  return soma > 0.005 ? Object.fromEntries(ids.map((id) => [id, devido[id] / soma])) : base;
}

// Parte de uma pessoa (perfilId) na caixinha: a dela só dela; a do casal, 50/50, pela renda do mês dos dois (sem a
// renda da outra pessoa, metade) ou fixo (parte = % de quem cadastrou)
export function parteDe(cx, perfilId, rendaEu = null, rendaOutro = null) {
  if (cx.dono !== "casal") return cx.perfil_id === perfilId ? 1 : 0;
  if (cx.divisao === "50/50") return 0.5;
  if (cx.divisao === "fixo") { const p = Math.min(100, Math.max(0, Number(cx.parte ?? 50))) / 100; return cx.perfil_id === perfilId ? p : 1 - p; }
  const eu = Number(rendaEu) || 0, outro = Number(rendaOutro) || 0;
  return rendaOutro == null || eu + outro <= 0 ? 0.5 : eu / (eu + outro);
}
export const textoDivisao = (cx, nomeDe) => (cx.dono !== "casal" ? `só de ${nomeDe(cx.perfil_id)}` : cx.divisao === "50/50" ? "metade de cada um"
  : cx.divisao === "fixo" ? `${Math.round(Number(cx.parte ?? 50))}% de ${nomeDe(cx.perfil_id)}` : "pela renda do mês");
const SITUACAO = { "em dia": ["Em dia", "ok-chip"], atrasada: ["Atrasada", "bad"], completa: ["Completa", "ok-chip"] };

// ---------------------------------------------------------------- aba Caixinhas
// painel: estadoCaixinhas() (as contas do mês, com a parte de cada pessoa) e atualizarCaixinhas(lista);
// pessoas: [{ id, nome }] (quem tem o painel aberto primeiro); salvar(caixinha) grava e devolve a lista nova;
// guardar({ caixinha, valor, data, forma }) lança o depósito; editarGasto/apagarGasto abrem ou apagam um gasto do painel.
export function prepararCaixinhas({ painel, pessoas, dono, salvar, guardar, editarGasto = null, apagarGasto = null }) {
  const raiz = $("#view-caixinhas");
  if (!raiz) return { desenhar() {} };
  const nomeDe = (id) => (pessoas.find((p) => p.id === id) || {}).nome || "outra pessoa";
  const casal = pessoas.length > 1;
  let editando = null, saldoDe = null, guardarEm = null;

  function desenhar() {
    const { linhas, arquivadas, mes } = painel.estadoCaixinhas();
    const alertas = linhas.filter((x) => x.conta.alerta);
    $("#cx-alertas").innerHTML = alertas.map((x) => `<div class="alert bad" role="status"><span class="sev"></span><div><b>${esc(x.cx.nome)} está atrasada.</b>
      Faltam ${x.conta.mesesAte <= 0 ? "menos de um mês" : `${x.conta.mesesAte} ${x.conta.mesesAte === 1 ? "mês" : "meses"}`} para ${dataBR(x.cx.data_alvo)} e ela tem ${brl(x.conta.saldo)}; pelo tempo, deveria ter ${brl(x.conta.esperado)}.
      Para chegar a ${brl(x.cx.meta)}, guarde ${brl(x.conta.porMes)} por mês.</div></div>`).join("");
    const tot = (f) => centavos(linhas.reduce((t, x) => t + f(x), 0));
    const cab = `<tr><th>Caixinha</th><th class="r">Tem / Meta</th><th class="r">Falta</th><th>Até</th><th class="r">Por mês</th>${pessoas.map((p) => `<th class="r">${esc(p.nome)}</th>`).join("")}<th><span class="sr-only">Ações</span></th></tr>`;
    const linha = (x, i) => {
      const c = x.conta, [st, cls] = SITUACAO[c.situacao];
      const acoes = [
        `<button type="button" class="btn mini" data-cx-guardar="${i}">Guardar</button>`,
        `<button type="button" class="btn sec mini" data-cx-saldo="${i}">Atualizar saldo</button>`,
        x.cx.tipo === "recorrente" ? `<button type="button" class="btn sec mini" data-cx-paguei="${i}">Paguei</button>` : "",
        `<button type="button" class="btn-link" data-cx-editar="${i}">Editar</button>`,
        `<button type="button" class="btn-link" data-cx-arquivar="${i}">Arquivar</button>`,
      ].join("");
      return `<tr class="cx-linha${c.alerta ? " cx-alerta" : ""}">
        <td><b>${esc(x.cx.nome)}</b> <span class="chip ${cls}">${st}</span>
          <div class="sub">${esc([x.cx.tipo === "recorrente" ? "repete todo ano" : "meta única", casal ? textoDivisao(x.cx, nomeDe) : "", c.fixo ? `aporte fixo de ${brl(c.fixo)}/mês` : "",
            casal && x.cx.dono === "casal" && Object.keys(aportesIniciais(x.cx)).length ? `aporte inicial: ${pessoas.map((p) => `${p.nome} ${brl(aportesIniciais(x.cx)[p.id] || 0)}`).join(", ")}` : "", x.cx.saldo_em ? `saldo informado em ${dataBR(x.cx.saldo_em)}` : ""].filter(Boolean).join(" · "))}</div>
          <div class="cx-barra" role="img" aria-label="${Math.round(c.progresso * 100)}% da meta"><span style="width:${(c.progresso * 100).toFixed(1)}%"></span>${c.esperado > 0 && c.esperado < x.cx.meta ? `<i style="left:${((c.esperado / x.cx.meta) * 100).toFixed(1)}%" title="Esperado hoje: ${brl(c.esperado)}"></i>` : ""}</div>
          <div class="cx-acoes">${acoes}</div></td>
        <td class="r num">${brl(c.saldo)}<div class="sub">de ${brl(x.cx.meta)} · ${Math.round(c.progresso * 100)}%</div></td>
        <td class="r num">${c.falta > 0 ? brl(c.falta) : "—"}</td>
        <td class="num">${dataBR(x.cx.data_alvo)}<div class="sub">${c.vencida ? "data passou" : c.mesesAte <= 0 ? "este mês" : `${c.mesesAte} ${c.mesesAte === 1 ? "mês" : "meses"}`}</div></td>
        <td class="r num">${c.porMes > 0 ? brl(c.porMes) : "—"}${c.naoChega ? `<div class="sub neg">assim chega a ${brl(c.naData)} na data</div>` : ""}${c.depMes > 0 ? `<div class="sub">guardou ${brl(c.depMes)} no mês</div>` : ""}</td>
        ${pessoas.map((p) => { const v = x.porPessoa[p.id] || 0; return `<td class="r num">${v > 0.004 ? brl(v) : "—"}${x.feitoPessoa[p.id] > 0 ? `<div class="sub">guardou ${brl(x.feitoPessoa[p.id])}</div>` : ""}</td>`; }).join("")}
        <td></td></tr>`;
    };
    $("#cx-resumo").innerHTML = linhas.length ? `
      <div class="scroll"><table class="cx-tabela"><thead>${cab}</thead><tbody>${linhas.map(linha).join("")}</tbody>
        <tfoot><tr><th>Total</th><td class="r num">${brl(tot((x) => x.conta.saldo))}<div class="sub">de ${brl(tot((x) => Number(x.cx.meta)))}</div></td><td class="r num">${brl(tot((x) => x.conta.falta))}</td><td></td>
          <td class="r num">${brl(tot((x) => x.conta.porMes))}</td>${pessoas.map((p) => `<td class="r num">${brl(tot((x) => x.porPessoa[p.id] || 0))}</td>`).join("")}<td></td></tr></tfoot></table></div>
      <details class="como"><summary>Como é calculado?</summary><p><b>Por mês</b> = (meta − saldo no começo de ${esc(rotuloMes(mes))}) ÷ meses até a data alvo. <b>Atrasada</b>: o saldo está abaixo do esperado pelo tempo (a meta proporcional aos meses desde o início da caixinha). O <b>saldo</b> é o informado mais os depósitos e menos os gastos pagos com a caixinha lançados depois da data dele. Com o <b>aporte mensal fixo</b>, o por mês é esse valor (sem passar do que falta), e o site avisa se assim não chega na meta até a data. Nas do casal, a parte de cada um é metade, pela renda do mês (as entradas de cada um) ou um percentual fixo; com o <b>aporte inicial</b> de cada um informado, a parte do por mês é proporcional ao que falta a cada um para chegar na sua parte da meta (a parte da meta menos o aporte inicial e os depósitos dele desde o início da caixinha). O depósito sai do caixa na linha “(−) Caixinhas” do balanço e entra na previsão dos próximos meses e na sobra da lista de desejos; não é gasto. O gasto pago com a caixinha não entra nos gastos do mês, só tira do saldo dela.</p></details>`
      : `<p class="muted" style="margin:0">Nenhuma caixinha ainda. Crie uma para cada gasto futuro (IPTU, IPVA, seguro, viagem): o site diz quanto guardar por mês e se ela está em dia.</p>`;
    // Movimentos recentes (depois da data do saldo) de cada caixinha
    const movs = linhas.flatMap((x) => x.conta.movimentos.map((m) => ({ ...m, cx: x.cx }))).sort((a, b) => b.data.localeCompare(a.data));
    $("#cx-movimentos").hidden = !movs.length;
    $("#cx-movimentos").innerHTML = movs.length ? `<h2>Depósitos e gastos pagos com as caixinhas</h2>
      <p class="sub" style="margin:-4px 0 10px">Os lançados depois da data do saldo de cada caixinha. Para depositar, use Guardar; para um gasto pago com o dinheiro da caixinha, lance o gasto com “Pago com: caixinha”.</p>
      <div class="scroll"><table class="cx-mov"><thead><tr><th>Data</th><th>Caixinha</th><th>Lançamento</th><th class="r">Valor</th><th><span class="sr-only">Ações</span></th></tr></thead><tbody>
      ${movs.map((m) => `<tr><td class="num">${dataBR(m.data)}</td><td>${esc(m.cx.nome)}</td><td>${esc(m.descricao)}<div class="sub">${m.deposito ? "depósito" : `pago com a caixinha · ${esc(m.categoria || "")}`}${casal ? ` · ${esc(nomeDe(m.perfil_id))}` : ""}</div></td>
        <td class="r num ${m.deposito ? "pos" : "neg"}">${m.deposito ? "+" : "−"}${brl(m.valor)}</td>
        <td class="r">${m.perfil_id === dono && editarGasto ? `<button type="button" class="btn-link" data-cx-gasto="${esc(m.id)}">Editar</button>` : `<span class="sub">no painel de ${esc(nomeDe(m.perfil_id))}</span>`}</td></tr>`).join("")}
      </tbody></table></div>` : "";
    $("#cx-arquivadas").hidden = !arquivadas.length;
    $("#cx-arquivadas").innerHTML = arquivadas.length ? `<details><summary>Arquivadas (${arquivadas.length})</summary><ul class="cx-arq">${arquivadas.map((cx) => `<li>${esc(cx.nome)} <span class="sub">meta ${brl(cx.meta)} · ${dataBR(cx.data_alvo)}</span> <button type="button" class="btn-link" data-cx-reativar="${esc(cx.id)}">Reativar</button></li>`).join("")}</ul></details>` : "";
    LINHAS = linhas;
    ARQUIVADAS = arquivadas;
  }
  let LINHAS = [], ARQUIVADAS = [];

  // ---------- nova / editar
  const form = $("#form-caixinha");
  const erro = (sel, t) => { $(sel).textContent = t; $(sel).hidden = !t; };
  function mostrarCampos() {
    const doCasal = form.elements.dono.value === "casal";
    form.querySelector("[data-cx-divisao]").hidden = !doCasal;
    form.querySelector("[data-cx-parte]").hidden = !doCasal || form.elements.divisao.value !== "fixo";
    form.querySelector("[data-cx-aportes]").hidden = !doCasal || !casal;
  }
  // Na criação, o saldo de hoje acompanha a soma dos aportes iniciais enquanto não for digitado à mão
  let saldoDigitado = false;
  const somaAportes = () => centavos(pessoas.reduce((t, p, i) => t + (numeroDigitado(form.elements[`aporte_${i}`].value) || 0), 0));
  form.addEventListener("input", (e) => {
    if (e.target.name === "saldo") saldoDigitado = !!e.target.value;
    else if (/^aporte_\d$/.test(e.target.name) && !editando && !saldoDigitado) { const t = somaAportes(); form.elements.saldo.value = t > 0 ? valorBR(t) : ""; }
  });
  function abrir(cx = null) {
    editando = cx;
    form.reset();
    erro("#erro-caixinha", "");
    $("#titulo-caixinha").textContent = cx ? `Editar: ${cx.nome}` : "Nova caixinha";
    form.querySelector("[data-cx-dono]").hidden = !casal;
    saldoDigitado = false;
    const ini = cx ? aportesIniciais(cx) : {};
    $("#cx-aportes-campos").innerHTML = pessoas.map((p, i) => `<label class="c3">Aportado por ${esc(p.nome)} (R$)<input name="aporte_${i}" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${ini[p.id] ? valorBR(ini[p.id]) : ""}"></label>`).join("");
    form.elements.aporte_mensal.value = cx && Number(cx.aporte_mensal) > 0 ? valorBR(cx.aporte_mensal) : "";
    form.elements.nome.value = cx ? cx.nome : "";
    form.elements.dono.value = cx ? cx.dono : casal ? "casal" : "pessoal";
    form.elements.tipo.value = cx ? cx.tipo : "recorrente";
    form.elements.meta.value = cx ? valorBR(cx.meta) : "";
    form.elements.data_alvo.value = cx ? cx.data_alvo : "";
    form.elements.divisao.value = cx ? cx.divisao : "renda";
    form.elements.parte.value = cx && cx.parte != null ? String(cx.parte).replace(".", ",") : "50";
    $("#cx-parte-rotulo").textContent = `Parte de ${nomeDe(cx ? cx.perfil_id : dono)} (%)`;
    // Saldo só na criação; depois, pelo Atualizar saldo
    form.querySelector("[data-cx-saldo-inicial]").hidden = !!cx;
    form.elements.saldo.value = "";
    form.elements.saldo_em.value = hojeISO();
    $("#btn-arquivar-caixinha").hidden = !cx;
    mostrarCampos();
    $("#dlg-caixinha").showModal();
    form.elements.nome.focus();
  }
  form.addEventListener("change", mostrarCampos);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const meta = numeroDigitado(form.elements.meta.value);
    if (!form.elements.nome.value.trim()) return erro("#erro-caixinha", "Informe o nome (ex.: IPTU 2027).");
    if (!(meta > 0)) return erro("#erro-caixinha", "Informe a meta (ex.: 3.200,00).");
    if (!form.elements.data_alvo.value) return erro("#erro-caixinha", "Informe a data alvo (quando o dinheiro vai ser usado).");
    const saldo = editando ? null : numeroDigitado(form.elements.saldo.value) || 0;
    if (saldo != null && saldo < 0) return erro("#erro-caixinha", "O saldo não pode ser negativo.");
    const parte = numeroDigitado(form.elements.parte.value);
    const mensal = form.elements.aporte_mensal.value.trim() ? numeroDigitado(form.elements.aporte_mensal.value) : null;
    if (mensal != null && !(mensal > 0)) return erro("#erro-caixinha", "Confira o aporte mensal (ex.: 250,00) ou deixe em branco.");
    const aportes = {};
    for (const [i, p] of pessoas.entries()) {
      const bruto = form.elements[`aporte_${i}`].value.trim();
      const v = bruto ? numeroDigitado(bruto) : 0;
      if (v == null || v < 0) return erro("#erro-caixinha", `Confira o aporte inicial de ${p.nome} (ex.: 1.000,00).`);
      if (v > 0) aportes[p.id] = centavos(v);
    }
    const agora = new Date().toISOString();
    const dados = editando
      ? { ...editando, nome: form.elements.nome.value, dono: casal ? form.elements.dono.value : "pessoal", tipo: form.elements.tipo.value, meta, data_alvo: form.elements.data_alvo.value,
        divisao: form.elements.divisao.value, parte, aporte_mensal: mensal, aportes_iniciais: aportes }
      : { aporte_mensal: mensal, aportes_iniciais: aportes, perfil_id: dono, nome: form.elements.nome.value, dono: casal ? form.elements.dono.value : "pessoal", tipo: form.elements.tipo.value, meta, data_alvo: form.elements.data_alvo.value,
        divisao: form.elements.divisao.value, parte, saldo, saldo_em: form.elements.saldo_em.value || hojeISO(), saldo_atualizado: agora, inicio: hojeISO(), ativa: true };
    const botao = form.querySelector("[type=submit]");
    botao.disabled = true;
    try {
      await salvar(dados);
      $("#dlg-caixinha").close();
      desenhar();
      avisar(editando ? "Caixinha salva." : "Caixinha criada. Ela entra no balanço e na previsão dos próximos meses.");
    } catch (err) {
      erro("#erro-caixinha", "Não foi possível salvar: " + err.message);
    } finally {
      botao.disabled = false;
    }
  });
  const arquivar = async (cx) => {
    if (!cx || !confirm(`Arquivar a caixinha "${cx.nome}"? Ela sai do balanço e da previsão; dá para reativar depois.`)) return;
    try {
      await salvar({ ...cx, ativa: false });
      if ($("#dlg-caixinha").open) $("#dlg-caixinha").close();
      desenhar();
      avisar(`${cx.nome} arquivada.`);
    } catch (err) {
      avisar("Não foi possível arquivar: " + err.message);
    }
  };
  $("#btn-arquivar-caixinha").addEventListener("click", () => arquivar(editando));

  // ---------- atualizar saldo
  const formSaldo = $("#form-cx-saldo");
  formSaldo.addEventListener("submit", async (e) => {
    e.preventDefault();
    const v = numeroDigitado(formSaldo.elements.saldo.value);
    if (v == null || v < 0) return erro("#erro-cx-saldo", "Informe o saldo de hoje no app do banco (ex.: 1.250,00).");
    const botao = formSaldo.querySelector("[type=submit]");
    botao.disabled = true;
    try {
      await salvar({ ...saldoDe, saldo: v, saldo_em: formSaldo.elements.saldo_em.value || hojeISO(), saldo_atualizado: new Date().toISOString() });
      $("#dlg-cx-saldo").close();
      desenhar();
      avisar(`Saldo de ${saldoDe.nome} atualizado.`);
    } catch (err) {
      erro("#erro-cx-saldo", "Não foi possível salvar: " + err.message);
    } finally {
      botao.disabled = false;
    }
  });

  // ---------- guardar (lança o depósito)
  const formG = $("#form-cx-guardar");
  formG.addEventListener("submit", async (e) => {
    e.preventDefault();
    const v = numeroDigitado(formG.elements.valor.value);
    if (!(v > 0)) return erro("#erro-cx-guardar", "Informe quanto guardou (ex.: 300,00).");
    if (!formG.elements.data.value) return erro("#erro-cx-guardar", "Informe a data.");
    const botao = formG.querySelector("[type=submit]");
    botao.disabled = true;
    try {
      await guardar({ caixinha: guardarEm, valor: centavos(v), data: formG.elements.data.value, forma: formG.elements.forma.value });
      $("#dlg-cx-guardar").close();
      desenhar();
      avisar(`${brl(v)} guardados em ${guardarEm.nome}. Saiu do caixa na linha “(−) Caixinhas”.`);
    } catch (err) {
      erro("#erro-cx-guardar", "Não foi possível lançar: " + err.message);
    } finally {
      botao.disabled = false;
    }
  });

  // ---------- botões
  $("#btn-nova-caixinha").addEventListener("click", () => abrir());
  raiz.addEventListener("click", async (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    const x = (k) => LINHAS[Number(b.dataset[k])];
    if (b.dataset.cxEditar != null) abrir(x("cxEditar").cx);
    else if (b.dataset.cxArquivar != null) arquivar(x("cxArquivar").cx);
    else if (b.dataset.cxSaldo != null) {
      const l = x("cxSaldo");
      saldoDe = l.cx;
      formSaldo.reset();
      erro("#erro-cx-saldo", "");
      $("#titulo-cx-saldo").textContent = `Atualizar saldo: ${l.cx.nome}`;
      $("#cx-saldo-calc").textContent = `Pelo site, ela tem ${brl(l.conta.saldo)} hoje (o último saldo informado, mais os depósitos e menos os gastos pagos com ela). Informe o saldo que aparece no app do banco.`;
      formSaldo.elements.saldo.value = valorBR(l.conta.saldo);
      formSaldo.elements.saldo_em.value = hojeISO();
      $("#dlg-cx-saldo").showModal();
      formSaldo.elements.saldo.select();
    } else if (b.dataset.cxGuardar != null) {
      const l = x("cxGuardar");
      guardarEm = l.cx;
      formG.reset();
      erro("#erro-cx-guardar", "");
      $("#titulo-cx-guardar").textContent = `Guardar em: ${l.cx.nome}`;
      const minha = Math.max(0, (l.porPessoa[dono] || 0) - (l.feitoPessoa[dono] || 0));
      $("#cx-guardar-dica").textContent = minha > 0 ? `Sua parte em ${rotuloMes(hojeISO().slice(0, 7))}: ${brl(minha)}${l.feitoPessoa[dono] ? ` (já guardou ${brl(l.feitoPessoa[dono])})` : ""}.` : "Sua parte deste mês já foi guardada.";
      formG.elements.valor.value = minha > 0 ? valorBR(minha) : "";
      formG.elements.data.value = hojeISO();
      $("#dlg-cx-guardar").showModal();
      formG.elements.valor.select();
    } else if (b.dataset.cxPaguei != null) {
      const l = x("cxPaguei");
      const novo = maisUmAno(l.cx.data_alvo);
      if (!confirm(`Pagou ${l.cx.nome}? O saldo volta a zero e a data alvo passa para ${dataBR(novo)}. Se ainda não lançou o pagamento, lance o gasto com “Pago com: caixinha ${l.cx.nome}” (ele não entra nos gastos do mês).`)) return;
      try {
        await salvar({ ...l.cx, saldo: 0, saldo_em: hojeISO(), saldo_atualizado: new Date().toISOString(), inicio: hojeISO(), data_alvo: novo, aportes_iniciais: {} });
        desenhar();
        avisar(`${l.cx.nome}: novo ciclo até ${dataBR(novo)}.`);
      } catch (err) {
        avisar("Não foi possível salvar: " + err.message);
      }
    } else if (b.dataset.cxReativar != null) {
      const cx = ARQUIVADAS.find((c) => c.id === b.dataset.cxReativar);
      if (!cx) return;
      try {
        await salvar({ ...cx, ativa: true });
        desenhar();
        avisar(`${cx.nome} reativada.`);
      } catch (err) {
        avisar("Não foi possível reativar: " + err.message);
      }
    } else if (b.dataset.cxGasto != null && editarGasto) editarGasto(b.dataset.cxGasto);
  });
  desenhar();
  return { desenhar };
}
