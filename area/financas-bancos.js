// Bancos conectados (aba Bancos): saldos das contas, cartões e investimentos e o extrato, que uma rotina do GitHub
// Actions lê no Pluggy (Open Finance, pelo Meu Pluggy) e grava no banco duas vezes por dia. Aqui só se cadastra o
// código de cada conexão; as chaves do Pluggy ficam nos secrets do GitHub e nunca passam pelo navegador.
// O extrato também alimenta Importar extrato: as saídas ainda não revisadas viram a mesma prévia do arquivo OFX.
// Nenhum dado pessoal aqui: bancos, contas e valores vêm do banco.
import { $, esc, avisar, baixarCsv } from "./ui.js";

const brl = (v) => (v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const centavos = (v) => Math.round((Number(v) || 0) * 100) / 100;
const dataBR = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");
const quandoBR = (ts) => {
  if (!ts) return "";
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const rotuloMes = (chave) => `${MESES[Number(chave.slice(5, 7)) - 1]}/${chave.slice(2, 4)}`;
const hojeISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const diasAtras = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const diasAte = (ts) => Math.floor((Date.parse(ts) - Date.now()) / 864e5);
const TIPO = { conta: "Conta", cartao: "Cartão de crédito", investimento: "Investimento" };

// Nome que aparece para a conexão: o apelido, o banco que a rotina leu ou um genérico
export const nomeConexao = (c) => (c && (c.apelido || c.banco)) || "Banco";

// Situação da conexão: [texto, classe do chip, alerta (ou null)]
export function situacaoConexao(c) {
  if (!c.sincronizado_em && !c.situacao) return ["Aguardando a primeira leitura", "neutral", null];
  if (c.situacao === "ERRO" || /ERROR/.test(c.situacao || "")) return ["Com erro", "bad", c.erro || "A última leitura falhou."];
  if (c.consentimento_ate && diasAte(c.consentimento_ate) < 0) return ["Autorização vencida", "bad", "A autorização venceu: renove no painel do Pluggy (veja Como conectar)."];
  if (c.situacao === "OUTDATED") return ["Desatualizada", "bad", c.erro || "O banco não atualizou na última leitura."];
  if (c.consentimento_ate && diasAte(c.consentimento_ate) <= 30) return ["Renovar em breve", "bad", `A autorização vence em ${dataBR(String(c.consentimento_ate).slice(0, 10))}. Renove no painel do Pluggy para não parar.`];
  return ["Em dia", "ok-chip", null];
}

// ---------------------------------------------------------------- extrato dos bancos para Importar extrato
// Categorias do Pluggy que dizem o que a saída é (as mesmas exceções do OFX: fatura, investimento, conta própria)
export function motivoDaCategoria(categoria) {
  const c = String(categoria || "");
  if (/credit card payment|pagamento de (fatura|cart)/i.test(c)) return "fatura";
  if (/invest|fixed income|renda fixa|poupan|savings/i.test(c)) return "investimento";
  if (/same person|mesma titularidade|entre contas/i.test(c)) return "propria";
  return null;
}

// Leitura no mesmo formato do arquivo do extrato (lerExtrato), com as saídas e entradas das contas (não dos cartões,
// que entram pela fatura) ainda não revisadas. ids: os movimentos que a importação marca como revisados.
export function leituraDosBancos(bancos) {
  const contas = new Map((bancos && bancos.contas || []).filter((c) => c.tipo === "conta").map((c) => [c.id, c]));
  const conexoes = new Map((bancos && bancos.conexoes || []).map((c) => [c.id, c]));
  const movs = (bancos && bancos.movimentos || []).filter((m) => contas.has(m.conta_id) && !m.revisado_em)
    .sort((a, b) => a.data.localeCompare(b.data));
  if (!movs.length) return null;
  const nomes = [...new Set(movs.map((m) => nomeConexao(conexoes.get(contas.get(m.conta_id).conexao_id))))];
  return {
    formato: "Open Finance",
    banco: nomes.join(", "),
    inicio: movs[0].data,
    fim: movs.at(-1).data,
    ids: movs.map((m) => m.id),
    movimentos: movs.map((m) => ({
      data: m.data, valor: centavos(m.valor), id: m.id, tipo: "",
      // O texto do banco (descricao_banco) é o que as regras do OFX reconhecem (Pix, boleto, fatura...)
      descricao: m.descricao_banco || m.descricao,
      motivo: motivoDaCategoria(m.categoria),
      forma: /pix/i.test(m.categoria || "") ? "pix" : null,
    })),
  };
}

// ---------------------------------------------------------------- aba Bancos
// bancos: { conexoes, contas, movimentos }; salvar(conexao) e apagar(id) gravam e devolvem os bancos de novo
export function prepararBancos({ bancos, perfilId, salvar, apagar }) {
  const raiz = $("#view-bancos");
  if (!raiz) return { desenhar() {}, atualizar() {} };
  let dados = bancos;
  let filtro = { conta: "", periodo: "30", busca: "" };
  let todos = false;
  let editando = null;

  const contasDe = (conexaoId) => dados.contas.filter((c) => c.conexao_id === conexaoId);
  const conexaoDe = (conta) => dados.conexoes.find((c) => c.id === conta.conexao_id);
  const nomeConta = (conta) => [nomeConexao(conexaoDe(conta)), conta.nome || TIPO[conta.tipo], conta.final ? `final ${conta.final}` : ""].filter(Boolean).join(" · ");

  function desenhar() {
    const { conexoes, contas } = dados;
    $("#btn-novo-banco").hidden = false;
    // Avisos: conexões com erro ou autorização vencendo
    $("#bc-alertas").innerHTML = conexoes.map((c) => [c, situacaoConexao(c)]).filter(([, s]) => s[2])
      .map(([c, s]) => `<div class="alert bad" role="status"><span class="sev"></span><div><b>${esc(nomeConexao(c))}: ${esc(s[0].toLowerCase())}.</b> ${esc(s[2])}</div></div>`).join("");

    if (!conexoes.length) {
      $("#bc-saldos").innerHTML = `<h2>Nenhum banco conectado ainda</h2>
        <p class="sub">Conecte os bancos pelo Meu Pluggy (Open Finance, gratuito para uso pessoal). Duas vezes por dia o site lê os saldos, os cartões, os investimentos e o extrato de cada conta, e as saídas do extrato aparecem para importar como gastos.</p>
        ${comoConectar(true)}`;
      $("#bc-extrato").hidden = true;
      $("#bc-conexoes").hidden = true;
      return;
    }

    // Saldos: uma linha por conta, cartão ou investimento, agrupadas por banco
    const soma = (tipo) => centavos(contas.filter((c) => c.tipo === tipo).reduce((t, c) => t + (Number(c.saldo) || 0), 0));
    const totais = [["Em conta", soma("conta")], ["Investido", soma("investimento")], ["Faturas dos cartões", soma("cartao")]].filter(([, v], i) => i === 0 || v);
    const linhas = conexoes.flatMap((cx) => {
      const lista = contasDe(cx.id).sort((a, b) => ["conta", "cartao", "investimento"].indexOf(a.tipo) - ["conta", "cartao", "investimento"].indexOf(b.tipo) || (a.nome || "").localeCompare(b.nome || ""));
      const cab = `<tr class="bc-grupo"><th colspan="2">${esc(nomeConexao(cx))} <span class="chip ${situacaoConexao(cx)[1]}">${esc(situacaoConexao(cx)[0])}</span>
        ${cx.banco_atualizado_em ? `<div class="sub" style="font-weight:400">banco atualizou em ${esc(quandoBR(cx.banco_atualizado_em))}</div>` : ""}</th></tr>`;
      if (!lista.length) return [cab, `<tr><td colspan="2" class="sub">${cx.sincronizado_em ? "Nenhuma conta nesta conexão." : "Os dados aparecem depois da próxima leitura (7h ou 19h)."}</td></tr>`];
      return [cab, ...lista.map((c) => `<tr><td>${esc(c.nome || TIPO[c.tipo])}<div class="sub">${esc(TIPO[c.tipo])}${c.final ? ` · final ${esc(c.final)}` : ""}</div></td>
        <td class="r num ${c.tipo === "cartao" ? "" : Number(c.saldo) < 0 ? "neg" : ""}">${brl(c.saldo)}${c.tipo === "cartao" ? `<div class="sub">fatura atual${c.vencimento ? `, vence ${dataBR(c.vencimento)}` : ""}${c.limite_disponivel != null ? `<br>limite disponível ${brl(c.limite_disponivel)}` : ""}</div>` : ""}</td></tr>`)];
    });
    $("#bc-saldos").innerHTML = `<h2>Saldos</h2>
      <div class="bc-totais">${totais.map(([r, v]) => `<div><span class="sub">${r}</span><b class="num">${brl(v)}</b></div>`).join("")}</div>
      <div class="scroll"><table class="bc-tabela"><tbody>${linhas.join("")}</tbody></table></div>
      <p class="sub" style="margin:10px 0 0">O Meu Pluggy atualiza os bancos uma vez por dia e o site lê às 7h e às 19h. Última leitura: ${esc(quandoBR(conexoes.map((c) => c.sincronizado_em).filter(Boolean).sort().at(-1)) || "ainda não houve")}.</p>`;

    desenharExtrato();
    desenharConexoes();
  }

  function movimentosFiltrados() {
    const contas = new Map(dados.contas.map((c) => [c.id, c]));
    const mes = /^\d{4}-\d{2}$/.test(filtro.periodo) ? filtro.periodo : null;
    const desde = mes ? null : diasAtras(Number(filtro.periodo) || 30);
    const busca = filtro.busca.trim().toLowerCase();
    return dados.movimentos.filter((m) => contas.has(m.conta_id) && (!filtro.conta || m.conta_id === filtro.conta)
      && (mes ? m.data.startsWith(mes) : m.data >= desde)
      && (!busca || `${m.descricao} ${m.descricao_banco || ""} ${m.categoria || ""}`.toLowerCase().includes(busca)))
      .sort((a, b) => b.data.localeCompare(a.data));
  }

  function desenharExtrato() {
    const painel = $("#bc-extrato");
    const contasComMov = dados.contas.filter((c) => c.tipo !== "investimento");
    painel.hidden = !contasComMov.length;
    if (!contasComMov.length) return;
    const meses = [...new Set(dados.movimentos.map((m) => m.data.slice(0, 7)))].sort().reverse();
    const lista = movimentosFiltrados();
    const vis = todos ? lista : lista.slice(0, 100);
    const entradas = centavos(lista.filter((m) => m.valor > 0).reduce((t, m) => t + m.valor, 0));
    const saidas = centavos(lista.filter((m) => m.valor < 0).reduce((t, m) => t - m.valor, 0));
    const contas = new Map(dados.contas.map((c) => [c.id, c]));
    const umaConta = !!filtro.conta;
    const sel = (v, atual) => (v === atual ? " selected" : "");
    painel.innerHTML = `<h2>Extrato</h2>
      <div class="bc-filtros">
        <label>Conta<select data-bc="conta"><option value="">Todas as contas e cartões</option>${contasComMov.map((c) => `<option value="${esc(c.id)}"${sel(c.id, filtro.conta)}>${esc(nomeConta(c))}</option>`).join("")}</select></label>
        <label>Período<select data-bc="periodo"><option value="30"${sel("30", filtro.periodo)}>Últimos 30 dias</option><option value="90"${sel("90", filtro.periodo)}>Últimos 90 dias</option>${meses.map((k) => `<option value="${k}"${sel(k, filtro.periodo)}>${rotuloMes(k)}</option>`).join("")}</select></label>
        <label>Buscar<input type="search" data-bc="busca" value="${esc(filtro.busca)}" placeholder="descrição ou categoria" autocomplete="off"></label>
        <button type="button" class="btn sec mini" id="bc-csv"${lista.length ? "" : " disabled"}>Baixar planilha</button>
      </div>
      <p class="sub" style="margin:4px 0 10px">${lista.length} ${lista.length === 1 ? "movimento" : "movimentos"} · entradas <span class="pos">${brl(entradas)}</span> · saídas <span class="neg">${brl(saidas)}</span></p>
      ${lista.length ? `<div class="scroll"><table class="bc-mov"><thead><tr><th>Data</th><th>Descrição</th><th class="r">Valor</th>${umaConta ? '<th class="r">Saldo depois</th>' : ""}</tr></thead><tbody>
      ${vis.map((m) => { const c = contas.get(m.conta_id); return `<tr><td class="num">${dataBR(m.data)}</td>
        <td>${esc(m.descricao)}<div class="sub">${[m.categoria, umaConta ? "" : nomeConta(c), m.revisado_em && c.tipo === "conta" ? "revisado" : ""].filter(Boolean).map(esc).join(" · ")}</div></td>
        <td class="r num ${m.valor < 0 ? "neg" : "pos"}">${m.valor < 0 ? "−" : "+"}${brl(Math.abs(m.valor))}</td>
        ${umaConta ? `<td class="r num sub">${m.saldo_apos == null ? "" : brl(m.saldo_apos)}</td>` : ""}</tr>`; }).join("")}
      </tbody></table></div>${lista.length > vis.length ? `<button type="button" class="btn sec mini" id="bc-todos" style="margin-top:10px">Mostrar todos os ${lista.length}</button>` : ""}`
      : '<p class="muted" style="margin:0">Nenhum movimento nesse período.</p>'}`;
    painel.querySelectorAll("[data-bc]").forEach((el) => {
      el.addEventListener(el.tagName === "INPUT" ? "input" : "change", () => {
        filtro[el.dataset.bc] = el.value;
        todos = false;
        const foco = el.dataset.bc, pos = el.selectionStart;
        desenharExtrato();
        const novo = painel.querySelector(`[data-bc="${foco}"]`);
        if (novo) { novo.focus(); if (novo.tagName === "INPUT" && pos != null) novo.setSelectionRange(pos, pos); }
      });
    });
    const t = $("#bc-todos");
    if (t) t.onclick = () => { todos = true; desenharExtrato(); };
    $("#bc-csv").onclick = () => baixarCsv(`extrato-${hojeISO()}.csv`, ["Data", "Conta", "Descrição", "Categoria", "Valor", "Saldo depois"],
      lista.map((m) => [dataBR(m.data), nomeConta(contas.get(m.conta_id)), m.descricao, m.categoria || "", m.valor, m.saldo_apos]));
  }

  function desenharConexoes() {
    const painel = $("#bc-conexoes");
    painel.hidden = false;
    painel.innerHTML = `<h2>Conexões</h2>
      <ul class="bc-conexoes">${dados.conexoes.map((c) => { const s = situacaoConexao(c); return `<li>
        <div><b>${esc(nomeConexao(c))}</b> <span class="chip ${s[1]}">${esc(s[0])}</span>
          <div class="sub">${[c.sincronizado_em ? `lida em ${quandoBR(c.sincronizado_em)}` : "ainda não lida", c.consentimento_ate ? `autorização até ${dataBR(String(c.consentimento_ate).slice(0, 10))}` : "", `código …${c.item_id.slice(-6)}`].filter(Boolean).map(esc).join(" · ")}</div>
          ${c.erro && s[1] === "bad" ? `<div class="sub neg">${esc(c.erro)}</div>` : ""}</div>
        <div class="bc-con-acoes"><button type="button" class="btn-link" data-bc-renomear="${esc(c.id)}">Renomear</button><button type="button" class="btn-link" data-bc-apagar="${esc(c.id)}">Remover</button></div></li>`; }).join("")}</ul>
      ${comoConectar(false)}`;
    painel.querySelectorAll("[data-bc-renomear]").forEach((b) => { b.onclick = () => abrir(dados.conexoes.find((c) => c.id === b.dataset.bcRenomear)); });
    painel.querySelectorAll("[data-bc-apagar]").forEach((b) => {
      b.onclick = async () => {
        const c = dados.conexoes.find((x) => x.id === b.dataset.bcApagar);
        if (!c || !confirm(`Remover ${nomeConexao(c)}? Os saldos e o extrato dessa conexão saem do site (os gastos já importados ficam). A autorização no Meu Pluggy continua até você revogar lá.`)) return;
        try {
          dados = await apagar(c.id);
          desenhar();
          avisar("Conexão removida.");
        } catch (e) {
          avisar("Não foi possível remover: " + e.message);
        }
      };
    });
  }

  function comoConectar(aberto) {
    return `<details class="como"${aberto ? " open" : ""}><summary>Como conectar um banco</summary><ol>
      <li>Crie sua conta grátis em <a href="https://meu.pluggy.ai" target="_blank" rel="noopener">meu.pluggy.ai</a> e conecte lá os seus bancos (pelo Open Finance: o próprio banco pede a autorização).</li>
      <li>No <a href="https://dashboard.pluggy.ai" target="_blank" rel="noopener">painel do Pluggy</a> (dashboard.pluggy.ai), crie a conta de desenvolvedor, ative o conector <b>MeuPluggy</b> e crie uma aplicação de desenvolvimento. O administrador do site guarda o Client ID e o Client Secret dela nos secrets do GitHub (README, seção “Bancos conectados”), uma vez só.</li>
      <li>Na aplicação, abra <b>Demo</b>, conecte o <b>MeuPluggy</b> e autorize cada banco. Em <b>Connected Items</b>, copie o código (itemId) de cada um.</li>
      <li>Aqui, em <b>Conectar banco</b>, cole o código. Os dados aparecem na próxima leitura (7h ou 19h), ou na hora em GitHub → Actions → Bancos conectados → Run workflow.</li>
    </ol><p class="sub">Grátis para uso pessoal, até 5 conexões. A autorização vale um ano: para renovar, repita o passo 3. O site só lê os dados; nada é pago ou transferido por aqui.</p></details>`;
  }

  // ---------- diálogo Conectar banco / Renomear
  function abrir(conexao = null) {
    editando = conexao;
    const f = $("#form-banco");
    f.reset();
    $("#titulo-banco").textContent = conexao ? "Renomear conexão" : "Conectar banco";
    f.item_id.value = conexao ? conexao.item_id : "";
    f.item_id.disabled = !!conexao;
    f.apelido.value = conexao ? conexao.apelido || "" : "";
    $("#erro-banco").hidden = true;
    $("#dlg-banco").showModal();
  }

  $("#btn-novo-banco").addEventListener("click", () => abrir());
  $("#form-banco").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    const botao = f.querySelector("[type=submit]");
    botao.disabled = true;
    try {
      dados = await salvar({ id: editando ? editando.id : undefined, perfil_id: perfilId, item_id: editando ? editando.item_id : f.item_id.value, apelido: f.apelido.value });
      $("#dlg-banco").close();
      desenhar();
      avisar(editando ? "Nome salvo." : "Banco cadastrado. Os dados aparecem na próxima leitura (7h ou 19h).");
    } catch (err) {
      $("#erro-banco").textContent = err.message;
      $("#erro-banco").hidden = false;
    } finally {
      botao.disabled = false;
    }
  });

  desenhar();
  return { desenhar, atualizar(novos) { dados = novos; desenhar(); }, dados: () => dados };
}
