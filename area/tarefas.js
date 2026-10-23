// Tarefas pendentes da área restrita: o que espera uma decisão de quem está usando (lançamentos das finanças a
// classificar, ARTs que precisam de baixa ou ação, documentos do caixa a aprovar). A janela abre ao entrar no sistema,
// uma vez por sessão do navegador, sempre que houver alguma; cada tarefa leva para a página onde ela se resolve.
import { desenharFinancas } from "./financas-painel.js";
import { lerCategorias } from "./financas-classificacao.js";
import { esc } from "./ui.js";

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

export const tarefaClassificar = (n, href = "financas.html#classificar") => ({
  id: "classificar", n, href, botao: "Classificar agora", resumo: plural(n, "lançamento a classificar", "lançamentos a classificar"),
  titulo: n === 1 ? "Lançamento a classificar" : "Lançamentos a classificar",
  texto: `${plural(n, "lançamento das suas finanças está", "lançamentos das suas finanças estão")} sem categoria. Nenhum fica em “Outros”: escolha a categoria de cada um.`,
});

export const tarefaArts = (n, href = "art.html#acao") => ({
  id: "arts", n, href, botao: "Ver as ARTs", resumo: plural(n, "ART precisa de baixa ou ação", "ARTs precisam de baixa ou ação"),
  titulo: n === 1 ? "ART precisa de baixa ou ação" : "ARTs precisam de baixa ou ação",
  texto: "Vencidas, vencendo em até 30 dias ou com uma ação ainda a fazer: dar baixa, emitir substituta, complementar ou nova, ou arquivar.",
});

export const tarefaCaixa = (n, total, href = "caixa.html#caixa-pendentes") => ({
  id: "caixa", n, href, botao: "Aprovar documentos", resumo: plural(n, "documento do caixa a aprovar", "documentos do caixa a aprovar"),
  titulo: n === 1 ? "Documento do caixa a aprovar" : "Documentos do caixa a aprovar",
  texto: `RDV e fichas de custo que somam ${Number(total || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} e só entram no saldo do caixa depois de aprovados.`,
});

// Quantos lançamentos do painel de finanças da pessoa estão a classificar, com o mesmo cálculo do painel
export async function contarAClassificar(armazem, perfilId) {
  const registro = await armazem.financas.ler(perfilId);
  if (!registro) return 0;
  const [gastos, entradas, ajustes, prefs] = await Promise.all([
    armazem.financas.gastos(perfilId).catch(() => []),
    armazem.financas.entradas(perfilId).catch(() => []),
    armazem.financas.ajustes(perfilId).catch(() => []),
    armazem.financas.preferencias(perfilId).catch(() => null),
  ]);
  const painel = desenharFinancas({ dados: registro.dados, modo: registro.modo, gastosSite: gastos, entradasSite: entradas,
    categorias: lerCategorias(prefs, registro.dados), ajustes, comMeses: true, somenteCalculo: true });
  return painel.pendentes().length;
}

const chaveSessao = (perfil) => `mz-tarefas-${perfil && perfil.id}`;
function jaMostrou(perfil) {
  try {
    return sessionStorage.getItem(chaveSessao(perfil)) === "1";
  } catch {
    return false;
  }
}
function marcarMostrou(perfil) {
  try {
    sessionStorage.setItem(chaveSessao(perfil), "1");
  } catch {
    /* sem armazenamento: a janela volta a abrir na próxima página */
  }
}

// Abre a janela com as tarefas. automatico: ao entrar, só se ainda não abriu nesta sessão do navegador.
// aoAbrir: para a tarefa desta mesma página (link "#…"), em vez de seguir o link
export function mostrarTarefas(tarefas, { perfil = null, automatico = false, aoAbrir = null } = {}) {
  const lista = tarefas.filter((t) => t && t.n > 0);
  if (!lista.length || (automatico && jaMostrou(perfil))) return false;
  marcarMostrou(perfil);
  let dlg = document.getElementById("dlg-tarefas");
  if (!dlg) {
    dlg = document.createElement("dialog");
    dlg.id = "dlg-tarefas";
    dlg.className = "dialogo";
    dlg.setAttribute("aria-labelledby", "titulo-tarefas");
    document.body.append(dlg);
    dlg.addEventListener("click", (e) => {
      if (e.target === dlg || e.target.closest("[data-fechar-tarefas]")) dlg.close();
      const link = e.target.closest("a[href^='#']");
      if (link && aoAbrir) {
        e.preventDefault();
        dlg.close();
        aoAbrir(link.getAttribute("href"));
      }
    });
  }
  const total = lista.reduce((t, x) => t + x.n, 0);
  dlg.innerHTML = `<div class="dlg-cab"><h2 id="titulo-tarefas">Tarefas pendentes</h2><button class="btn-link" type="button" data-fechar-tarefas>Fechar</button></div>
    <div class="dlg-corpo">
      <p class="dica">${total === 1 ? "Um item precisa" : `${total} itens precisam`} da sua atenção.</p>
      <ul class="tarefas-lista">${lista.map((t) => `<li class="tarefa tarefa-${esc(t.id)}">
        <span class="tarefa-n">${t.n}</span>
        <div class="tarefa-texto"><b>${esc(t.titulo)}</b><p>${esc(t.texto)}</p></div>
        <a class="btn btn-primary" href="${esc(t.href)}">${esc(t.botao)}</a></li>`).join("")}</ul>
    </div>
    <div class="dlg-rodape"><button class="btn btn-claro" type="button" data-fechar-tarefas>Depois</button></div>`;
  dlg.showModal();
  return true;
}

// Faixa fixa (no início) que lembra as tarefas e reabre a janela
export function faixaTarefas(el, tarefas, opcoes = {}) {
  const lista = tarefas.filter((t) => t && t.n > 0);
  el.hidden = !lista.length;
  if (!lista.length) return;
  el.innerHTML = `<p><b>Tarefas pendentes:</b> ${lista.map((t) => esc(t.resumo)).join(" · ")}.</p>
    <button class="btn btn-claro" type="button" data-ver-tarefas>Ver tarefas</button>`;
  el.querySelector("[data-ver-tarefas]").onclick = () => mostrarTarefas(lista, opcoes);
}
