// Entradas do mês (Visão geral e visão do casal): um bloco para entender em poucos segundos quanto entrou, de onde veio,
// o que ainda falta entrar e se está acima ou abaixo do normal.
//   - Resumo: renda recebida (sem reembolsos e transferências, que aparecem à parte), o previsto, o que falta entrar, a
//     comparação com a média dos três meses anteriores e uma barra por categoria.
//   - Categorias com cor fixa (Salário, 13º / bônus / férias, Reembolso ou transferência, Dinheiro / outros): a escolhida
//     pela pessoa (lembrada pela descrição) ou, sem escolha, a que vem do tipo da entrada. Sugestões de troca só valem
//     depois de confirmadas.
//   - Lista por situação (recebido; previsto, ainda não caiu), uma linha por entrada; o resto aparece ao tocar na linha.
// Nenhum dado pessoal aqui: as entradas vêm do banco.
import { esc } from "./ui.js";

export const CATEGORIAS_ENTRADA = [
  { id: "salario", nome: "Salário", curto: "Salário" },
  { id: "extra", nome: "13º / bônus / férias", curto: "13º / bônus" },
  { id: "reembolso", nome: "Reembolso ou transferência", curto: "Reembolso" },
  { id: "outros", nome: "Dinheiro / outros", curto: "Outros" },
];
const nomeCat = (id) => (CATEGORIAS_ENTRADA.find((c) => c.id === id) || CATEGORIAS_ENTRADA[3]).nome;
const curtoCat = (id) => (CATEGORIAS_ENTRADA.find((c) => c.id === id) || CATEGORIAS_ENTRADA[3]).curto;
const semAcento = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
// A mesma descrição em meses diferentes (sem acento, sem espaços repetidos): a chave da categoria escolhida
export const chaveEntrada = (desc) => semAcento(desc).replace(/\s+/g, " ").trim().slice(0, 120);

// Categoria pelo tipo da entrada, sem escolha da pessoa: o salário (do holerite ou lançado como salário) e o resto
export const categoriaPadrao = (r = {}) => (r.fonte === "Empresa" ? "salario" : "outros");

// Sugestão de categoria pelo nome e pelo valor (só aparece para a pessoa confirmar): 13º, bônus, férias e PLR; reembolso,
// transferência, consórcio, devolução e estorno; ou uma entrada que volta a sair no mês como pagamento recorrente do mesmo valor
export function sugerirCategoria(desc, valor, valoresRecorrentes = []) {
  const d = semAcento(desc);
  if (/^13$|\b13(o|º|°)?\b|decimo|bonus|ferias|\bplr\b|gratifica|participacao nos lucros/.test(d)) return "extra";
  if (/reembolso|ressarc|transfer|consorcio|devoluc|estorno|\bpix de volta\b/.test(d)) return "reembolso";
  if (valoresRecorrentes.some((v) => Math.abs(Number(v) - Number(valor)) < 0.01)) return "reembolso";
  return null;
}

const brl = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dBR = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "");
const RELOGIO = '<svg class="ent-relogio" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 4.5V8l2.5 1.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';

// Pílula da categoria: um seletor (troca a categoria e lembra pela descrição) ou só o rótulo
const pilula = (it) => it.editavel
  ? `<label class="ent-pilula cat-${it.categoria}"><span class="vh">Categoria de ${esc(it.desc)}</span><select data-cat-ent="${esc(it.chave)}"${it.dono ? ` data-cat-dono="${esc(it.dono)}"` : ""}>${CATEGORIAS_ENTRADA.map((c) => `<option value="${c.id}"${c.id === it.categoria ? " selected" : ""}>${esc(c.curto)}</option>`).join("")}</select></label>`
  : `<span class="ent-pilula cat-${it.categoria}">${esc(curtoCat(it.categoria))}</span>`;

// Monta o bloco. d: { rotulo, recebido, previsto, falta, reembolsos, media, mesesMedia, porCategoria: {id: valor},
// itens: [{ i, chave, desc, valor, data, st, categoria, semData, editavel, quem: { marca, nome }, dono, detalhes }],
// alertas: [texto], sugestoes: [{ chave, desc, de, para, dono, quem }], pares: [{ id, site, projeto }],
// pessoas: [{ marca, nome, recebido, previsto }] (casal), lancar: bool, notas: [html] }
export function htmlEntradas(d) {
  const casal = Array.isArray(d.pessoas) && d.pessoas.length > 1;
  if (!d.itens.length) {
    return `<div class="label">Entradas de ${esc(d.rotulo)}</div>
      <p class="ent-vazio">Nenhuma entrada lançada ainda.</p>
      ${d.lancar ? '<div class="acoes-lanc"><button type="button" class="btn sec mini" data-lancar-entrada>Lançar entrada</button></div>' : ""}
      ${(d.notas || []).join("")}`;
  }
  // Comparação com a média dos meses anteriores: menos de 5% de diferença é "na média"
  let media = "";
  if (d.media > 0) {
    const dif = d.previsto / d.media - 1;
    const p = Math.round(Math.abs(dif) * 100);
    media = Math.abs(dif) < 0.05 ? `<span class="ent-media igual">na média${d.mesesMedia ? ` de ${esc(d.mesesMedia)}` : ""}</span>`
      : `<span class="ent-media ${dif > 0 ? "acima" : "abaixo"}">${dif > 0 ? "↑" : "↓"} ${p}% ${dif > 0 ? "acima" : "abaixo"} da média${d.mesesMedia ? ` de ${esc(d.mesesMedia)}` : ""}</span>`;
  }
  const totalBarra = CATEGORIAS_ENTRADA.reduce((t, c) => t + (d.porCategoria[c.id] || 0), 0);
  const cats = CATEGORIAS_ENTRADA.filter((c) => (d.porCategoria[c.id] || 0) > 0.004);
  const barra = totalBarra > 0 ? `<div class="ent-barra" role="img" aria-label="${esc(cats.map((c) => `${c.nome} ${brl(d.porCategoria[c.id])}`).join(", "))}">
      ${cats.map((c) => `<span class="cat-${c.id}" style="flex-grow:${(d.porCategoria[c.id] / totalBarra).toFixed(4)}" title="${esc(c.nome)}: ${brl(d.porCategoria[c.id])}"></span>`).join("")}</div>
    <ul class="ent-legenda">${cats.map((c) => `<li><i class="cat-${c.id}"></i>${esc(c.curto)} <span class="num">${brl(d.porCategoria[c.id])}</span></li>`).join("")}</ul>` : "";
  const linha = (it) => `<li class="ent-item${it.st === "previsto" ? " ent-prev" : ""}">
      <div class="ent-linha">
        <span class="ent-data num">${it.data ? dBR(it.data) : it.semData ? '<span class="ent-semdata">sem data</span>' : "no mês"}</span>
        <button type="button" class="ent-abrir" data-ent-abrir aria-expanded="false">${it.quem ? `<span class="ent-quem" title="${esc(it.quem.nome)}">${esc(it.quem.marca)}</span>` : ""}${it.st === "previsto" ? RELOGIO : ""}<span class="ent-desc">${esc(it.desc)}</span></button>
        ${pilula(it)}
        <span class="ent-valor num">${brl(it.valor)}</span>
      </div>
      ${it.semData && it.i != null ? `<div class="ent-semdata-acao"><button type="button" class="btn-link" data-editar-ent="${it.i}">Informar a data</button></div>` : ""}
      <div class="ent-det" hidden>${it.detalhes || ""}</div>
    </li>`;
  const grupo = (titulo, lista, classe = "") => (lista.length ? `<h3 class="ent-grupo ${classe}"><span class="ent-grupo-t">${titulo}</span><span class="num">${brl(lista.reduce((t, x) => t + x.valor, 0))}</span></h3><ul class="ent-lista">${lista.map(linha).join("")}</ul>` : "");
  const ordem = (a, b) => String(a.data || "9").localeCompare(String(b.data || "9")) || b.valor - a.valor;
  const recebidos = d.itens.filter((x) => x.st !== "previsto").sort(ordem);
  const previstos = d.itens.filter((x) => x.st === "previsto").sort(ordem);
  return `
    <div class="label">Entradas de ${esc(d.rotulo)}</div>
    <div class="ent-resumo">
      <div class="ent-grande"><span class="ent-rot">Renda recebida</span><b class="num">${brl(d.recebido)}</b>
        ${d.reembolsos > 0.004 ? `<span class="ent-reemb">+ ${brl(d.reembolsos)} em reembolsos/transferências</span>` : ""}</div>
      <div class="ent-lado">
        <span>previsto <b class="num">${brl(d.previsto)}</b></span>
        <span>falta entrar <b class="num">${brl(d.falta)}</b></span>
        ${media}
      </div>
    </div>
    ${barra}
    ${(d.alertas || []).map((a) => `<div class="ent-aviso" role="status"><b>!</b> ${esc(a)}</div>`).join("")}
    ${(d.sugestoes || []).length ? `<div class="ent-sugestao" role="status"><p><b>${d.sugestoes.length === 1 ? "Uma entrada parece estar" : `${d.sugestoes.length} entradas parecem estar`} na categoria errada:</b></p>
      <ul>${d.sugestoes.map((s) => `<li>${s.quem ? `<span class="ent-quem">${esc(s.quem)}</span> ` : ""}${esc(s.desc)}: ${esc(nomeCat(s.de))} → <b>${esc(nomeCat(s.para))}</b>
        <span class="ent-sug-acoes"><button type="button" class="btn mini" data-sug-ok="${esc(s.chave)}" data-sug-cat="${esc(s.para)}"${s.dono ? ` data-cat-dono="${esc(s.dono)}"` : ""}>Confirmar</button>
        <button type="button" class="btn-link" data-sug-nao="${esc(s.chave)}"${s.dono ? ` data-cat-dono="${esc(s.dono)}"` : ""}>Agora não</button></span></li>`).join("")}</ul>
      <p class="ent-nota">Nada muda até você confirmar. A escolha vale também para as próximas entradas com a mesma descrição.</p></div>` : ""}
    ${(d.pares || []).map((p) => `<div class="ent-sugestao" role="status"><p><b>Estas duas entradas parecem a mesma.</b> A “${esc(p.site.desc)}” lançada no site (${brl(p.site.valor)}${p.site.data ? `, ${dBR(p.site.data)}` : ""}) e a “${esc(p.projeto.desc)}” do projeto Financeiro (${brl(p.projeto.valor)}${p.projeto.data ? `, ${dBR(p.projeto.data)}` : ", sem data"}). Hoje conta só a do projeto.</p>
      <span class="ent-sug-acoes"><button type="button" class="btn mini" data-uniao="${esc(p.id)}" data-uniao-dec="site">Usar a do site no lugar</button>
      <button type="button" class="btn-link" data-uniao="${esc(p.id)}" data-uniao-dec="separadas">São diferentes: contar as duas</button></span>
      <p class="ent-nota">Usar a do site não muda o total do mês; contar as duas soma ${brl(p.site.valor)}.</p></div>`).join("")}
    ${grupo('<span class="ent-ok" aria-hidden="true">✓</span> Recebido', recebidos)}
    ${grupo(`${RELOGIO} Previsto, ainda não caiu`, previstos, "ent-grupo-prev")}
    ${casal ? `<div class="ent-pessoas">${d.pessoas.map((p) => `<span><span class="ent-quem">${esc(p.marca)}</span> ${esc(p.nome)}: <b class="num">${brl(p.recebido)}</b> recebido${p.previsto > p.recebido + 0.004 ? ` · ${brl(p.previsto - p.recebido)} a receber` : ""}</span>`).join("")}</div>` : ""}
    ${d.lancar ? '<div class="acoes-lanc"><button type="button" class="btn sec mini" data-lancar-entrada>Lançar entrada</button></div>' : ""}
    ${(d.notas || []).join("")}
    <p class="ent-nota">Toque numa entrada para ver os detalhes. A renda não conta reembolsos e transferências, que entram e voltam a sair.${d.media > 0 ? " A comparação usa a renda prevista do mês (o recebido e o que falta entrar) contra a média dos três meses anteriores." : ""}</p>`;
}

// Marcadores das pessoas no casal: a inicial; com iniciais iguais, o nome mais longo ganha a primeira letra diferente
// (ex.: Ana → A, André → Ad)
export function marcadores(nomes) {
  const m = nomes.map((n) => String(n || "?").trim().charAt(0).toUpperCase() || "?");
  if (nomes.length === 2 && m[0] === m[1]) {
    const [a, b] = nomes.map((n) => String(n || "").trim());
    let k = 0;
    while (k < Math.min(a.length, b.length) && a[k].toLowerCase() === b[k].toLowerCase()) k++;
    const longo = b.length > a.length ? 1 : a.length > b.length ? 0 : 1;
    const nome = longo ? b : a;
    m[longo] = m[longo] + (nome[k] || nome.at(-1) || "").toLowerCase();
  }
  return m;
}

// Liga os controles do bloco (abrir a linha) num elemento; os outros botões são tratados por quem desenha
export function ligarEntradas(el) {
  el.addEventListener("click", (e) => {
    const b = e.target.closest("[data-ent-abrir]");
    if (!b) return;
    const det = b.closest(".ent-item").querySelector(".ent-det");
    if (!det) return;
    det.hidden = !det.hidden;
    b.setAttribute("aria-expanded", String(!det.hidden));
  });
}
