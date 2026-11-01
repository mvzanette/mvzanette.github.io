// Plano de aportes com datas (Cadastros → Plano de aportes): quanto cada pessoa aporta por mês em cada destino, a
// partir de um mês. O valor de um mês é, em cada destino, o do degrau com a maior data "a partir de" até aquele mês;
// os destinos somam. Vale no balanço (investimento previsto do mês), na previsão dos próximos meses, na projeção da
// carteira e no "previsto × feito" do mês. Nenhum dado pessoal aqui: pessoas, destinos e valores vêm do banco.
import { $, esc, avisar, numeroDigitado } from "./ui.js";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const rotuloMes = (chave) => `${MESES[Number(chave.slice(5, 7)) - 1]}/${chave.slice(2, 4)}`;
const semAcento = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const brl = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const valorBR = (v) => Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const centavos = (v) => Math.round(v * 100) / 100;
const mesDe = (d) => String(d.vigente_desde || "").slice(0, 7);
const hojeChave = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };

// Valor vigente num mês (AAAA-MM): soma, por destino, do degrau mais recente até o mês. Com perfilId, só os dessa pessoa.
export function vigenteNoMes(degraus, chave, perfilId = null) {
  const porDestino = new Map();
  for (const d of degraus || []) {
    if (perfilId && d.perfil_id !== perfilId) continue;
    if (mesDe(d) > chave) continue;
    const k = `${d.perfil_id}|${semAcento(d.destino)}`;
    const atual = porDestino.get(k);
    if (!atual || mesDe(d) > mesDe(atual)) porDestino.set(k, d);
  }
  const valendo = [...porDestino.values()]; // inclui as pausas (valor zero)
  const itens = valendo.filter((d) => Number(d.valor) > 0);
  return { total: centavos(itens.reduce((t, d) => t + Number(d.valor), 0)), itens, valendo };
}

// Primeiro mês do plano (de uma pessoa ou de todos); antes dele vale a previsão antiga (Investimento mensal)
export function primeiroMes(degraus, perfilId = null) {
  const meses = (degraus || []).filter((d) => !perfilId || d.perfil_id === perfilId).map(mesDe).sort();
  return meses[0] || null;
}

// Meses em que o valor total da pessoa muda, de "desde" em diante: [{ mes, total }] (o primeiro é o valor de "desde")
export function mudancas(degraus, perfilId, desde) {
  const meses = [...new Set((degraus || []).filter((d) => d.perfil_id === perfilId).map(mesDe).filter((m) => m > desde))].sort();
  const lista = [{ mes: desde, total: vigenteNoMes(degraus, desde, perfilId).total }];
  for (const m of meses) {
    const total = vigenteNoMes(degraus, m, perfilId).total;
    if (Math.abs(total - lista.at(-1).total) > 0.004) lista.push({ mes: m, total });
  }
  return lista;
}

// "R$ 1.250,00 por mês · R$ 1.500,00 a partir de jan/27 · R$ 1.750,00 a partir de jul/27"
export function textoDegraus(degraus, perfilId, desde = hojeChave()) {
  const ls = mudancas(degraus, perfilId, desde);
  return [`${brl(ls[0].total)} por mês`, ...ls.slice(1).map((x) => `${brl(x.total)} a partir de ${rotuloMes(x.mes)}`)].join(" · ");
}

// Previsto × feito do mês: "R$ 1.250,00 de R$ 1.250,00 ✓" ou "R$ 500,00 de R$ 1.250,00 (faltam R$ 750,00)"
export function textoPrevistoFeito(feito, previsto) {
  if (!(previsto > 0)) return feito > 0 ? `${brl(feito)} (sem previsão)` : "nada previsto";
  const falta = centavos(previsto - feito);
  return `${brl(feito)} de ${brl(previsto)}${falta <= 0.004 ? ` ✓${falta < -0.004 ? ` (${brl(-falta)} a mais)` : ""}` : ` (faltam ${brl(falta)})`}`;
}

// ---------------------------------------------------------------- Cadastros: lista e janela de um degrau
// pessoas: [{ id, nome }] (quem tem o painel aberto e quem forma casal com ela); degraus(): a lista atual;
// salvar(degrau) e apagar(id) gravam no banco e devolvem a lista nova; aoMudar(lista) atualiza o resto da página.
export function prepararPlanoAporte({ pessoas, degraus, salvar, apagar, aoMudar }) {
  const raiz = $("#lista-plano");
  const dlg = $("#dlg-degrau");
  const form = $("#form-degrau");
  if (!raiz || !dlg || !form) return { desenhar() {} };
  let editando = null;
  const nomeDe = (id) => (pessoas.find((p) => p.id === id) || {}).nome || "—";
  const erro = (texto) => {
    $("#erro-degrau").textContent = texto;
    $("#erro-degrau").hidden = !texto;
  };

  function desenhar() {
    const lista = degraus();
    const mes = hojeChave();
    if (!lista.length) {
      raiz.innerHTML = `<p class="muted" style="margin:0">Nenhum degrau cadastrado. Sem plano, vale o “Investimento mensal” das Previsões do mês.</p>`;
      return;
    }
    raiz.innerHTML = pessoas.filter((p) => lista.some((d) => d.perfil_id === p.id)).map((p) => {
      const meus = lista.filter((d) => d.perfil_id === p.id).sort((a, b) => semAcento(a.destino).localeCompare(semAcento(b.destino)) || mesDe(a).localeCompare(mesDe(b)));
      const vig = new Set(vigenteNoMes(lista, mes, p.id).valendo.map((d) => d.id));
      // Degrau já substituído por outro do mesmo destino, mais novo e já vigente
      const passou = (d) => !vig.has(d.id) && mesDe(d) <= mes;
      return `<div class="plano-pessoa">
        <div class="plano-cab"><b>${esc(p.nome)}</b><span>Agora: ${esc(textoDegraus(lista, p.id, mes))}</span></div>
        <div class="scroll"><table class="plano-tabela"><thead><tr><th>Destino</th><th class="r">Valor por mês</th><th>A partir de</th><th></th><th><span class="sr-only">Editar</span></th></tr></thead><tbody>
        ${meus.map((d) => `<tr class="${passou(d) ? "plano-passou" : ""}"><td>${esc(d.destino)}</td><td class="r num">${Number(d.valor) > 0 ? brl(d.valor) : "pausa"}</td><td>${esc(rotuloMes(mesDe(d)))}</td>
          <td>${vig.has(d.id) ? '<span class="chip ok-chip">vale agora</span>' : mesDe(d) > mes ? '<span class="chip">próximo</span>' : '<span class="chip neutral">anterior</span>'}</td>
          <td class="r"><button type="button" class="btn-link" data-editar-degrau="${esc(d.id)}">Editar</button></td></tr>`).join("")}
        </tbody></table></div></div>`;
    }).join("");
  }

  function abrir(id = null) {
    const lista = degraus();
    const d = id ? lista.find((x) => x.id === id) : null;
    editando = d ? d.id : null;
    form.reset();
    erro("");
    $("#titulo-degrau").textContent = d ? `Editar degrau: ${d.destino}` : "Novo degrau do plano";
    form.elements.pessoa.innerHTML = pessoas.map((p) => `<option value="${esc(p.id)}">${esc(p.nome)}</option>`).join("");
    form.elements.pessoa.value = d ? d.perfil_id : pessoas[0].id;
    form.querySelector("[data-campo-pessoa]").hidden = pessoas.length < 2;
    $("#destinos-aporte").innerHTML = [...new Set(lista.map((x) => x.destino))].map((x) => `<option value="${esc(x)}"></option>`).join("");
    // Novo degrau: o mesmo destino do último cadastrado e o mês seguinte ao último degrau dele
    const ultimo = lista.filter((x) => x.perfil_id === form.elements.pessoa.value).sort((a, b) => mesDe(a).localeCompare(mesDe(b))).at(-1);
    form.elements.destino.value = d ? d.destino : ultimo ? ultimo.destino : "";
    form.elements.valor.value = d ? valorBR(d.valor) : "";
    form.elements.desde.value = d ? mesDe(d) : hojeChave();
    $("#btn-apagar-degrau").hidden = !d;
    dlg.showModal();
    (d ? form.elements.valor : form.elements.destino.value ? form.elements.valor : form.elements.destino).focus();
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const valor = numeroDigitado(form.elements.valor.value);
    if (valor == null || valor < 0) return erro("Informe o valor por mês (ex.: 1.500,00). Zero pausa os aportes nesse destino.");
    if (!form.elements.destino.value.trim()) return erro("Informe o destino (ex.: conta conjunta).");
    if (!form.elements.desde.value) return erro("Informe a partir de que mês o valor vale.");
    const botao = form.querySelector("[type=submit]");
    botao.disabled = true;
    try {
      const lista = await salvar({ ...(editando ? { id: editando } : {}), perfil_id: form.elements.pessoa.value, destino: form.elements.destino.value,
        valor: centavos(valor), vigente_desde: form.elements.desde.value });
      dlg.close();
      desenhar();
      aoMudar(lista);
      avisar(editando ? "Degrau do plano salvo." : "Degrau cadastrado no plano de aportes.");
    } catch (err) {
      erro("Não foi possível salvar: " + err.message);
    } finally {
      botao.disabled = false;
    }
  });
  $("#btn-apagar-degrau").addEventListener("click", async () => {
    const d = degraus().find((x) => x.id === editando);
    if (!d || !confirm(`Apagar o degrau de ${brl(d.valor)} em ${d.destino} a partir de ${rotuloMes(mesDe(d))} (${nomeDe(d.perfil_id)})?`)) return;
    try {
      const lista = await apagar(d.id);
      dlg.close();
      desenhar();
      aoMudar(lista);
      avisar("Degrau apagado.");
    } catch (err) {
      erro("Não foi possível apagar: " + err.message);
    }
  });
  $("#btn-novo-degrau").addEventListener("click", () => abrir());
  raiz.addEventListener("click", (e) => {
    const b = e.target.closest("[data-editar-degrau]");
    if (b) abrir(b.dataset.editarDegrau);
  });
  desenhar();
  return { desenhar };
}
