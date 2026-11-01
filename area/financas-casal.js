// Visão do casal (Finanças pessoais → Casal): o caixa do mês das duas pessoas que formam casal nas finanças, lado a
// lado e unificado, com os mesmos cálculos dos painéis de cada uma e a classificação feita no site:
//   - os números do topo (entradas, saídas, saldo e investimentos) abrem uma janela com a origem de cada valor;
//   - as entradas dos dois numa lista só;
//   - os gastos pagos no mês dos dois juntos, por categoria (com as subcategorias), por descrição e um a um, com quem
//     gastou, a categoria, o essencial e a conta (o lançamento dividido em categorias entra com cada parte);
//   - os investimentos dos dois (a carteira conjunta e os de cada um): tipos, valor atual, rendimento dos últimos
//     meses, previsão e indicadores para melhorar a carteira.
// Para lançar ou mudar alguma coisa, abre-se o painel de cada uma.
// Nenhum dado pessoal aqui: nomes, valores e investimentos vêm do banco.
import { desenharFinancas } from "./financas-painel.js";
import { lerCategorias } from "./financas-classificacao.js";
import { CLASSES, INDEXADORES, TIPOS, rendeuNoMes, registroAte, resumir, serieMensal, ultimoMes } from "./financas-investimentos.js";
import { textoPrevistoFeito } from "./financas-plano.js";
import { $, esc } from "./ui.js";

const brl = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const n2 = (v) => Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (v, casas = 1) => `${(Number(v || 0) * 100).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: casas })}%`;
const soma = (lista, f = (x) => x) => Math.round(lista.reduce((t, x) => t + (Number(f(x)) || 0), 0) * 100) / 100;
const semAcento = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const rotuloMes = (chave) => `${MESES[Number(chave.slice(5, 7)) - 1]}/${chave.slice(2, 4)}`;
const dBR = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "—");
const dataBR = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");
const hojeISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const chaveDeHoje = () => hojeISO().slice(0, 7);
const primeiro = (p) => String((p && p.nome) || "").trim().split(/\s+/)[0] || "—";
const tipoDe = (id) => TIPOS.find((t) => t.id === id) || TIPOS.at(-1);
const classeDe = (id) => CLASSES.find((c) => c.id === tipoDe(id).classe) || CLASSES.at(-1);
// Mesma descrição em lançamentos diferentes: sem acento, sem "parcela 3/10", sem datas e sem símbolos
const chaveDesc = (s) => semAcento(s).toUpperCase().replace(/\s*-?\s*PARCELA\s*\d+\s*\/\s*\d+\s*$/, "").replace(/\b\d{1,2}\/\d{1,2}\b/g, " ")
  .replace(/[^A-Z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const ROTULO_ESS = (v) => (v === true ? "Essencial" : v === false ? "Não essencial" : "Sem classificação");

// O painel de uma pessoa só para os cálculos (sem desenhar nada), com as preferências e a classificação dela:
// recorrentes do site, gastos a pagar, fixos trocados, previsões do mês, plano de aportes, categorias (e as juntadas),
// ajustes e lançamentos divididos. Usado na visão do casal e, no painel de uma pessoa, para os números da outra.
export async function lerPainelSoCalculo(armazem, p, { planoAporte = null, caixinhas = null } = {}) {
  const registro = await armazem.financas.ler(p.id);
  if (!registro) return null;
  const [gastos, entradas, prefs, ajustes] = await Promise.all([
    armazem.financas.gastos(p.id).catch(() => []),
    armazem.financas.entradas(p.id).catch(() => []),
    armazem.financas.preferencias(p.id).catch(() => null),
    armazem.financas.ajustes(p.id).catch(() => []),
  ]);
  const painel = desenharFinancas({ dados: registro.dados, modo: registro.modo, nome: p.nome, gastosSite: gastos, entradasSite: entradas,
    recorrentes: Array.isArray(prefs && prefs.recorrentes) ? prefs.recorrentes : [], caixa: (prefs && prefs.caixa) || {},
    categorias: lerCategorias(prefs, registro.dados), ajustes, comMeses: true, somenteCalculo: true, planoAporte,
    caixinhas: caixinhas ? { lista: caixinhas.filter((c) => c.dono === "casal" || c.perfil_id === p.id), perfilId: p.id } : null });
  return { registro, prefs, painel, gastos };
}

// pessoas: [{ id, nome, link }], na ordem das colunas
export async function mostrarCasal({ armazem, pessoas }) {
  // Plano de aportes dos dois (sem a tabela no banco, cada painel segue a previsão do mês)
  const planos = await armazem.financas.planosAporte(pessoas.map((p) => p.id)).catch(() => []);
  const caixinhas = await armazem.financas.caixinhas(pessoas.map((p) => p.id)).catch(() => null);
  const lidos = await Promise.all(pessoas.map(async (p) => {
    const base = { ...p, curto: primeiro(p), painel: null, investimentos: [], carteira: null, gastos: [] };
    const lido = await lerPainelSoCalculo(armazem, p, { planoAporte: planos.filter((d) => d.perfil_id === p.id), caixinhas });
    if (!lido) return base;
    const { registro, prefs, painel, gastos } = lido;
    return { ...base, painel, gastos, investimentos: Array.isArray(prefs && prefs.investimentos) ? prefs.investimentos : [], carteira: registro.investimentos || null };
  }));
  // Cada painel conhece o outro: a renda do mês (divisão das caixinhas do casal) e os depósitos dele nas caixinhas
  lidos.forEach((p) => {
    const o = lidos.find((x) => x !== p && x.painel);
    if (p.painel && o) p.painel.definirParceiro({ id: o.id, nome: o.curto, receitas: o.painel.receitasDoMes, gastos: o.gastos, aporte: o.painel.aporteDoMes });
  });
  const comPainel = lidos.filter((p) => p.painel);
  const meses = new Map();
  comPainel.forEach((p) => p.painel.meses().forEach((m) => meses.set(m.chave, m.rotulo)));
  const chaves = [...meses.keys()].sort();
  const hoje = chaveDeHoje();
  let atual = chaves.includes(hoje) ? hoje : chaves.filter((c) => c <= hoje).at(-1) || chaves[0];
  let visao = "categoria"; // gastos do casal: categoria, descricao ou lancamentos
  const filtro = { pessoa: "", cat: "", busca: "" };
  let todasDescricoes = false;
  // A carteira de investimentos conjunta do projeto aparece no painel de quem a tem (resumo e o arquivo completo)
  const resumoCarteira = comPainel.map((p) => p.painel.investimentos).find((i) => i && i.total != null) || null;
  const carteiraProjeto = lidos.map((p) => p.carteira).find((c) => c && Array.isArray(c.posicoes) && c.posicoes.length) || null;

  // Conta como aparece no casal (cada painel guarda "pessoal" para a própria pessoa e "pessoa:<id>" para a outra)
  const nomeConta = (conta, p) => {
    if (!conta || conta === "pessoal") return `Pessoal de ${p.curto}`;
    if (conta.startsWith("pessoa:")) { const o = lidos.find((x) => `pessoa:${x.id}` === conta); return `Pessoal de ${o ? o.curto : "outra pessoa"}`; }
    if (conta === "casal") return "Compartilhado do casal";
    if (conta === "engenharia") return "Engenharia (autônomo)";
    return "Empresas";
  };

  // ---------------------------------------------------------------- dados do mês dos dois
  function doMes() {
    const res = lidos.map((p) => (p.painel ? p.painel.resumo(atual) : null));
    const det = lidos.map((p) => (p.painel ? p.painel.detalhe(atual) : null));
    const entradas = [], gastos = [];
    lidos.forEach((p, i) => {
      if (!det[i]) return;
      det[i].entradas.forEach((e) => entradas.push({ ...e, p }));
      det[i].gastos.forEach((g) => gastos.push({ ...g, p, contaNome: nomeConta(g.conta, p) }));
    });
    return { res, det, entradas, gastos };
  }

  // ---------------------------------------------------------------- investimentos dos dois
  // De quem é cada investimento: "casal" (conjunto dos dois, a conta do casal) ou o id da pessoa (a conta pessoal de quem
  // cadastrou, ou "pessoa:<id>" quando foi cadastrado no painel da outra pessoa)
  const donoDe = (inv, p) => (inv.conta === "casal" ? "casal" : String(inv.conta || "").startsWith("pessoa:") ? inv.conta.slice(7) : p.id);
  const donos = () => ["casal", ...lidos.map((p) => p.id)];
  const curtoDe = (id) => (lidos.find((p) => p.id === id) || {}).curto || "—";
  const nomeDono = (d) => (d === "casal" ? "Conjunto (dos dois)" : `Só de ${curtoDe(d)}`);
  const donoNoTexto = (d) => (d === "casal" ? "o conjunto (dos dois)" : `só o que é de ${curtoDe(d)}`);
  let invVer = "tudo"; // o que a janela dos investimentos mostra: tudo, "casal" ou o id de uma pessoa
  function investimentosDoCasal(ver = "tudo") {
    const todos = [];
    lidos.forEach((p) => p.investimentos.forEach((inv) => todos.push({ inv, p, dono: donoDe(inv, p) })));
    const mes = ultimoMes(todos.map((x) => x.inv), hoje);
    const saldoDe = (x) => (mes ? Number((registroAte(x.inv, mes) || {}).saldo) || 0 : 0);
    const itens = ver === "tudo" ? todos : todos.filter((x) => x.dono === ver);
    const lista = itens.map((x) => x.inv);
    const r = mes ? resumir(lista, mes) : null;
    const porDono = donos().map((d) => {
      const xs = todos.filter((x) => x.dono === d);
      const rr = mes && xs.length ? resumir(xs.map((x) => x.inv), mes) : null;
      return { dono: d, total: soma(xs, saldoDe), n: xs.filter((x) => saldoDe(x) > 0).length, rendeu: rr ? rr.rendeuMes : null, base: rr ? rr.baseMes : 0,
        onde: [...new Set(xs.map((x) => x.p.curto))] };
    });
    const totalTudo = soma(todos, saldoDe);
    const temAlgum = totalTudo > 0;
    const total = temAlgum ? (r ? r.total : 0) : ver === "tudo" && resumoCarteira ? Number(resumoCarteira.total) || 0 : 0;
    return { ver, todos, itens, lista, mes, r, total, totalTudo, porDono, saldoDe, temAlgum, temLista: !!(r && r.itens.length) };
  }

  // ---------------------------------------------------------------- tela
  function desenhar() {
    $("#casal-meses").innerHTML = chaves.map((c) => `<button type="button" class="pilula" data-mes="${esc(c)}"${c === atual ? ' aria-current="page"' : ""}>${esc(meses.get(c))}${c === hoje ? " · agora" : ""}</button>`).join("");
    const { res, entradas, gastos } = doMes();
    const somaR = (f) => res.reduce((t, r) => t + (r ? f(r) : 0), 0);
    // Zero aparece como "nada lançado": a tela avisa que falta o dado, em vez de um R$ 0,00 mudo
    const cel = (r, f, sub = "") => `<td class="r">${r ? (Math.abs(f(r)) < 0.005 ? '<span class="sem">nada lançado</span>' : `${brl(f(r))}${sub ? `<small>${esc(sub(r))}</small>` : ""}`) : '<span class="sem">—</span>'}</td>`;
    const linha = (rotulo, f, sub) => `<tr><th scope="row">${rotulo}</th>${res.map((r) => cel(r, f, sub)).join("")}<td class="r casal-total">${brl(somaR(f))}</td></tr>`;
    const saldo = somaR((r) => r.saldo);
    const saidas = somaR((r) => r.investimento + r.cartao + r.fora + r.fixosFora + (r.caixinhas || 0));
    const comCx = somaR((r) => r.caixinhas || 0) > 0.004;
    const entra = somaR((r) => r.receitas);
    $("#casal-tabela").innerHTML = `
      <thead><tr><th scope="col">${esc(meses.get(atual) || "")}</th>${lidos.map((p) => `<th scope="col" class="r">${esc(p.curto)}</th>`).join("")}<th scope="col" class="r">Casal</th></tr></thead>
      <tbody>
        ${linha("Entradas", (r) => r.receitas)}
        ${linha("(−) Investimento", (r) => r.investimento)}
        ${linha("(−) Fatura do cartão que vence no mês", (r) => r.cartao, (r) => `fatura ${r.fatura}`)}
        ${linha("(−) Gastos fora do cartão (Pix, débito, dinheiro)", (r) => r.fora)}
        ${linha("(−) Fixos fora do cartão", (r) => r.fixosFora)}
        ${comCx ? linha("(−) Caixinhas", (r) => r.caixinhas || 0) : ""}
        <tr class="casal-saldo"><th scope="row">Saldo do mês</th>${res.map((r) => (r ? `<td class="r${r.saldo < 0 ? " neg" : ""}">${brl(r.saldo)}</td>` : '<td class="r"><span class="sem">—</span></td>')).join("")}<td class="r casal-total${saldo < 0 ? " neg" : ""}">${brl(saldo)}</td></tr>
      </tbody>`;
    // Previsto × feito dos aportes no mês (plano de aportes ou previsão do mês de cada painel); só do mês atual em diante
    const aps = lidos.map((p, i) => (res[i] && res[i].aporte ? { p, a: res[i].aporte } : null)).filter((x) => x && (x.a.previsto > 0 || x.a.feito > 0));
    $("#casal-aportes").hidden = atual < hoje || !aps.length;
    $("#casal-aportes").innerHTML = aps.length ? `<b>Aportes de ${esc(meses.get(atual) || "")}</b> (previsto × feito): ${aps.map(({ p, a }) => {
      const ok = a.previsto > 0 && a.feito >= a.previsto - 0.005;
      return `<span class="${ok ? "ok" : ""}">${esc(p.curto)} ${esc(textoPrevistoFeito(a.feito, a.previsto))}${a.plano ? "" : " · previsão do mês"}</span>`;
    }).join(" · ")}` : "";
    const inv = investimentosDoCasal();
    const kpis = [
      ["entradas", "Entradas do casal", brl(entra), `${meses.get(atual)} · ${lidos.map((p, i) => `${p.curto} ${res[i] ? brl(res[i].receitas) : "—"}`).join(" · ")}`],
      ["saidas", "Saídas do casal", brl(saidas), `faturas que vencem, Pix, fixos e investimento${comCx ? " e caixinhas" : ""}`],
      ["saldo", "Saldo do casal", brl(saldo), saldo < 0 ? "faltam para fechar o mês" : "sobra no mês"],
      ...(inv.temAlgum || resumoCarteira ? [["investimentos", "Investimentos", brl(inv.total),
        inv.temAlgum ? inv.porDono.map((o) => `${o.dono === "casal" ? "Conjunto" : `só de ${curtoDe(o.dono)}`} ${brl(o.total)}`).join(" · ") : resumoCarteira.data ? `carteira em ${dBR(resumoCarteira.data)}` : "carteira conjunta"]] : []),
    ];
    $("#casal-kpis").innerHTML = kpis.map(([k, t, v, s]) => `<button type="button" class="kpi kpi-botao casal-kpi" data-casal-kpi="${k}" aria-haspopup="dialog">
        <span class="kpi-rotulo">${esc(t)}</span><strong class="kpi-valor${k === "saldo" && saldo < 0 ? " neg" : ""}">${v}</strong><small>${esc(s || "")}</small><span class="casal-kpi-ver">ver de onde vem</span></button>`).join("");
    desenharCaixinhas();
    desenharEntradas(entradas);
    desenharGastos(gastos);
    $("#casal-links").innerHTML = lidos.map((p) => `<a class="btn btn-claro" href="${esc(p.link)}">Abrir o painel de ${esc(p.curto)}</a>`).join("");
    const dlg = $("#dlg-casal");
    if (dlg && dlg.open && dlg.dataset.kpi) abrirKpi(dlg.dataset.kpi);
  }

  // Caixinhas do casal: quanto está guardado, quanto guardar por mês e quanto cabe a cada um no mês atual
  function desenharCaixinhas() {
    const box = $("#casal-caixinhas");
    const ref = lidos.find((p) => p.painel);
    if (!box || !caixinhas || !ref) { if (box) box.hidden = true; return; }
    const linhas = ref.painel.estadoCaixinhas().linhas.filter((x) => x.cx.dono === "casal");
    box.hidden = !linhas.length;
    if (!linhas.length) return;
    const tot = (f) => soma(linhas, f);
    const atrasadas = linhas.filter((x) => x.conta.alerta);
    box.innerHTML = `<div class="casal-bloco-topo"><h2>Caixinhas do casal</h2><span class="num">${brl(tot((x) => x.conta.saldo))} guardados · ${brl(tot((x) => x.conta.porMes))} por mês</span></div>
      <p class="sub">Em ${esc(rotuloMes(hoje))}, cada um guarda: ${lidos.map((p) => { const deve = tot((x) => x.porPessoa[p.id] || 0), fez = tot((x) => x.feitoPessoa[p.id] || 0);
        return `<b>${esc(p.curto)}</b> ${brl(deve)}${fez > 0 ? ` (guardou ${brl(fez)}${deve - fez > 0.004 ? `, faltam ${brl(deve - fez)}` : " ✓"})` : ""}`; }).join(" · ")}.</p>
      <ul class="casal-cx">${linhas.map((x) => `<li><span>${esc(x.cx.nome)}<small>${brl(x.conta.saldo)} de ${brl(x.cx.meta)} · até ${dataBR(x.cx.data_alvo)}${x.conta.situacao === "atrasada" ? " · atrasada" : x.conta.situacao === "completa" ? " · completa" : ""}</small></span>
        <span class="casal-cx-barra" role="img" aria-label="${Math.round(x.conta.progresso * 100)}% da meta"><i style="width:${(x.conta.progresso * 100).toFixed(1)}%"></i></span><span class="num">${brl(x.conta.porMes)}/mês</span></li>`).join("")}</ul>
      ${atrasadas.length ? `<p class="casal-cx-alerta"><b>Atenção:</b> ${atrasadas.map((x) => `${esc(x.cx.nome)} está atrasada e faltam ${x.conta.mesesAte <= 0 ? "menos de um mês" : `${x.conta.mesesAte} ${x.conta.mesesAte === 1 ? "mês" : "meses"}`} para a data`).join("; ")}.</p>` : ""}
      <p class="dica">Para guardar, atualizar o saldo ou criar uma caixinha, abra a aba Caixinhas no painel de cada um.</p>`;
  }

  // Entradas dos dois numa lista só
  function desenharEntradas(entradas) {
    const total = soma(entradas, (e) => e.valor);
    const rec = soma(entradas.filter((e) => !e.previsto), (e) => e.valor);
    const porPessoa = lidos.map((p) => [p, soma(entradas.filter((e) => e.p === p), (e) => e.valor)]);
    const ordem = [...entradas].sort((a, b) => String(a.data || "9").localeCompare(String(b.data || "9")) || b.valor - a.valor);
    $("#casal-entradas").innerHTML = `
      <div class="casal-bloco-topo"><h2>Entradas do casal em ${esc(meses.get(atual) || "")}</h2><span class="num">${brl(total)}</span></div>
      <p class="sub">Recebido ${brl(rec)} · previsto ${brl(total - rec)}${total ? ` · ${porPessoa.map(([p, v]) => `${esc(p.curto)} ${brl(v)} (${pct(v / total, 0)})`).join(" · ")}` : ""}</p>
      ${ordem.length ? `<div class="tabela-wrap"><table class="tabela casal-unif">
        <thead><tr><th>Data</th><th>Entrada</th><th>De quem</th><th>Situação</th><th class="r">Valor</th></tr></thead>
        <tbody>${ordem.map((e) => `<tr><td class="num">${dBR(e.data)}</td><td>${esc(e.desc)}<small>${esc([e.tipo, e.ref ? `trabalho de ${rotuloMes(e.ref)}` : "", e.origem].filter(Boolean).join(" · "))}</small></td>
          <td>${esc(e.p.curto)}</td><td>${e.previsto ? '<span class="etiqueta etiqueta-prev">prevista</span>' : '<span class="etiqueta etiqueta-ok">recebida</span>'}</td><td class="r num">${n2(e.valor)}</td></tr>`).join("")}</tbody>
        <tfoot>${porPessoa.map(([p, v]) => `<tr><th colspan="4">${esc(p.curto)}</th><td class="r num">${n2(v)}</td></tr>`).join("")}<tr class="casal-saldo"><th colspan="4">Casal</th><td class="r num">${n2(total)}</td></tr></tfoot>
      </table></div>
      <p class="dica">Para dar uma entrada prevista como recebida, abra o painel de quem recebe: no balanço do mês, o botão ✓ Recebida.</p>`
      : `<p class="sem">Nenhuma entrada neste mês.</p>`}`;
  }

  // Gastos pagos no mês dos dois: resumo (essencial e por conta) e três visões
  function desenharGastos(gastos) {
    const total = soma(gastos, (g) => g.valor);
    const colunas = (lista) => lidos.map((p) => soma(lista.filter((g) => g.p === p), (g) => g.valor));
    const ess = [true, false, null].map((v) => [ROTULO_ESS(v), soma(gastos.filter((g) => (g.essencial ?? null) === v), (g) => g.valor), v]).filter(([, v]) => v > 0.004);
    const contas = new Map();
    gastos.forEach((g) => contas.set(g.contaNome, (contas.get(g.contaNome) || 0) + g.valor));
    const corEss = { true: "#2a78d6", false: "#eb6834", null: "#c9ccd1" };
    const visoes = [["categoria", "Por categoria"], ["descricao", "Por descrição"], ["lancamentos", "Todos os lançamentos"]];
    let corpo = "";
    if (!gastos.length) corpo = '<p class="sem">Nenhum gasto pago neste mês.</p>';
    else if (visao === "categoria") corpo = htmlPorCategoria(gastos, total, colunas);
    else if (visao === "descricao") corpo = htmlPorDescricao(gastos, colunas);
    else corpo = htmlLancamentos(gastos);
    $("#casal-gastos").innerHTML = `
      <div class="casal-bloco-topo"><h2>Gastos pagos do casal em ${esc(meses.get(atual) || "")}</h2><span class="num">${brl(total)}</span></div>
      <p class="sub">As faturas que vencem no mês, o Pix, o débito, o dinheiro e os fixos fora do cartão dos dois, sem o investimento${total ? ` · ${lidos.map((p, i) => `${esc(p.curto)} ${brl(colunas(gastos)[i])}`).join(" · ")}` : ""}.</p>
      ${gastos.length ? `<div class="casal-resumo-g">
        <div><div class="casal-mini-rot">Essencial e não essencial</div>
          <div class="casal-barra" role="img" aria-label="${esc(ess.map(([t, v]) => `${t} ${brl(v)}`).join(", "))}">${ess.map(([, v, k]) => `<span style="width:${(v / total * 100).toFixed(2)}%;background:${corEss[k]}"></span>`).join("")}</div>
          <div class="casal-legenda">${ess.map(([t, v, k]) => `<span><i style="background:${corEss[k]}"></i>${esc(t)} <b class="num">${brl(v)}</b> (${pct(v / total, 0)})</span>`).join("")}</div></div>
        <div><div class="casal-mini-rot">Por conta (de quem é o dinheiro)</div>
          <table class="casal-mini"><tbody>${[...contas.entries()].sort((a, b) => b[1] - a[1]).map(([c, v]) => `<tr><td>${esc(c)}</td><td class="r num">${n2(v)}</td><td class="r num sem">${pct(v / total, 0)}</td></tr>`).join("")}</tbody></table></div>
      </div>
      <div class="casal-visoes" role="group" aria-label="Como ver os gastos">${visoes.map(([k, t]) => `<button type="button" class="pilula" data-visao="${k}" aria-pressed="${visao === k}">${t}</button>`).join("")}</div>` : ""}
      <div id="casal-g-corpo">${corpo}</div>`;
  }

  // Por categoria: os dois lado a lado, cada categoria abre nas subcategorias e nos lançamentos
  const ABERTAS = new Set();
  function htmlPorCategoria(gastos, total, colunas) {
    const porCat = new Map();
    gastos.forEach((g) => { const l = porCat.get(g.cat) || []; l.push(g); porCat.set(g.cat, l); });
    const cats = [...porCat.entries()].sort((a, b) => soma(b[1], (g) => g.valor) - soma(a[1], (g) => g.valor));
    const maxc = Math.max(1, ...cats.map(([, l]) => soma(l, (g) => g.valor)));
    const cab = `<div class="cg-cab"><span>Categoria</span>${lidos.map((p) => `<span class="r">${esc(p.curto)}</span>`).join("")}<span class="r">Casal</span><span class="r">%</span></div>`;
    const valores = (lista) => `${colunas(lista).map((v) => `<span class="r num">${v ? n2(v) : "—"}</span>`).join("")}<span class="r num cg-tot">${n2(soma(lista, (g) => g.valor))}</span><span class="r num sem">${pct(soma(lista, (g) => g.valor) / total, 0)}</span>`;
    const item = (g) => `<li><span>${esc(g.desc)}${g.parte ? ` <span class="etiqueta">parte ${esc(g.parte)}</span>` : ""}<small>${esc([g.p.curto, g.data ? dBR(g.data) : "", g.grupo, g.parcela ? `parcela ${g.parcela}` : "", g.contaNome, ROTULO_ESS(g.essencial)].filter(Boolean).join(" · "))}</small></span><span class="num">${n2(g.valor)}</span></li>`;
    return `<div class="cg" style="--cg-n:${lidos.length}">${cab}${cats.map(([cat, lista]) => {
      const subs = new Map();
      lista.forEach((g) => { const k = g.sub || ""; const l = subs.get(k) || []; l.push(g); subs.set(k, l); });
      const ordem = [...subs.entries()].sort((a, b) => (a[0] === "") - (b[0] === "") || soma(b[1], (g) => g.valor) - soma(a[1], (g) => g.valor));
      const so = ordem.length === 1 && ordem[0][0] === "";
      const itens = (l) => `<ul class="cg-itens">${[...l].sort((a, b) => b.valor - a.valor).map(item).join("")}</ul>`;
      const corpo = so ? itens(lista) : ordem.map(([sub, l]) => `<details class="cg-sub"${ABERTAS.has(`${cat}|${sub}`) ? " open" : ""} data-cg="${esc(`${cat}|${sub}`)}"><summary class="cg-linha"><span>${esc(sub || "Sem subcategoria")} <span class="sem">(${l.length})</span></span>${valores(l)}</summary>${itens(l)}</details>`).join("");
      return `<details class="cg-cat"${ABERTAS.has(cat) ? " open" : ""} data-cg="${esc(cat)}"><summary class="cg-linha"><span><b>${esc(cat)}</b> <span class="sem">(${lista.length})</span><span class="cg-trilha"><span style="width:${(soma(lista, (g) => g.valor) / maxc * 100).toFixed(1)}%"></span></span></span>${valores(lista)}</summary>
        <div class="cg-corpo">${corpo}</div></details>`;
    }).join("")}<div class="cg-linha cg-total"><span>Total</span>${valores(gastos)}</div></div>`;
  }

  // Por descrição: a mesma loja ou o mesmo serviço juntos, dos dois
  function htmlPorDescricao(gastos, colunas) {
    const grupos = new Map();
    gastos.forEach((g) => { const k = chaveDesc(g.desc) || g.desc; const o = grupos.get(k) || { itens: [], nomes: new Map(), cats: new Map() }; o.itens.push(g);
      o.nomes.set(g.desc, (o.nomes.get(g.desc) || 0) + 1); o.cats.set(g.cat, (o.cats.get(g.cat) || 0) + g.valor); grupos.set(k, o); });
    const lista = [...grupos.values()].map((o) => ({ ...o, nome: [...o.nomes.entries()].sort((a, b) => b[1] - a[1])[0][0], cat: [...o.cats.entries()].sort((a, b) => b[1] - a[1])[0][0], total: soma(o.itens, (g) => g.valor) }))
      .sort((a, b) => b.total - a.total);
    const corta = !todasDescricoes && lista.length > 40;
    const ver = corta ? lista.slice(0, 40) : lista;
    return `<div class="tabela-wrap"><table class="tabela casal-unif">
      <thead><tr><th>Descrição</th><th>Categoria</th><th class="r">Lanç.</th>${lidos.map((p) => `<th class="r">${esc(p.curto)}</th>`).join("")}<th class="r">Casal</th></tr></thead>
      <tbody>${ver.map((o) => `<tr><td>${esc(o.nome)}${o.nomes.size > 1 ? `<small>${o.nomes.size} descrições parecidas</small>` : ""}</td><td>${esc(o.cat)}${o.cats.size > 1 ? "<small>e outras</small>" : ""}</td><td class="r num">${o.itens.length}</td>
        ${colunas(o.itens).map((v) => `<td class="r num">${v ? n2(v) : "—"}</td>`).join("")}<td class="r num casal-total">${n2(o.total)}</td></tr>`).join("")}</tbody></table></div>
      ${corta ? `<button type="button" class="btn btn-claro" data-todas-desc>Mostrar todas as ${lista.length} descrições</button>` : ""}`;
  }

  // Todos os lançamentos dos dois, com filtro por pessoa, categoria e texto
  function htmlLancamentos(gastos) {
    const cats = [...new Set(gastos.map((g) => g.cat))].sort((a, b) => a.localeCompare(b));
    const q = semAcento(filtro.busca.trim());
    const lista = gastos.filter((g) => (!filtro.pessoa || g.p.id === filtro.pessoa) && (!filtro.cat || g.cat === filtro.cat)
      && (!q || semAcento(`${g.desc} ${g.cat} ${g.sub || ""} ${g.contaNome} ${g.grupo}`).includes(q)))
      .sort((a, b) => String(b.data || "").localeCompare(String(a.data || "")) || b.valor - a.valor);
    return `<div class="casal-filtros">
        <label>Quem<select data-filtro="pessoa"><option value="">Os dois</option>${lidos.map((p) => `<option value="${esc(p.id)}"${filtro.pessoa === p.id ? " selected" : ""}>${esc(p.curto)}</option>`).join("")}</select></label>
        <label>Categoria<select data-filtro="cat"><option value="">Todas</option>${cats.map((c) => `<option value="${esc(c)}"${filtro.cat === c ? " selected" : ""}>${esc(c)}</option>`).join("")}</select></label>
        <label class="casal-busca">Buscar<input type="search" data-filtro="busca" value="${esc(filtro.busca)}" placeholder="loja, categoria, conta"></label>
      </div>
      <div class="tabela-wrap"><table class="tabela casal-unif">
        <thead><tr><th>Data</th><th>Lançamento</th><th>Quem</th><th>Categoria</th><th>Tipo e conta</th><th class="r">Valor</th></tr></thead>
        <tbody>${lista.map((g) => `<tr><td class="num">${dBR(g.data)}</td><td>${esc(g.desc)}${g.parte ? ` <span class="etiqueta">parte ${esc(g.parte)}</span>` : ""}<small>${esc([g.grupo, g.parcela ? `parcela ${g.parcela}` : ""].filter(Boolean).join(" · "))}</small></td>
          <td>${esc(g.p.curto)}</td><td>${esc(g.cat)}${g.sub ? `<small>${esc(g.sub)}</small>` : ""}</td><td>${esc(ROTULO_ESS(g.essencial))}<small>${esc(g.contaNome)}</small></td><td class="r num">${n2(g.valor)}</td></tr>`).join("") || '<tr><td colspan="6" class="sem">Nenhum lançamento com esses filtros.</td></tr>'}</tbody>
        <tfoot><tr class="casal-saldo"><th colspan="5">${lista.length} ${lista.length === 1 ? "lançamento" : "lançamentos"}</th><td class="r num">${n2(soma(lista, (g) => g.valor))}</td></tr></tfoot>
      </table></div>`;
  }

  // ---------------------------------------------------------------- janelas dos números do topo
  function abrirKpi(k) {
    const dlg = $("#dlg-casal");
    if (!dlg) return;
    const { res, det, entradas, gastos } = doMes();
    const titulos = { entradas: "Entradas do casal", saidas: "Saídas do casal", saldo: "Saldo do casal", investimentos: "Investimentos do casal" };
    const corpo = k === "entradas" ? htmlKpiEntradas(entradas) : k === "saidas" ? htmlKpiSaidas(det, gastos) : k === "saldo" ? htmlKpiSaldo(res, det) : htmlKpiInvestimentos(res);
    dlg.dataset.kpi = k;
    dlg.innerHTML = `<div class="dlg-cab"><h2 id="titulo-casal">${titulos[k]}${k === "investimentos" ? "" : ` · ${esc(meses.get(atual) || "")}`}</h2><button class="btn-link" type="button" data-fechar>Fechar</button></div>
      <div class="dlg-corpo casal-dlg">${corpo}</div>
      <div class="dlg-rodape">${lidos.map((p) => `<a class="btn btn-claro" href="${esc(p.link)}">Painel de ${esc(p.curto)}</a>`).join("")}<button class="btn btn-primary" type="button" data-fechar>Fechar</button></div>`;
    if (!dlg.open) dlg.showModal();
  }
  const blocoKpis = (lista) => `<div class="casal-dlg-kpis">${lista.map(([t, v, s]) => `<div><span class="casal-mini-rot">${esc(t)}</span><b class="num">${v}</b>${s ? `<small>${s}</small>` : ""}</div>`).join("")}</div>`;

  function htmlKpiEntradas(entradas) {
    const total = soma(entradas, (e) => e.valor);
    return `${blocoKpis([["Total", brl(total)], ["Recebido", brl(soma(entradas.filter((e) => !e.previsto), (e) => e.valor))], ["Previsto", brl(soma(entradas.filter((e) => e.previsto), (e) => e.valor))]])}
      <p class="sub">De onde vem: as entradas de cada painel no mês (salário, outros recebimentos e as que repetem todo mês). Transferências entre vocês não entram como entrada.</p>
      ${lidos.map((p) => {
        const doP = entradas.filter((e) => e.p === p);
        const v = soma(doP, (e) => e.valor);
        return `<div class="casal-dlg-pessoa"><h3>${esc(p.curto)} <span class="num">${brl(v)}${total ? ` · ${pct(v / total, 0)}` : ""}</span></h3>
          ${doP.length ? `<table class="casal-mini"><tbody>${doP.map((e) => `<tr><td>${esc(e.desc)}<small>${esc([dBR(e.data), e.tipo, e.origem].join(" · "))}</small></td><td>${e.previsto ? "prevista" : "recebida"}</td><td class="r num">${n2(e.valor)}</td></tr>`).join("")}</tbody></table>`
            : `<p class="sem">${p.painel ? "Nenhuma entrada neste mês." : "Painel ainda não importado."}</p>`}</div>`;
      }).join("")}`;
  }

  function htmlKpiSaidas(det, gastos) {
    const tipos = [["fatura", "Fatura do cartão que vence no mês"], ["dia", "Pix, débito e dinheiro"], ["fixo", "Fixos fora do cartão"], ["investimento", "Investimento"], ["caixinha", "Caixinhas"]];
    const todas = det.flatMap((d, i) => (d ? d.saidas.map((s) => ({ ...s, p: lidos[i] })) : []));
    const total = soma(todas, (s) => s.valor);
    const topCats = [...gastos.reduce((m, g) => m.set(g.cat, (m.get(g.cat) || 0) + g.valor), new Map()).entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    return `${blocoKpis([["Total", brl(total)], ["Pago", brl(soma(todas.filter((s) => !s.previsto), (s) => s.valor))], ["A pagar e previsto", brl(soma(todas.filter((s) => s.previsto), (s) => s.valor))]])}
      <p class="sub">De onde vem: o que sai da conta de cada um no mês, pelo fluxo de caixa de cada painel.</p>
      <div class="tabela-wrap"><table class="tabela casal-unif"><thead><tr><th>Tipo de saída</th>${lidos.map((p) => `<th class="r">${esc(p.curto)}</th>`).join("")}<th class="r">Casal</th></tr></thead>
        <tbody>${tipos.map(([t, nome]) => `<tr><td>${nome}</td>${lidos.map((p) => `<td class="r num">${n2(soma(todas.filter((s) => s.p === p && s.tipo === t), (s) => s.valor))}</td>`).join("")}<td class="r num casal-total">${n2(soma(todas.filter((s) => s.tipo === t), (s) => s.valor))}</td></tr>`).join("")}</tbody></table></div>
      ${topCats.length ? `<h3>Maiores categorias dos gastos pagos</h3><table class="casal-mini"><tbody>${topCats.map(([c, v]) => `<tr><td>${esc(c)}</td><td class="r num">${n2(v)}</td></tr>`).join("")}</tbody></table>` : ""}
      ${lidos.map((p) => {
        const doP = todas.filter((s) => s.p === p);
        return doP.length ? `<details class="casal-dlg-det"><summary>Saídas de ${esc(p.curto)} uma a uma (${doP.length}) · ${brl(soma(doP, (s) => s.valor))}</summary>
          <table class="casal-mini"><tbody>${doP.map((s) => `<tr><td>${esc(s.desc)}<small>${esc([dBR(s.data), tipos.find(([t]) => t === s.tipo)[1]].join(" · "))}</small></td><td>${s.aPagar ? "a pagar" : s.previsto ? "prevista" : "paga"}</td><td class="r num">${n2(s.valor)}</td></tr>`).join("")}</tbody></table></details>` : "";
      }).join("")}`;
  }

  function htmlKpiSaldo(res, det) {
    const col = (f) => res.map((r, i) => (r && det[i] ? f(r, det[i]) : null));
    const linha = (rotulo, f, cls = "") => { const vs = col(f); return `<tr class="${cls}"><th scope="row">${rotulo}</th>${vs.map((v) => `<td class="r num${v < 0 ? " neg" : ""}">${v == null ? "—" : n2(v)}</td>`).join("")}<td class="r num casal-total${soma(vs) < 0 ? " neg" : ""}">${n2(soma(vs))}</td></tr>`; };
    const entra = soma(col((r) => r.receitas)), sai = soma(col((r) => r.investimento + r.cartao + r.fora + r.fixosFora)), gastosM = soma(col((r) => r.cartao + r.fora + r.fixosFora));
    const realizado = soma(col((r, d) => d.ent.realizado - d.sai.realizado));
    return `${blocoKpis([["Saldo do mês", brl(entra - sai)], ["Comprometido", entra ? pct(sai / entra, 0) : "—", "das entradas vai para gastos e investimento"], ["Até hoje", brl(realizado), "entrou menos saiu, só o realizado"]])}
      <p class="sub">Balanço resumido: entradas menos saídas de cada um no mês (sem o saldo que já estava na conta no começo do mês).</p>
      <div class="tabela-wrap"><table class="tabela casal-tabela"><thead><tr><th></th>${lidos.map((p) => `<th class="r">${esc(p.curto)}</th>`).join("")}<th class="r">Casal</th></tr></thead><tbody>
        ${linha("Entradas recebidas", (r, d) => d.ent.realizado)}
        ${linha("Entradas previstas", (r, d) => d.ent.previsto)}
        ${linha("(−) Gastos pagos no mês", (r) => r.cartao + r.fora + r.fixosFora)}
        ${linha("(−) Investimento", (r) => r.investimento)}
        ${linha("(=) Saldo do mês", (r) => r.saldo, "casal-saldo")}
      </tbody></table></div>
      <ul class="casal-notas">
        ${entra ? `<li>Os gastos pagos são ${pct(gastosM / entra, 0)} das entradas do casal e o investimento, ${pct((sai - gastosM) / entra, 0)}.</li>` : ""}
        ${lidos.map((p, i) => (res[i] ? `<li>${esc(p.curto)}: ${res[i].saldo < 0 ? `faltam ${brl(-res[i].saldo)}` : `sobram ${brl(res[i].saldo)}`} no mês.</li>` : "")).join("")}
      </ul>`;
  }

  // Investimentos dos dois: de quem é cada parte (conjunto, só de um, só do outro), e do que estiver selecionado o valor
  // atual, rendimento, classe e indexador, evolução dos últimos meses, previsão, indicadores e a lista um a um
  function htmlKpiInvestimentos(res) {
    const tudo = investimentosDoCasal("tudo");
    if (!tudo.temAlgum && !carteiraProjeto) return '<p class="sem">Nenhum investimento cadastrado ainda. Cadastre na aba Investimentos do painel de cada um.</p>';
    if (invVer !== "tudo" && !donos().includes(invVer)) invVer = "tudo";
    const inv = investimentosDoCasal(invVer);
    const PJ = (carteiraProjeto && carteiraProjeto.projecao) || {};
    const pessoasAporte = carteiraProjeto && carteiraProjeto.aportes_mensais ? Object.values(carteiraProjeto.aportes_mensais).reduce((t, v) => t + (Number(v) || 0), 0) : 0;
    const aporteMetas = soma(lidos, (p) => (p.painel && p.painel.metas ? p.painel.metas.investimento_mensal : 0));
    const aporteCasal = aporteMetas || pessoasAporte || (Number(PJ.aporte_base_por_pessoa) || 0) * lidos.length;
    // O aporte mensal previsto (Cadastros e carteira do projeto) é do casal: entra em Tudo e no Conjunto
    const aporte = invVer === "tudo" || invVer === "casal" ? aporteCasal : 0;
    const investidoMes = soma(res.map((r) => (r ? r.investimento : 0)));
    const blocos = [];
    const total = inv.total;
    const r = inv.r;
    // De quem é cada parte: sempre o casal inteiro, cada quadro escolhe o que a janela mostra
    if (tudo.temAlgum) {
      const T = tudo.totalTudo;
      const quadro = (ver, titulo, valor, linhas) => `<button type="button" class="casal-dono casal-dono-${ver === "tudo" ? "tudo" : ver === "casal" ? "casal" : "pessoa"}" data-inv-ver="${esc(ver)}" aria-pressed="${invVer === ver}">
          <span class="casal-mini-rot">${esc(titulo)}</span><b class="num">${brl(valor)}</b>${linhas.filter(Boolean).map((l) => `<small>${l}</small>`).join("")}</button>`;
      const rendeuTxt = (o) => (o.rendeu != null ? `rendeu ${brl(o.rendeu)} no mês${o.base > 0 ? ` (${pct(o.rendeu / o.base, 2)})` : ""}` : "");
      const conj = tudo.porDono.find((o) => o.dono === "casal");
      const metade = conj ? conj.total / 2 : 0;
      blocos.push(`<h3>De quem é cada parte</h3>
        <div class="casal-donos">
          ${quadro("tudo", "Tudo, os dois juntos", T, [`${tudo.porDono.reduce((t, o) => t + o.n, 0)} investimentos`, tudo.mes ? `saldos de ${rotuloMes(tudo.mes)}` : ""])}
          ${tudo.porDono.map((o) => quadro(o.dono, nomeDono(o.dono), o.total, o.n
            ? [`${pct(T ? o.total / T : 0, 0)} do total · ${o.n} ${o.n === 1 ? "investimento" : "investimentos"}`, o.dono === "casal" ? `dos dois · cadastrados no painel de ${o.onde.join(" e ")}` : `no nome só de ${esc(curtoDe(o.dono))}`, rendeuTxt(o)]
            : [o.dono === "casal" ? "nenhum investimento conjunto" : `nenhum investimento só no nome de ${esc(curtoDe(o.dono))}`])).join("")}
        </div>
        ${conj && conj.total ? `<p class="sub">Parte de cada um no total, contando o conjunto meio a meio: ${lidos.map((p) => { const so = (tudo.porDono.find((o) => o.dono === p.id) || {}).total || 0; return `<b>${esc(p.curto)} ${brl(so + metade)}</b> (só de ${esc(p.curto)} ${brl(so)} + metade do conjunto ${brl(metade)})`; }).join(" · ")}.</p>` : ""}
        <p class="casal-mostrando">Mostrando abaixo: <b>${esc(invVer === "tudo" ? "tudo, os dois juntos" : donoNoTexto(invVer))}</b>. Toque num quadro para trocar.</p>`);
    }
    if (invVer !== "tudo" && !inv.temLista) {
      blocos.push(`<p class="sem">${invVer === "casal" ? "Nenhum investimento conjunto cadastrado." : `Nenhum investimento só no nome de ${esc(curtoDe(invVer))}. Para cadastrar, use Novo investimento na aba Investimentos do painel de ${esc(curtoDe(invVer))} e deixe a conta "Só de ${esc(curtoDe(invVer))}".`}</p>`);
      return blocos.join("");
    }
    // Valor atual, rendimento e aporte do que está selecionado
    const rendMesPct = r && r.rendeuMes != null && r.baseMes > 0 ? r.rendeuMes / r.baseMes : null;
    const P = carteiraProjeto ? carteiraProjeto.posicoes.at(-1) : null;
    blocos.push(blocoKpis([
      ["Valor atual", brl(total), inv.temLista ? `saldos de ${rotuloMes(inv.mes)}${r.data ? `, atualizados em ${dataBR(r.data)}` : ""}` : P && P.data ? `carteira em ${dataBR(P.data)}` : ""],
      ["Rendeu no último mês", r && r.rendeuMes != null ? brl(r.rendeuMes) : "—", rendMesPct != null ? `${pct(rendMesPct, 2)} sobre o aplicado` : "precisa do saldo de dois meses seguidos"],
      ["Rendeu no ano", r && r.rendeuAno != null ? brl(r.rendeuAno) : invVer !== "tudo" ? "—" : P && P.rendimento_ano != null ? brl(P.rendimento_ano) : "—",
        invVer === "tudo" && P && P.rentab_ano_pct != null ? `carteira: ${String(P.rentab_ano_pct).replace(".", ",")}% no ano${P.pct_cdi_ano != null ? ` · ${String(P.pct_cdi_ano).replace(".", ",")}% do CDI` : ""}` : ""],
      ["Aporte mensal previsto", aporte ? brl(aporte) : "—", invVer === "tudo" || invVer === "casal" ? `${investidoMes ? `${brl(investidoMes)} no caixa de ${esc(meses.get(atual) || "")}` : "nada lançado no mês"}` : "o aporte previsto é do casal (Tudo e Conjunto)"],
    ]));
    if (inv.temLista) {
      const barras = (lista, nome, cor) => `<div class="casal-barras">${lista.map((o) => `<div class="casal-barra-linha"><span>${esc(nome(o))}</span><span class="casal-barra-trilha"><span style="width:${(o.parte * 100).toFixed(1)}%;background:${cor(o)}"></span></span><span class="num">${brl(o.saldo)}</span><span class="num sem">${pct(o.parte, 0)}</span></div>`).join("")}</div>`;
      blocos.push(`<div class="casal-dlg-grade">
        <div><h3>Por classe</h3>${barras(r.porClasse, (o) => (CLASSES.find((c) => c.id === o.id) || CLASSES.at(-1)).nome, (o) => (CLASSES.find((c) => c.id === o.id) || CLASSES.at(-1)).cor)}</div>
        <div><h3>Por indexador</h3>${barras(r.porIndexador, (o) => ({ ...INDEXADORES, nao: "Não informado" })[o.id] || o.id, () => "#5f646b")}</div>
      </div>`);
      // Evolução dos últimos 12 meses (em Tudo, com a parte de cada dono)
      const serie = serieMensal(inv.lista, inv.mes, 12).filter((x) => x.saldo > 0 || x.rendeu != null);
      const colunasDono = invVer === "tudo" ? donos().filter((d) => tudo.todos.some((x) => x.dono === d)) : [];
      const saldoDoDono = (d, mes) => soma(tudo.todos.filter((x) => x.dono === d), (x) => Number((registroAte(x.inv, mes) || {}).saldo) || 0);
      blocos.push(`<h3>Evolução e rentabilidade dos últimos meses</h3>
        ${serie.length > 1 ? "" : '<p class="dica">Por enquanto há saldo de um mês só. A rentabilidade mês a mês aparece conforme os saldos forem atualizados todo mês (aba Investimentos do painel → Atualizar saldos).</p>'}
        <div class="tabela-wrap"><table class="tabela casal-unif"><thead><tr><th>Mês</th>${colunasDono.map((d) => `<th class="r">${esc(d === "casal" ? "Conjunto" : `Só de ${curtoDe(d)}`)}</th>`).join("")}<th class="r">${colunasDono.length ? "Total" : "Valor"}</th><th class="r">Rendeu</th><th class="r">% no mês</th></tr></thead>
        <tbody>${serie.map((x) => { const base = x.rendeu != null ? x.saldo - x.rendeu : 0; return `<tr><td>${rotuloMes(x.mes)}</td>${colunasDono.map((d) => `<td class="r num">${n2(saldoDoDono(d, x.mes))}</td>`).join("")}<td class="r num casal-total">${n2(x.saldo)}</td>
          <td class="r num">${x.rendeu != null ? n2(x.rendeu) : "—"}</td><td class="r num">${x.rendeu != null && base > 0 ? pct(x.rendeu / base, 2) : "—"}</td></tr>`; }).join("")}</tbody></table></div>`);
    }
    // Previsão (juros compostos com o aporte mensal)
    // Padrão conservador: no máximo 11% ao ano, mesmo que o ano corrente tenha rendido mais
    const taxa = Math.min(11, Number(PJ.taxa_anual_padrao) || 11), infl = Number(PJ.inflacao_padrao) || 4.5;
    const im = (1 + taxa / 100) ** (1 / 12) - 1;
    const futuro = (n) => total * (1 + im) ** n + (im ? aporte * ((1 + im) ** n - 1) / im : aporte * n);
    const horizontes = (Array.isArray(PJ.horizontes_anos) && PJ.horizontes_anos.length ? PJ.horizontes_anos : [1, 5, 10, 20]).slice(0, 5);
    blocos.push(`<h3>Previsão${invVer === "tudo" ? "" : ` · ${esc(nomeDono(invVer))}`}</h3>
      <p class="sub">Conservadora: ${String(taxa).replace(".", ",")}% ao ano${Number(PJ.taxa_anual_padrao) > taxa ? ` (a carteira rendeu ${String(PJ.taxa_anual_padrao).replace(".", ",")}% ao ano em 2026, um ano de juros altos)` : ""}, partindo do valor atual com ${aporte ? `${brl(aporte)} de aporte por mês` : "nenhum aporte"}. A primeira coluna desconta a inflação de ${String(infl).replace(".", ",")}% ao ano. Sem imposto de renda.</p>
      <div class="tabela-wrap"><table class="tabela casal-unif"><thead><tr><th>Em</th><th class="r">Em dinheiro de hoje</th><th class="r">Valor previsto</th><th class="r">Saldo de hoje</th><th class="r">Aportes</th><th class="r">Rendimentos</th></tr></thead>
      <tbody>${horizontes.map((a) => { const m = a * 12, v = futuro(m), ap = aporte * m; return `<tr><td>${a} ${a === 1 ? "ano" : "anos"}</td><td class="r num casal-total">${brl(v / (1 + infl / 100) ** a)}</td><td class="r num">${brl(v)}</td><td class="r num">${brl(total)}</td><td class="r num">${brl(ap)}</td><td class="r num">${brl(v - total - ap)}</td></tr>`; }).join("")}</tbody></table></div>`);
    // Indicadores
    blocos.push(`<h3>Indicadores para melhorar a carteira${invVer === "tudo" ? "" : ` · ${esc(nomeDono(invVer))}`}</h3><ul class="casal-notas">${indicadores(inv, res).map((t) => `<li>${t}</li>`).join("")}</ul>`);
    // Lista detalhada, separada por dono em Tudo
    if (inv.temLista) {
      const linha = (x) => {
        const saldo = inv.saldoDe(x), rendeu = rendeuNoMes(x.inv, inv.mes), classe = classeDe(x.inv.tipo);
        return `<tr><td><i class="casal-cor" style="background:${classe.cor}"></i>${esc(x.inv.nome || tipoDe(x.inv.tipo).nome)}${x.inv.instituicao ? `<small>${esc(x.inv.instituicao)}</small>` : ""}</td>
          <td>${esc(tipoDe(x.inv.tipo).nome)}${tipoDe(x.inv.tipo).isento ? ' <span class="etiqueta">isento de IR</span>' : ""}<small>${esc([({ ...INDEXADORES, nao: "" })[x.inv.indexador || tipoDe(x.inv.tipo).indexador || "nao"] || "", x.inv.taxa || ""].filter(Boolean).join(" · "))}</small></td>
          <td class="num">${x.inv.vencimento ? dataBR(x.inv.vencimento) : "—"}</td><td class="r num">${n2(saldo)}</td>
          <td class="r num">${rendeu != null ? `${n2(rendeu)}${saldo - rendeu > 0 ? `<small>${pct(rendeu / (saldo - rendeu), 2)}</small>` : ""}` : "—"}</td><td class="r num">${pct(total ? saldo / total : 0, 1)}</td></tr>`;
      };
      const ordenar = (xs) => xs.filter((x) => inv.saldoDe(x) > 0).sort((a, b) => CLASSES.indexOf(classeDe(a.inv.tipo)) - CLASSES.indexOf(classeDe(b.inv.tipo)) || inv.saldoDe(b) - inv.saldoDe(a));
      const grupos = (invVer === "tudo" ? donos() : [invVer]).map((d) => ({ d, xs: ordenar(inv.itens.filter((x) => x.dono === d)) })).filter((g) => g.xs.length);
      const cab = `<thead><tr><th>Investimento</th><th>Tipo e taxa</th><th>Vencimento</th><th class="r">Valor atual</th><th class="r">Rendeu no mês</th><th class="r">% ${invVer === "tudo" ? "do total" : "da parte"}</th></tr></thead>`;
      blocos.push(`<h3>Os investimentos um a um (${grupos.reduce((t, g) => t + g.xs.length, 0)})</h3>
        ${grupos.map((g) => `<div class="casal-inv-grupo casal-inv-grupo-${g.d === "casal" ? "casal" : "pessoa"}"><div class="casal-inv-grupo-cab"><span><b>${esc(nomeDono(g.d))}</b> <span class="sem">(${g.xs.length})</span>${g.d === "casal" ? ' <span class="sem">· dos dois</span>' : ""}</span><span class="num">${brl(soma(g.xs, inv.saldoDe))}</span></div>
          <div class="tabela-wrap"><table class="tabela casal-unif casal-invs">${cab}<tbody>${g.xs.map(linha).join("")}</tbody></table></div></div>`).join("")}`);
    }
    // Análise do projeto Financeiro
    const A = carteiraProjeto && carteiraProjeto.analise;
    if (A && (A.veredito || (A.pontos_fortes || []).length || (A.criticas || []).length || (A.sugestoes || []).length)) {
      const lista = (t, l) => (Array.isArray(l) && l.length ? `<p class="casal-mini-rot">${t}</p><ul class="casal-notas">${l.map((x) => `<li>${esc(typeof x === "string" ? x : x.texto || x.titulo || JSON.stringify(x))}</li>`).join("")}</ul>` : "");
      blocos.push(`<details class="casal-dlg-det"><summary>Análise da carteira conjunta (projeto Financeiro${A.data ? `, ${dataBR(A.data)}` : ""})</summary>
        ${A.veredito ? `<p><b>${esc(A.veredito)}</b></p>` : ""}${lista("Pontos fortes", A.pontos_fortes)}${lista("Críticas", A.criticas)}${lista("Sugestões", A.sugestoes)}${A.observacao ? `<p class="sub">${esc(A.observacao)}</p>` : ""}</details>`);
    }
    return blocos.join("");
  }

  // Indicadores calculados com os investimentos e os gastos do mês
  function indicadores(inv, res) {
    const t = [];
    const total = inv.total;
    if (!inv.temLista || !total) {
      t.push("Cadastre os investimentos um a um (aba Investimentos do painel) para ver concentração, liquidez, vencimentos e o rendimento de cada um.");
      return t;
    }
    const r = inv.r;
    const saldoDe = (x) => Number((registroAte(x.inv, inv.mes) || {}).saldo) || 0;
    const vivos = inv.itens.filter((x) => saldoDe(x) > 0);
    // Concentração por classe
    const topo = r.porClasse[0];
    if (topo) {
      const nome = (CLASSES.find((c) => c.id === topo.id) || CLASSES.at(-1)).nome;
      t.push(topo.parte > 0.7 ? `<b>Concentração:</b> ${pct(topo.parte, 0)} está em ${esc(nome)}. Diversificar entre classes (Tesouro, crédito privado isento, renda variável) reduz o risco de um único tipo de ativo.`
        : `<b>Diversificação:</b> a maior classe (${esc(nome)}) tem ${pct(topo.parte, 0)} da carteira.`);
    }
    // Garantia do FGC por instituição (CDB, RDB, LCI, LCA, LC, LIG, poupança e conta): R$ 250 mil por CPF e instituição
    const FGC = new Set(["cdb", "rdb", "lci", "lca", "lc", "lig", "poupanca", "conta"]);
    const porInst = new Map();
    vivos.filter((x) => FGC.has(x.inv.tipo) && x.inv.instituicao).forEach((x) => {
      const k = `${semAcento(x.inv.instituicao)}|${x.dono}`;
      const o = porInst.get(k) || { nome: x.inv.instituicao, dono: x.dono, v: 0 };
      o.v += saldoDe(x); porInst.set(k, o);
    });
    const acima = [...porInst.values()].filter((o) => o.v > 250000 * (o.dono === "casal" ? 2 : 1));
    t.push(acima.length ? `<b>Garantia do FGC:</b> ${acima.map((o) => `${esc(o.nome)} (${esc(o.dono === "casal" ? "conjunto" : `só de ${curtoDe(o.dono)}`)}) tem ${brl(o.v)}`).join("; ")}, acima do limite de R$ 250 mil por CPF por instituição. Vale espalhar entre emissores.`
      : "<b>Garantia do FGC:</b> nenhuma instituição passa de R$ 250 mil por titular nos investimentos cobertos (CDB, LCI, LCA, LC, poupança).");
    // Isento de IR
    t.push(`<b>Isenção de imposto de renda:</b> ${pct(r.isento, 0)} da carteira está em investimentos isentos (LCI, LCA, CRI, CRA, debêntures incentivadas, poupança).`);
    // Vencimentos nos próximos 12 meses
    const hojeI = hojeISO();
    const limite = `${Number(hojeI.slice(0, 4)) + 1}${hojeI.slice(4)}`;
    const vencendo = vivos.filter((x) => x.inv.vencimento && x.inv.vencimento >= hojeI && x.inv.vencimento <= limite).sort((a, b) => a.inv.vencimento.localeCompare(b.inv.vencimento));
    if (vencendo.length) t.push(`<b>Vencimentos nos próximos 12 meses:</b> ${vencendo.slice(0, 6).map((x) => `${esc(x.inv.nome || tipoDe(x.inv.tipo).nome)} em ${dataBR(x.inv.vencimento)} (${brl(saldoDe(x))})`).join("; ")}${vencendo.length > 6 ? ` e mais ${vencendo.length - 6}` : ""}. Planeje onde reaplicar.`);
    // Prazo médio até o vencimento
    const comVenc = vivos.filter((x) => x.inv.vencimento && x.inv.vencimento > hojeI);
    if (comVenc.length) {
      const anos = (iso) => (new Date(iso + "T12:00") - new Date(hojeI + "T12:00")) / (365.25 * 864e5);
      const pesoT = soma(comVenc, saldoDe);
      const medio = comVenc.reduce((s, x) => s + anos(x.inv.vencimento) * saldoDe(x), 0) / (pesoT || 1);
      const longos = soma(comVenc.filter((x) => anos(x.inv.vencimento) > 3), saldoDe);
      t.push(`<b>Prazo:</b> o prazo médio até o vencimento é de ${medio.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} anos; ${pct(longos / total, 0)} da carteira só vence daqui a mais de 3 anos.`);
    }
    // Reserva de emergência: investimentos com liquidez diária (heurística pelo tipo e pelo nome) e os gastos do mês
    const liquido = soma(vivos.filter((x) => ["tesouro_selic", "conta", "poupanca", "fundo_rf"].includes(x.inv.tipo) || /liquidez|\bld\b|diaria/i.test(semAcento(x.inv.nome || ""))), saldoDe);
    const gastosMes = soma(res.map((rr) => (rr ? rr.cartao + rr.fora + rr.fixosFora : 0)));
    if (gastosMes > 0 && inv.ver === "tudo") t.push(`<b>Reserva de emergência:</b> ${brl(liquido)} com liquidez diária (Tesouro Selic, conta remunerada, fundos DI ou com “liquidez” no nome) cobrem ${(liquido / gastosMes).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ${liquido / gastosMes >= 0.95 && liquido / gastosMes < 1.05 ? "mês" : "meses"} dos gastos do casal deste mês. O usual é ter de 6 a 12 meses.`);
    // Rendimento do mês
    if (r.rendeuMes != null && r.baseMes > 0) t.push(`<b>Rendimento:</b> no último mês a carteira rendeu ${pct(r.rendeuMes / r.baseMes, 2)}. Para comparar, o CDI tem rendido perto de 1% ao mês; abaixo disso, vale olhar quais investimentos puxaram para baixo na lista.`);
    else t.push("<b>Rendimento:</b> com o saldo de cada investimento todo mês, o painel calcula quanto cada um rendeu e compara a carteira mês a mês.");
    return t;
  }

  // ---------------------------------------------------------------- eventos
  if (!chaves.length) {
    $("#casal-tabela").innerHTML = '<tbody><tr><td class="vazio">Os painéis ainda não têm meses para mostrar.</td></tr></tbody>';
    return;
  }
  $("#casal-meses").addEventListener("click", (e) => {
    const b = e.target.closest("[data-mes]");
    if (!b) return;
    atual = b.dataset.mes;
    desenhar();
    const nb = $(`#casal-meses [data-mes="${CSS.escape(atual)}"]`);
    if (nb) nb.focus();
  });
  $("#casal-kpis").addEventListener("click", (e) => {
    const b = e.target.closest("[data-casal-kpi]");
    if (b) abrirKpi(b.dataset.casalKpi);
  });
  $("#casal-gastos").addEventListener("click", (e) => {
    const v = e.target.closest("[data-visao]");
    if (v) {
      visao = v.dataset.visao;
      desenharGastos(doMes().gastos);
      const nb = $(`#casal-gastos [data-visao="${visao}"]`);
      if (nb) nb.focus();
      return;
    }
    if (e.target.closest("[data-todas-desc]")) { todasDescricoes = true; desenharGastos(doMes().gastos); }
  });
  $("#casal-gastos").addEventListener("toggle", (e) => {
    const d = e.target;
    if (!d.dataset || d.dataset.cg == null) return;
    if (d.open) ABERTAS.add(d.dataset.cg); else ABERTAS.delete(d.dataset.cg);
  }, true);
  const aoFiltrar = (e) => {
    const campo = e.target.closest("[data-filtro]");
    if (!campo) return;
    filtro[campo.dataset.filtro] = campo.value;
    const tinhaFoco = document.activeElement === campo;
    const pos = campo.selectionStart;
    desenharGastos(doMes().gastos);
    const novo = $(`#casal-gastos [data-filtro="${campo.dataset.filtro}"]`);
    if (novo && tinhaFoco) { novo.focus(); if (pos != null && novo.setSelectionRange) novo.setSelectionRange(pos, pos); }
  };
  $("#casal-gastos").addEventListener("change", aoFiltrar);
  $("#casal-gastos").addEventListener("input", (e) => { if (e.target.matches("[data-filtro=busca]")) aoFiltrar(e); });
  const dlg = $("#dlg-casal");
  if (dlg) {
    dlg.addEventListener("close", () => { delete dlg.dataset.kpi; });
    // Investimentos: cada quadro de "De quem é cada parte" escolhe o que a janela mostra
    dlg.addEventListener("click", (e) => {
      const b = e.target.closest("[data-inv-ver]");
      if (!b) return;
      invVer = b.dataset.invVer;
      abrirKpi("investimentos");
      const nb = dlg.querySelector(`[data-inv-ver="${CSS.escape(invVer)}"]`);
      if (nb) nb.focus();
    });
  }
  desenhar();
}
