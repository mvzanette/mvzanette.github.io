// Início da área restrita (area/index.html): índice dos módulos liberados para o perfil, agrupados como no
// menu, com um resumo do que pede atenção em cada um.
import { abrirPagina } from "./sessao.js";
import { GRUPOS, MODULOS, PAPEIS, pode, situacaoDe } from "./modulos.js";
import * as R from "./regras.js";
import * as G from "./regras-gestao.js";
import { $, esc, moeda, moedaCurta } from "./ui.js";

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
async function resumos(armazem, perfil) {
  const tem = (m) => pode(perfil, m);
  const r = {};
  const [arts, tratados, lancamentos, demandas, usuarios] = await Promise.all([
    tem("art") ? armazem.listar() : null,
    tem("art") ? armazem.tratados() : null,
    tem("financeiro") ? armazem.colecao("lancamentos").listar() : null,
    tem("demandas") ? armazem.colecao("demandas").listar() : null,
    tem("usuarios") ? armazem.usuarios.listar() : null,
  ].map((p) => Promise.resolve(p).catch(() => null)));
  const financas = tem("financas") ? await Promise.resolve(armazem.financas.ler(perfil.id)).catch(() => undefined) : undefined;

  if (arts && tratados) {
    const alertas = R.alertasPendentes(arts, tratados, hoje).length;
    const proximas = arts.filter((a) => !a.baixa_data && a.fim && R.diasAte(a.fim, hoje) >= 0 && R.diasAte(a.fim, hoje) <= G.PRAZO_ART_PAINEL).length;
    r.art = alertas ? { texto: plural(alertas, "alerta pendente", "alertas pendentes"), alerta: true }
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

function card(m, resumo) {
  return `<a class="modulo" href="${m.pagina}">
      <span class="modulo-icone">${m.icone}</span>
      <h2>${m.titulo}</h2>
      <p>${m.descricao}</p>
      ${resumo ? `<span class="modulo-status${resumo.alerta ? " com-alerta" : ""}">${esc(resumo.texto)}</span>` : ""}
      <span class="modulo-abrir">Abrir</span>
    </a>`;
}

// Cada grupo ocupa tantas colunas quantos cards tiver (até 4): grupos pequenos ficam lado a lado
function renderizar(perfil, resumo = {}) {
  const grupos = GRUPOS.map((g) => {
    const mods = MODULOS.filter((m) => m.grupo === g.id && pode(perfil, m.id));
    if (!mods.length) return "";
    const colunas = Math.min(mods.length, 4);
    return `<section class="inicio-grupo span-${colunas}" style="--colunas:${colunas}" aria-labelledby="g-${g.id}">
        <h2 class="subtitulo-area" id="g-${g.id}">${g.titulo}</h2>
        <div class="modulos">${mods.map((m) => card(m, resumo[m.id])).join("")}</div>
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
  const { armazem, perfil } = sessao;
  cabecalho(perfil);

  const negado = MODULOS.find((m) => m.id === new URLSearchParams(location.search).get("sem-permissao"));
  if (negado) {
    $("#aviso-inicio").textContent = `Seu perfil não tem acesso a ${negado.titulo}. Se precisar, fale com o administrador.`;
    $("#aviso-inicio").hidden = false;
    history.replaceState(null, "", location.pathname);
  }

  renderizar(perfil);
  $("#conteudo").hidden = false;
  renderizar(perfil, await resumos(armazem, perfil));
}

iniciar();
