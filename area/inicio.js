// Início da área restrita (area/index.html): índice dos módulos liberados para o perfil, agrupados como no
// menu, com um resumo do que pede atenção em cada um.
import { abrirPagina, paginaEmpresa } from "./sessao.js";
import { GRUPOS, MODULOS, PAPEIS, pode, situacaoDe } from "./modulos.js";
import * as R from "./regras.js";
import * as G from "./regras-gestao.js";
import { resumoCaixa } from "./caixa-documentos.js";
import { $, esc, moeda, moedaCurta } from "./ui.js";
import { contarAClassificar, faixaTarefas, mostrarTarefas, tarefaArts, tarefaCaixa, tarefaClassificar } from "./tarefas.js";

const hoje = R.hojeISO();
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

function saudacao(nome) {
  const h = new Date().getHours();
  const periodo = h >= 5 && h < 12 ? "Bom dia" : h >= 12 && h < 18 ? "Boa tarde" : "Boa noite";
  return nome ? `${periodo}, ${nome.split(" ")[0]}` : periodo;
}

const dataHora = (iso) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString("pt-BR")} às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
};

function cabecalho(perfil) {
  const data = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  $("#inicio-data").textContent = data.charAt(0).toUpperCase() + data.slice(1);
  $("#saudacao").textContent = saudacao(perfil.nome);
  const ultimo = perfil.visita_anterior ? `último acesso em ${dataHora(perfil.visita_anterior)}` : "primeiro acesso";
  $("#inicio-sub").textContent = `${PAPEIS[perfil.papel].titulo} · ${ultimo}`;
}

// Resumo de cada módulo: { texto, alerta }. Só consulta o que o perfil pode ver.
async function resumos(armazem, perfil, empresas) {
  const tem = (m) => pode(perfil, m);
  const r = { tarefas: [] }; // tarefas pendentes (janela ao entrar)
  const [arts, tratados, todosLanc, demandas, usuarios, caixaConfig, caixaMov] = await Promise.all([
    tem("art") ? armazem.listar() : null,
    tem("art") ? armazem.tratados() : null,
    tem("financeiro") || tem("empresas") ? armazem.colecao("lancamentos").listar() : null,
    tem("demandas") ? armazem.colecao("demandas").listar() : null,
    tem("usuarios") ? armazem.usuarios.listar() : null,
    tem("empresas") && armazem.caixa ? armazem.caixa.config() : null,
    tem("empresas") ? armazem.colecao("caixa_movimentos").listar() : null,
  ].map((p) => Promise.resolve(p).catch(() => null)));
  // Caixa das empresas: o card dele fica no lugar dos cards das empresas que fazem parte dele
  if (caixaConfig && (caixaConfig.empresas || []).length) {
    const c = resumoCaixa(caixaConfig, caixaMov || []);
    const partes = [`${moeda(c.emCaixa)} em caixa`];
    if (c.comColaboradores) partes.push(`${moeda(c.comColaboradores)} com colaboradores`);
    if (c.aAprovar.n) partes.push(`${plural(c.aAprovar.n, "documento", "documentos")} a aprovar`);
    if (c.diferenca != null && c.diferenca < -0.005) partes.push(`${moeda(-c.diferenca)} a repor na conta`);
    r.caixa = { empresas: caixaConfig.empresas, texto: partes.join(" · "), alerta: c.aAprovar.n > 0 || (c.diferenca != null && c.diferenca < -0.005) };
    r.tarefas.push(tarefaCaixa(c.aAprovar.n, c.aAprovar.total));
  }
  // Controle financeiro e painel: só a engenharia; os lançamentos com empresa ficam nos cards das empresas
  const lancamentos = todosLanc && tem("financeiro") ? todosLanc.filter((l) => !l.empresa_id) : null;
  if (todosLanc && tem("empresas")) {
    r.empresas = {};
    for (const e of empresas) {
      const aReceber = todosLanc.filter((l) => l.empresa_id === e.id && l.tipo === "receita" && !l.pago_em);
      const atrasado = aReceber.some((l) => G.situacaoLancamento(l, hoje) === "atrasado");
      const total = aReceber.reduce((t, l) => t + Number(l.valor), 0);
      r.empresas[e.id] = total ? { texto: `${moeda(total)} a receber${atrasado ? " (com atraso)" : ""}`, alerta: atrasado } : { texto: "Nada a receber" };
    }
  }
  const financas = tem("financas") ? await Promise.resolve(armazem.financas.ler(perfil.id)).catch(() => undefined) : undefined;

  if (arts && tratados) {
    const alertas = R.alertasPendentes(arts, tratados, hoje).length;
    const proximas = arts.filter((a) => !R.encerrada(a) && a.fim && R.diasAte(a.fim, hoje) >= 0 && R.diasAte(a.fim, hoje) <= G.PRAZO_ART_PAINEL).length;
    const acoes = R.resumoAcoes(arts, hoje).total;
    r.tarefas.push(tarefaArts(acoes));
    r.art = acoes ? { texto: plural(acoes, "ART precisa de baixa ou ação", "ARTs precisam de baixa ou ação"), alerta: true }
      : alertas ? { texto: plural(alertas, "alerta pendente", "alertas pendentes"), alerta: true }
      : proximas ? { texto: `${plural(proximas, "ART vence", "ARTs vencem")} nos próximos ${G.PRAZO_ART_PAINEL} dias`, alerta: true }
      : { texto: "Nenhuma ART pedindo atenção" };
  }
  if (lancamentos) {
    const atrasados = lancamentos.filter((l) => l.tipo === "receita" && G.situacaoLancamento(l, hoje) === "atrasado");
    const total = atrasados.reduce((t, l) => t + Number(l.valor), 0);
    r.financeiro = atrasados.length ? { texto: `${moeda(total)} em atraso`, alerta: true } : { texto: "Nenhum recebimento em atraso" };
  }
  if (demandas) {
    const abertas = demandas.filter(G.emAberto);
    const vencidos = abertas.filter((d) => G.diasPrazo(d, hoje) < 0).length;
    r.demandas = vencidos ? { texto: plural(vencidos, "prazo vencido", "prazos vencidos"), alerta: true }
      : { texto: abertas.length ? plural(abertas.length, "demanda em aberto", "demandas em aberto") : "Nenhuma demanda em aberto" };
  }
  if (lancamentos) {
    const ano = G.resumoFinanceiro(lancamentos, G.periodo("ano", hoje), hoje);
    r.painel = { texto: `Lucro do ano: ${moedaCurta(ano.lucro)}` };
  }
  if (financas === null) r.financas = { texto: "Importe o arquivo do painel do projeto Financeiro", alerta: true };
  else if (financas) r.financas = { texto: financas.dados && financas.dados.gerado_em ? `Dados de ${financas.dados.gerado_em}` : "Dados importados" };
  if (usuarios) {
    const pendentes = usuarios.filter((u) => u.situacao === "pendente").length;
    const ativos = usuarios.filter((u) => situacaoDe(u) === "ativo").length;
    const aguardando = usuarios.filter((u) => situacaoDe(u) === "aguardando").length;
    r.usuarios = pendentes ? { texto: plural(pendentes, "conta aguardando liberação", "contas aguardando liberação"), alerta: true }
      : { texto: plural(ativos, "usuário ativo", "usuários ativos") + (aguardando ? ` · ${aguardando} aguardando 1º acesso` : "") };
  }
  return r;
}

function card(m, resumo, empresa = null, caixa = null) {
  const titulo = caixa ? `Caixa ${esc(caixa.nome)}` : empresa ? `Finanças ${esc(empresa.nome)}` : m.titulo;
  const descricao = caixa ? "Adiantamento das empresas num caixa só: saldo, conta do caixa, colaboradores, RDV e fichas de custo a aprovar."
    : empresa ? (empresa.observacao ? esc(empresa.observacao) : "Reembolsos, ARTs pagas pela empresa e o que falta receber.") : m.descricao;
  return `<a class="modulo" href="${caixa ? "caixa.html" : empresa ? paginaEmpresa(empresa) : m.pagina}">
      <span class="modulo-icone">${m.icone}</span>
      <h2>${titulo}</h2>
      <p>${descricao}</p>
      ${resumo ? `<span class="modulo-status${resumo.alerta ? " com-alerta" : ""}">${esc(resumo.texto)}</span>` : ""}
      <span class="modulo-abrir">Abrir</span>
    </a>`;
}

// Cards de um módulo: as finanças das empresas têm um card por empresa cadastrada; as que fazem parte do caixa das
// empresas aparecem juntas, no card do caixa (as páginas delas continuam abertas a partir dele)
function cardsDoModulo(m, resumo, empresas) {
  if (m.id !== "empresas") return [card(m, resumo[m.id])];
  if (!empresas.length) return [card(m, { texto: "Cadastre as empresas para começar", alerta: true })];
  const noCaixa = resumo.caixa ? empresas.filter((e) => resumo.caixa.empresas.includes(e.id)) : [];
  const nomes = noCaixa.map((e) => e.nome);
  const caixa = noCaixa.length ? [card(m, resumo.caixa, null, { nome: nomes.length < 2 ? nomes.join("") : `${nomes.slice(0, -1).join(", ")} e ${nomes.at(-1)}` })] : [];
  return [...caixa, ...empresas.filter((e) => !noCaixa.includes(e)).map((e) => card(m, resumo.empresas && resumo.empresas[e.id], e))];
}

// Cada grupo ocupa tantas colunas quantos cards tiver (até 4): grupos pequenos ficam lado a lado
function renderizar(perfil, empresas, resumo = {}) {
  const grupos = GRUPOS.map((g) => {
    const cards = MODULOS.filter((m) => m.grupo === g.id && pode(perfil, m.id)).flatMap((m) => cardsDoModulo(m, resumo, empresas));
    if (!cards.length) return "";
    const colunas = Math.min(cards.length, 4);
    return `<section class="inicio-grupo span-${colunas}" style="--colunas:${colunas}" aria-labelledby="g-${g.id}">
        <h2 class="subtitulo-area" id="g-${g.id}">${g.titulo}</h2>
        <div class="modulos">${cards.join("")}</div>
      </section>`;
  });
  const soConta = MODULOS.every((m) => m.todos || !pode(perfil, m.id));
  $("#aviso-vazio").hidden = !soConta;
  $("#grupos").innerHTML = grupos.join("");
}

// Início: roda depois de todo o módulo carregado
async function iniciar() {
  const sessao = await abrirPagina("index.html");
  if (!sessao) return;
  const { armazem, perfil, empresas } = sessao;
  cabecalho(perfil);

  const negado = MODULOS.find((m) => m.id === new URLSearchParams(location.search).get("sem-permissao"));
  if (negado) {
    $("#aviso-inicio").textContent = `Seu perfil não tem acesso a ${negado.titulo}. Se precisar, fale com o administrador.`;
    $("#aviso-inicio").hidden = false;
    history.replaceState(null, "", location.pathname);
  }

  renderizar(perfil, empresas);
  $("#conteudo").hidden = false;
  const resumo = await resumos(armazem, perfil, empresas);
  renderizar(perfil, empresas, resumo);

  // Tarefas pendentes: lançamentos a classificar no próprio painel de finanças, ARTs que precisam de baixa ou ação e
  // documentos do caixa a aprovar. A janela abre ao entrar (uma vez por sessão); a faixa fica no início.
  const aClassificar = pode(perfil, "financas")
    ? await contarAClassificar(armazem, perfil.id).catch((err) => { console.warn("Tarefas: não deu para contar os lançamentos a classificar.", err); return 0; })
    : 0;
  if (aClassificar) {
    resumo.financas = { texto: `${aClassificar} ${aClassificar === 1 ? "lançamento a classificar" : "lançamentos a classificar"}`, alerta: true };
    renderizar(perfil, empresas, resumo);
  }
  const tarefas = [tarefaClassificar(aClassificar), ...resumo.tarefas];
  faixaTarefas($("#faixa-tarefas"), tarefas, { perfil });
  mostrarTarefas(tarefas, { perfil, automatico: true });
}

iniciar();
