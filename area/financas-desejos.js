// Lista de desejos (aba de Finanças pessoais): o que comprar, com prioridade, quem compra (você, outra pessoa ou
// em conjunto), quanto já está guardado e se a compra é à vista ou parcelada no cartão.
// A projeção mostra quando dá para comprar cada item guardando o valor do plano por mês, na ordem de prioridade,
// e cruza com a previsão do painel: a sobra de cada mês (receitas menos investimento, cartão e gastos fixos, e menos
// o gasto médio fora do cartão) e o espaço no cartão para as parcelas das compras planejadas.
// Nenhum dado pessoal aqui: os itens, os nomes e os valores vêm do banco.
import { $, esc, avisar, opcoes, numeroDigitado } from "./ui.js";

const PRIORIDADES = { 1: "Urgente", 2: "Alta", 3: "Média", 4: "Baixa", 5: "Algum dia" };
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const HORIZONTE = 60; // meses simulados
const brl = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const valorCampo = (v) => (v ? String(Math.round(v * 100) / 100).replace(".", ",") : "");
const rotuloMes = (chave) => `${MESES[Number(chave.slice(5, 7)) - 1]}/${chave.slice(2, 4)}`;
const somarMeses = (chave, n) => {
  const [a, m] = chave.split("-").map(Number);
  const t = m - 1 + n;
  return `${a + Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
};
const mesesEntre = (de, ate) => {
  const [a1, m1] = de.split("-").map(Number);
  const [a2, m2] = ate.split("-").map(Number);
  return (a2 - a1) * 12 + (m2 - m1);
};
const mesAtual = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const hojeISO = () => {
  const d = new Date();
  return `${mesAtual()}-${String(d.getDate()).padStart(2, "0")}`;
};
const ordem = (a, b) =>
  a.prioridade - b.prioridade || (a.quando || "9999").localeCompare(b.quando || "9999") || String(a.criado_em || "").localeCompare(String(b.criado_em || ""));

// Simulação mês a mês (0 = este mês), um "bolso" de cada vez: eu (compras suas), conjunto (dos dois) e outra
// (compras da outra pessoa). Cada bolso recebe o valor do plano por mês e paga os itens na ordem de prioridade:
// à vista, quando o guardado alcança o que falta; parcelado, quando a parcela cabe no plano em todos os meses
// das parcelas (a primeira cai na fatura do mês da compra, paga no mês seguinte).
export function projetar(itens, plano, horizonte = HORIZONTE) {
  const res = new Map();
  for (const bolso of ["eu", "conjunto", "outra"]) {
    const fila = itens.filter((i) => i.bolso === bolso).sort(ordem);
    const mensal = Math.max(0, Number(plano[bolso]) || 0);
    const compromisso = new Array(horizonte + 60).fill(0);
    let saldo = 0;
    let k = 0;
    for (let m = 0; m < horizonte && k < fila.length; m++) {
      saldo += Math.max(0, mensal - compromisso[m]);
      while (k < fila.length) {
        const it = fila[k];
        const falta = Math.max(0, it.valor - (it.guardado || 0));
        if (falta < 0.005) {
          res.set(it.id, { mes: m });
        } else if (it.forma === "parcelado" && it.parcelas > 1) {
          const parcela = falta / it.parcelas;
          let cabe = true;
          for (let j = 1; j <= it.parcelas && cabe; j++) cabe = mensal - compromisso[m + j] >= parcela - 0.005;
          if (!cabe) break;
          for (let j = 1; j <= it.parcelas; j++) compromisso[m + j] += parcela;
          res.set(it.id, { mes: m, parcela });
        } else {
          if (saldo + 0.005 < falta) break;
          saldo -= falta;
          res.set(it.id, { mes: m });
        }
        k++;
      }
    }
    for (; k < fila.length; k++) res.set(fila[k].id, { mes: null });
  }
  return res;
}

export function desenharDesejos({ armazem, perfil, pessoas = [], desejos = [], plano = {}, painel = null, categorias, salvarPlano }) {
  const normal = (d) => ({ ...d, valor: Number(d.valor), guardado: Number(d.guardado || 0), parte: Number(d.parte ?? 50), parcelas: Number(d.parcelas || 1) });
  let lista = desejos.map(normal);
  let pl = { eu: Number(plano.eu) || 0, conjunto: Number(plano.conjunto) || 0, outra: Number(plano.outra) || 0 };
  let editando = null;
  const inicio = mesAtual();
  const outras = pessoas.filter((p) => p.id !== perfil.id);
  const nomePessoa = (id) => (pessoas.find((p) => p.id === id) || {}).nome || "a outra pessoa";
  const previsao = painel && painel.previsao ? painel.previsao(13) : [];
  const foraDoCartao = painel && painel.mediaForaCartao ? painel.mediaForaCartao() : 0;
  const meta = painel ? painel.meta : null;

  const ativos = () => lista.filter((d) => d.situacao === "desejo");
  const dono = (d) => d.perfil_id === perfil.id;
  // De quem é a compra, vista por quem está logado
  const bolsoDe = (d) => {
    if (d.quem === "conjunto") return "conjunto";
    return (d.quem === "eu" ? d.perfil_id : d.outra_id) === perfil.id ? "eu" : "outra";
  };
  const parceiro = (d) => (dono(d) ? d.outra_id : d.perfil_id);
  const minhaParte = (d) => (dono(d) ? d.parte : 100 - d.parte);
  function rotuloQuem(d) {
    const b = bolsoDe(d);
    if (b === "eu") return "Você compra";
    if (b === "outra") return `${nomePessoa(d.quem === "eu" ? d.perfil_id : d.outra_id)} compra`;
    return parceiro(d) ? `Em conjunto com ${nomePessoa(parceiro(d))} (sua parte: ${minhaParte(d)}%)` : "Em conjunto";
  }
  // Parte de quem está logado no que se guarda em conjunto por mês (média das partes dos desejos em conjunto)
  const parteConjunto = () => {
    const c = ativos().filter((d) => bolsoDe(d) === "conjunto");
    return c.length ? c.reduce((t, d) => t + minhaParte(d), 0) / c.length / 100 : 0.5;
  };

  // ---------------------------------------------------------------- desenho
  function render() {
    const proj = projetar(ativos().map((d) => ({ ...d, bolso: bolsoDe(d), quando: d.quando ? d.quando.slice(0, 7) : null })), pl);
    renderLista(proj);
    renderPlano();
    renderProjecao(proj);
  }

  function statusDe(d, proj) {
    const p = proj.get(d.id) || { mes: null };
    const falta = Math.max(0, d.valor - d.guardado);
    const quando = d.quando ? d.quando.slice(0, 7) : null;
    if (falta < 0.005) return { t: "Já está todo guardado: dá para comprar", c: "ok" };
    if (p.mes == null) return { t: pl[bolsoDe(d)] > 0 ? "Não cabe nos próximos 5 anos com o plano atual" : "Defina quanto guardar por mês para ver quando dá", c: "bad" };
    const previsto = somarMeses(inicio, p.mes);
    const parcelado = p.parcela ? ` (${d.parcelas}x de ${brl(p.parcela)})` : "";
    const atraso = quando && previsto > quando;
    return { t: `${p.mes === 0 ? "Dá para comprar este mês" : `Compra prevista em ${rotuloMes(previsto)}`}${parcelado}${atraso ? ", depois da data que você quer" : ""}`, c: atraso ? "warn" : "ok" };
  }

  // Quanto guardar por mês para comprar na data desejada
  function metaDaData(d) {
    if (!d.quando) return "";
    const quando = d.quando.slice(0, 7);
    const falta = Math.max(0, d.valor - d.guardado);
    const meses = mesesEntre(inicio, quando) + 1;
    if (falta < 0.005) return "";
    if (meses <= 0) return "A data que você queria já passou.";
    if (d.forma === "parcelado" && d.parcelas > 1) return `Para comprar em ${rotuloMes(quando)}: parcela de ${brl(falta / d.parcelas)} por ${d.parcelas} meses.`;
    const porMes = falta / meses;
    return `Para comprar em ${rotuloMes(quando)}: guardar ${brl(porMes)} por mês${bolsoDe(d) === "conjunto" ? ` (sua parte: ${brl((porMes * minhaParte(d)) / 100)})` : ""}.`;
  }

  function renderLista(proj) {
    const box = $("#d-lista");
    const at = ativos().sort(ordem);
    const total = at.reduce((t, d) => t + d.valor, 0);
    const guardado = at.reduce((t, d) => t + Math.min(d.guardado, d.valor), 0);
    const meses = at.map((d) => (proj.get(d.id) || {}).mes);
    const fora = meses.filter((m) => m == null).length;
    const ultimo = meses.filter((m) => m != null).reduce((a, b) => Math.max(a, b), -1);
    const feitos = lista.filter((d) => d.situacao !== "desejo").sort((a, b) => String(b.comprado_em || b.atualizado_em || "").localeCompare(String(a.comprado_em || a.atualizado_em || "")));
    box.innerHTML = `<h2>Desejos por prioridade</h2>
      ${at.length ? `<div class="kv">
          <div><span class="label">Total da lista</span><b class="num">${brl(total)}</b></div>
          <div><span class="label">Já guardado</span><b class="num">${brl(guardado)}</b></div>
        </div>
        <p class="sub" style="margin:8px 0 12px">${fora ? `${fora === 1 ? "Um desejo não cabe" : `${fora} desejos não cabem`} nos próximos 5 anos com o plano atual.`
          : ultimo >= 0 ? `Com o plano atual, na ordem de prioridade, a lista inteira fica comprada até ${rotuloMes(somarMeses(inicio, ultimo))}.` : ""}</p>
        <div class="desejos">${at.map((d) => linha(d, proj)).join("")}</div>`
        : '<p class="muted" style="margin:0">Nenhum desejo na lista. Use <b>Novo desejo</b> para começar: o site mostra quando dá para comprar, na ordem de prioridade.</p>'}
      ${feitos.length ? `<details class="desejos-feitos"><summary>Comprados e desistências (${feitos.length})</summary>
        ${feitos.map((d) => `<div class="desejo feito" data-id="${esc(d.id)}"><div class="desejo-topo"><b>${esc(d.nome)}</b><span class="num">${brl(d.valor)}</span></div>
          <div class="sub">${d.situacao === "comprado" ? `Comprado${d.comprado_em ? ` em ${d.comprado_em.slice(8, 10)}/${d.comprado_em.slice(5, 7)}/${d.comprado_em.slice(0, 4)}` : ""}` : "Desistência"} · ${esc(rotuloQuem(d))}</div>
          <div class="acoes-lanc"><button type="button" class="btn sec mini" data-voltar>Voltar para a lista</button></div></div>`).join("")}
      </details>` : ""}`;
  }

  function linha(d, proj) {
    const st = statusDe(d, proj);
    const falta = Math.max(0, d.valor - d.guardado);
    const pct = Math.min(100, (d.guardado / d.valor) * 100);
    const meta = metaDaData(d);
    return `<div class="desejo" data-id="${esc(d.id)}">
        <div class="desejo-topo">
          <span class="prio prio-${d.prioridade}">${d.prioridade} · ${PRIORIDADES[d.prioridade]}</span>
          <b class="desejo-nome">${d.link ? `<a href="${esc(d.link)}" target="_blank" rel="noopener">${esc(d.nome)}</a>` : esc(d.nome)}</b>
          <span class="num">${brl(d.valor)}</span>
        </div>
        <div class="sub">${esc(rotuloQuem(d))} · ${d.forma === "parcelado" && d.parcelas > 1 ? `parcelado em ${d.parcelas}x` : "à vista"}${d.categoria ? ` · ${esc(d.categoria)}` : ""}${d.quando ? ` · quer comprar até ${rotuloMes(d.quando.slice(0, 7))}` : ""}</div>
        <div class="track" role="img" aria-label="${Math.round(pct)}% guardado"><span style="width:${pct.toFixed(1)}%"></span></div>
        <div class="sub">${brl(d.guardado)} guardados · faltam ${brl(falta)}</div>
        <div class="desejo-status ${st.c}">${esc(st.t)}</div>
        ${meta ? `<div class="sub">${esc(meta)}</div>` : ""}
        ${d.observacao ? `<div class="compl">${esc(d.observacao)}</div>` : ""}
        <div class="acoes-lanc"><button type="button" class="btn sec mini" data-editar>Editar</button><button type="button" class="btn sec mini" data-comprei>Comprei</button></div>
      </div>`;
  }

  function renderPlano() {
    const box = $("#d-plano");
    const at = ativos();
    const temConjunto = outras.length > 0 || at.some((d) => bolsoDe(d) === "conjunto");
    const quemOutra = [...new Set(at.filter((d) => bolsoDe(d) === "outra").map((d) => nomePessoa(d.quem === "eu" ? d.perfil_id : d.outra_id)))];
    const prox = previsao.slice(0, 6);
    const livres = prox.map((r) => r.sobra - foraDoCartao);
    const sugestao = prox.length ? Math.max(0, Math.floor((Math.min(...livres) * 0.5) / 10) * 10) : 0;
    const minha = parteConjunto();
    const reservado = pl.eu + pl.conjunto * minha;
    const apertos = previsao.slice(0, 12).filter((r) => r.sobra - foraDoCartao < reservado - 0.005);
    box.innerHTML = `<h2>Quanto guardar por mês</h2>
      <form class="plano" id="form-plano" novalidate>
        <label>Para os seus desejos (R$)<input name="eu" inputmode="decimal" autocomplete="off" value="${valorCampo(pl.eu)}" placeholder="0,00"></label>
        ${temConjunto ? `<label>Para os desejos em conjunto, os dois juntos (R$)<input name="conjunto" inputmode="decimal" autocomplete="off" value="${valorCampo(pl.conjunto)}" placeholder="0,00"></label>` : ""}
        ${quemOutra.length ? `<label>Para os desejos de ${esc(quemOutra.join(" e "))} (R$)<input name="outra" inputmode="decimal" autocomplete="off" value="${valorCampo(pl.outra)}" placeholder="0,00"></label>` : ""}
        <button type="submit" class="btn">Salvar plano</button>
      </form>
      ${prox.length ? `<p class="sub" style="margin:12px 0 0">Pela previsão do painel, nos próximos 6 meses sobram em média ${brl(prox.reduce((t, r) => t + r.sobra, 0) / prox.length)} por mês depois do cartão, do investimento e dos gastos fixos. Fora do cartão (Pix, débito e dinheiro) você gasta em média ${brl(foraDoCartao)} por mês.
          ${sugestao > 0 ? `Dá para guardar uns ${brl(sugestao)} por mês com folga (metade do menor valor livre previsto).` : "A previsão não deixa folga para guardar nos próximos meses."}</p>
        ${sugestao > 0 ? `<button type="button" class="btn sec mini" id="usar-sugestao" style="margin-top:8px">Usar ${brl(sugestao)} para os seus desejos</button>` : ""}
        ${reservado > 0 && apertos.length ? `<div class="alert warn" role="status" style="margin-top:12px"><span class="sev"></span><div><b>O plano aperta em ${apertos.map((r) => r.mes).join(", ")}.</b> Você reserva ${brl(reservado)} por mês${pl.conjunto ? ` (com ${Math.round(minha * 100)}% do valor em conjunto)` : ""}, mais do que fica livre nesses meses pela previsão.</div></div>` : ""}`
        : '<p class="sub" style="margin:12px 0 0">A sugestão de quanto guardar usa as receitas e o cartão do painel completo do projeto Financeiro.</p>'}`;
  }

  // Parcelas das compras planejadas que caem na fatura de cada mês (a primeira na fatura do mês da compra)
  function parcelasPlanejadas(i, proj) {
    return ativos().reduce((t, d) => {
      const p = proj.get(d.id);
      return p && p.parcela && bolsoDe(d) !== "outra" && i >= p.mes && i < p.mes + d.parcelas ? t + p.parcela : t;
    }, 0);
  }

  function renderProjecao(proj) {
    const box = $("#d-projecao");
    const at = ativos();
    const comPrevisao = previsao.length > 0;
    const linhas = Array.from({ length: 12 }, (_, m) => {
      const r = previsao[m];
      const compras = at.filter((d) => (proj.get(d.id) || {}).mes === m);
      const extra = parcelasPlanejadas(m, proj);
      return { m, chave: somarMeses(inicio, m), r, compras, extra };
    });
    const algum = linhas.some((l) => l.compras.length || l.extra);
    box.innerHTML = `<h2>Projeção dos próximos 12 meses</h2>
      ${!at.length ? '<p class="muted" style="margin:0">A projeção aparece quando houver desejos na lista.</p>' : `
      <div class="scroll"><table><thead><tr><th>Mês</th>${comPrevisao ? '<th class="r">Livre<span class="sm"> prev.</span></th>' : ""}<th>Compras previstas</th>${comPrevisao && meta != null ? '<th class="r">Cartão</th>' : ""}</tr></thead><tbody>
        ${linhas.map((l) => {
          const livre = l.r ? l.r.sobra - foraDoCartao : null;
          const cartao = l.r && l.r.livre != null ? l.r.livre - l.extra : null;
          return `<tr><td>${rotuloMes(l.chave)}${l.r ? `<div class="muted" style="font-size:.75rem">fatura ${esc(l.r.fat)}</div>` : ""}</td>
            ${comPrevisao ? `<td class="r num${livre != null && livre < 0 ? " neg" : ""}">${livre == null ? "—" : brl(livre)}</td>` : ""}
            <td>${l.compras.length ? l.compras.map((d) => esc(d.nome)).join(", ") : '<span class="muted">—</span>'}${l.extra ? `<div class="muted" style="font-size:.75rem">parcelas planejadas na fatura: ${brl(l.extra)}</div>` : ""}</td>
            ${comPrevisao && meta != null ? `<td class="r num${cartao != null && cartao < 0 ? " neg" : ""}">${cartao == null ? "—" : cartao < 0 ? `${brl(-cartao)} acima` : `cabe ${brl(cartao)}`}</td>` : ""}</tr>`;
        }).join("")}
      </tbody></table></div>
      <p class="sub" style="margin:10px 0 0">${comPrevisao
        ? `“Livre” é a sobra prevista do mês menos o gasto médio fora do cartão: o que dá para guardar sem apertar. “Cartão” é quanto ainda cabe na fatura para ficar na sua previsão${meta != null ? ` de ${brl(meta)}` : ""}, já contando as parcelas das compras planejadas.`
        : "Os meses com as compras previstas, guardando o valor do plano."}${algum ? "" : " Nenhuma compra prevista nos próximos 12 meses com o plano atual."}</p>`}`;
  }

  // ---------------------------------------------------------------- diálogo
  const form = $("#form-desejo");
  function erro(texto) {
    $("#erro-desejo").textContent = texto;
    $("#erro-desejo").hidden = !texto;
  }

  function atualizarFormaDesejo() {
    $("#campo-parcelas-desejo").hidden = form.elements.forma.value !== "parcelado";
  }
  function atualizarQuem() {
    const marcado = form.querySelector("input[name=quem]:checked");
    $("#campo-parte").hidden = !marcado || !marcado.value.startsWith("conjunto");
  }

  function abrirDesejo(d) {
    editando = d;
    form.reset();
    erro("");
    $("#titulo-desejo").textContent = d ? "Editar desejo" : "Novo desejo";
    const meu = !d || dono(d);
    let atual = "eu";
    if (d && d.quem === "conjunto") atual = parceiro(d) ? `conjunto:${parceiro(d)}` : "conjunto";
    else if (d) {
      const comprador = d.quem === "eu" ? d.perfil_id : d.outra_id;
      atual = comprador === perfil.id ? "eu" : `outra:${comprador}`;
    }
    const escolhas = [["eu", "Você"], ...outras.flatMap((p) => [[`outra:${p.id}`, p.nome], [`conjunto:${p.id}`, `Em conjunto com ${p.nome}`]])];
    if (!escolhas.some(([v]) => v === atual)) escolhas.push([atual, rotuloQuem(d)]);
    $("#opcoes-quem").innerHTML = escolhas
      .map(([v, r]) => `<label><input type="radio" name="quem" value="${esc(v)}"${v === atual ? " checked" : ""}${meu ? "" : " disabled"}> ${esc(r)}</label>`)
      .join("");
    form.elements.parte.value = d ? minhaParte(d) : 50;
    form.elements.parte.disabled = !meu;
    form.elements.nome.value = d ? d.nome : "";
    form.elements.valor.value = d ? valorCampo(d.valor) : "";
    form.elements.prioridade.value = String(d ? d.prioridade : 3);
    form.elements.quando.value = d && d.quando ? d.quando.slice(0, 7) : "";
    form.elements.guardado.value = d ? valorCampo(d.guardado) : "";
    form.elements.forma.value = d ? d.forma : "avista";
    form.elements.parcelas.innerHTML = opcoes(Array.from({ length: 23 }, (_, i) => [String(i + 2), `${i + 2}x`]), String(d && d.parcelas > 1 ? d.parcelas : 10));
    const nomes = categorias().lista.map((c) => c.nome);
    if (d && d.categoria && !nomes.includes(d.categoria)) nomes.push(d.categoria);
    form.elements.categoria.innerHTML = '<option value="">—</option>' + nomes.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join("");
    form.elements.categoria.value = d && d.categoria ? d.categoria : "";
    form.elements.link.value = d && d.link ? d.link : "";
    form.elements.observacao.value = d && d.observacao ? d.observacao : "";
    atualizarFormaDesejo();
    atualizarQuem();
    $("#btn-apagar-desejo").hidden = !d;
    $("#dlg-desejo").showModal();
    form.elements.nome.focus();
  }

  async function salvar(e) {
    e.preventDefault();
    const f = form.elements;
    const valor = numeroDigitado(f.valor.value);
    if (!f.nome.value.trim()) return erro("Informe o que você quer comprar.");
    if (!(valor > 0)) return erro("Informe o valor estimado (ex.: 4.500,00).");
    const meu = !editando || dono(editando);
    let quem, outra_id, parte;
    if (meu) {
      const [q, id] = (form.querySelector("input[name=quem]:checked") || { value: "eu" }).value.split(":");
      quem = q;
      outra_id = id || null;
      parte = Number(f.parte.value);
    } else {
      ({ quem, outra_id, parte } = editando);
    }
    const botao = form.querySelector("[type=submit]");
    botao.disabled = true;
    try {
      const salvo = await armazem.financas.salvarDesejo({
        ...(editando || {}),
        perfil_id: meu ? perfil.id : editando.perfil_id,
        nome: f.nome.value,
        valor,
        prioridade: f.prioridade.value,
        quem,
        outra_id,
        parte,
        forma: f.forma.value,
        parcelas: f.parcelas.value,
        quando: f.quando.value || null,
        guardado: numeroDigitado(f.guardado.value) || 0,
        categoria: f.categoria.value || null,
        link: f.link.value,
        observacao: f.observacao.value,
        situacao: editando ? editando.situacao : "desejo",
      });
      lista = [...lista.filter((x) => x.id !== salvo.id), normal(salvo)];
      $("#dlg-desejo").close();
      render();
      avisar("Desejo salvo.");
    } catch (err) {
      erro("Não foi possível salvar: " + err.message);
    } finally {
      botao.disabled = false;
    }
  }

  async function mudarSituacao(d, situacao) {
    try {
      const salvo = await armazem.financas.salvarDesejo({ ...d, situacao, comprado_em: situacao === "comprado" ? hojeISO() : null });
      lista = [...lista.filter((x) => x.id !== salvo.id), normal(salvo)];
      render();
      avisar(situacao === "comprado" ? `${d.nome}: marcado como comprado.` : `${d.nome} voltou para a lista.`);
    } catch (err) {
      avisar("Não foi possível alterar: " + err.message);
    }
  }

  async function apagar() {
    if (!editando || !confirm(`Apagar o desejo "${editando.nome}"?`)) return;
    try {
      await armazem.financas.apagarDesejo(editando.id);
      lista = lista.filter((x) => x.id !== editando.id);
      $("#dlg-desejo").close();
      render();
      avisar("Desejo apagado.");
    } catch (err) {
      erro("Não foi possível apagar: " + err.message);
    }
  }

  async function guardarPlano(novo) {
    pl = novo;
    try {
      await salvarPlano(pl);
      avisar("Plano salvo.");
    } catch (err) {
      avisar("Não foi possível salvar o plano: " + err.message);
    }
    render();
  }

  // ---------------------------------------------------------------- eventos
  $("#btn-novo-desejo").addEventListener("click", () => abrirDesejo(null));
  form.addEventListener("submit", salvar);
  $("#formas-desejo").addEventListener("change", atualizarFormaDesejo);
  $("#opcoes-quem").addEventListener("change", atualizarQuem);
  $("#btn-apagar-desejo").addEventListener("click", apagar);
  $("#d-lista").addEventListener("click", (e) => {
    const div = e.target.closest(".desejo");
    const d = div && lista.find((x) => x.id === div.dataset.id);
    if (!d) return;
    if (e.target.closest("[data-editar]")) abrirDesejo(d);
    else if (e.target.closest("[data-comprei]")) mudarSituacao(d, "comprado");
    else if (e.target.closest("[data-voltar]")) mudarSituacao(d, "desejo");
  });
  $("#d-plano").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.target.elements;
    const ler = (nome, atual) => (f[nome] ? Math.max(0, numeroDigitado(f[nome].value) || 0) : atual);
    guardarPlano({ eu: ler("eu", pl.eu), conjunto: ler("conjunto", pl.conjunto), outra: ler("outra", pl.outra) });
  });
  $("#d-plano").addEventListener("click", (e) => {
    if (!e.target.closest("#usar-sugestao")) return;
    const prox = previsao.slice(0, 6);
    const sugestao = Math.max(0, Math.floor((Math.min(...prox.map((r) => r.sobra - foraDoCartao)) * 0.5) / 10) * 10);
    guardarPlano({ ...pl, eu: sugestao });
  });

  render();
  return { render };
}
