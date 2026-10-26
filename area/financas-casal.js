// Visão do casal (Finanças pessoais → Casal): o caixa do mês das duas pessoas que formam casal nas finanças lado a
// lado, com os mesmos cálculos dos painéis de cada uma (entradas, investimento, fatura que vence no mês, gastos fora
// do cartão, fixos e saldo do mês) e o total do casal. Para lançar ou mudar alguma coisa, abre-se o painel de cada uma.
import { desenharFinancas } from "./financas-painel.js";
import { $, esc } from "./ui.js";

const brl = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const chaveDeHoje = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

// pessoas: [{ id, nome, link }], na ordem das colunas
export async function mostrarCasal({ armazem, pessoas }) {
  const lidos = await Promise.all(pessoas.map(async (p) => {
    const registro = await armazem.financas.ler(p.id);
    if (!registro) return { ...p, painel: null };
    const [gastos, entradas, prefs] = await Promise.all([
      armazem.financas.gastos(p.id).catch(() => []),
      armazem.financas.entradas(p.id).catch(() => []),
      armazem.financas.preferencias(p.id).catch(() => null),
    ]);
    // Com as preferências de cada painel: recorrentes do site, gastos a pagar, fixos trocados e previsões do mês
    const painel = desenharFinancas({ dados: registro.dados, modo: registro.modo, nome: p.nome, gastosSite: gastos, entradasSite: entradas,
      recorrentes: Array.isArray(prefs && prefs.recorrentes) ? prefs.recorrentes : [], caixa: (prefs && prefs.caixa) || {}, comMeses: true, somenteCalculo: true });
    return { ...p, painel };
  }));
  const comPainel = lidos.filter((p) => p.painel);
  const meses = new Map();
  comPainel.forEach((p) => p.painel.meses().forEach((m) => meses.set(m.chave, m.rotulo)));
  const chaves = [...meses.keys()].sort();
  const hoje = chaveDeHoje();
  let atual = chaves.includes(hoje) ? hoje : chaves.filter((c) => c <= hoje).at(-1) || chaves[0];
  // A carteira de investimentos conjunta aparece no painel de quem a tem
  const carteira = comPainel.map((p) => p.painel.investimentos).find((i) => i && i.total != null) || null;

  function desenhar() {
    $("#casal-meses").innerHTML = chaves.map((c) => `<button type="button" class="pilula" data-mes="${esc(c)}"${c === atual ? ' aria-current="page"' : ""}>${esc(meses.get(c))}${c === hoje ? " · agora" : ""}</button>`).join("");
    const res = lidos.map((p) => (p.painel ? p.painel.resumo(atual) : null));
    const soma = (f) => res.reduce((t, r) => t + (r ? f(r) : 0), 0);
    const cel = (r, f, sub = "") => `<td class="r">${r ? `${brl(f(r))}${sub ? `<small>${esc(sub(r))}</small>` : ""}` : '<span class="sem">—</span>'}</td>`;
    const linha = (rotulo, f, sub) => `<tr><th scope="row">${rotulo}</th>${res.map((r) => cel(r, f, sub)).join("")}<td class="r casal-total">${brl(soma(f))}</td></tr>`;
    const saldo = soma((r) => r.saldo);
    const saidas = soma((r) => r.investimento + r.cartao + r.fora + r.fixosFora);
    $("#casal-tabela").innerHTML = `
      <thead><tr><th scope="col">${esc(meses.get(atual) || "")}</th>${lidos.map((p) => `<th scope="col" class="r">${esc(p.nome)}</th>`).join("")}<th scope="col" class="r">Casal</th></tr></thead>
      <tbody>
        ${linha("Entradas", (r) => r.receitas)}
        ${linha("(−) Investimento", (r) => r.investimento)}
        ${linha("(−) Fatura do cartão que vence no mês", (r) => r.cartao, (r) => `fatura ${r.fatura}`)}
        ${linha("(−) Gastos fora do cartão (Pix, débito, dinheiro)", (r) => r.fora)}
        ${linha("(−) Fixos fora do cartão", (r) => r.fixosFora)}
        <tr class="casal-saldo"><th scope="row">Saldo do mês</th>${res.map((r) => (r ? `<td class="r${r.saldo < 0 ? " neg" : ""}">${brl(r.saldo)}</td>` : '<td class="r"><span class="sem">—</span></td>')).join("")}<td class="r casal-total${saldo < 0 ? " neg" : ""}">${brl(saldo)}</td></tr>
      </tbody>`;
    $("#casal-kpis").innerHTML = [
      ["Entradas do casal", brl(soma((r) => r.receitas)), meses.get(atual)],
      ["Saídas do casal", brl(saidas), "faturas que vencem, Pix, fixos e investimento"],
      ["Saldo do casal", brl(saldo), saldo < 0 ? "faltam para fechar o mês" : "sobra no mês"],
      ...(carteira ? [["Investimentos", brl(carteira.total), carteira.data ? `carteira em ${String(carteira.data).slice(8, 10)}/${String(carteira.data).slice(5, 7)}` : "carteira conjunta"]] : []),
    ].map(([t, v, s]) => `<div class="kpi"><span class="kpi-rotulo">${esc(t)}</span><strong class="kpi-valor${t === "Saldo do casal" && saldo < 0 ? " neg" : ""}">${v}</strong><small>${esc(s || "")}</small></div>`).join("");
    $("#casal-entradas").innerHTML = lidos.map((p, i) => {
      const r = res[i];
      const itens = r && r.entradas.length
        ? r.entradas.map((e) => `<li><span>${esc(e.desc)}${e.site ? ' <span class="etiqueta">lançado no site</span>' : ""}</span><span class="num">${brl(e.liquido)}${e.previsto ? " <small>previsto</small>" : ""}</span></li>`).join("")
        : `<li class="sem">${p.painel ? "Nenhuma entrada neste mês." : "Painel ainda não importado."}</li>`;
      return `<section class="cartao casal-pessoa"><h2>Entradas de ${esc(p.nome)}</h2><ul class="casal-lista">${itens}</ul>
        <a class="btn btn-claro" href="${esc(p.link)}">Abrir o painel de ${esc(p.nome)}</a></section>`;
    }).join("");
  }

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
  desenhar();
}
