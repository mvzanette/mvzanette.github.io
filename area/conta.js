// Minha conta (area/conta.html): nome, troca de senha e os últimos acessos de quem está logado.
import { abrirPagina } from "./sessao.js";
import { MODULOS, PAPEIS, PERMISSOES, liberavel } from "./modulos.js";
import { $, esc, avisar } from "./ui.js";

const dataHora = (iso) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
};
const nomePagina = (pagina) => (pagina === "index.html" ? "Início" : (MODULOS.find((m) => m.pagina === pagina) || {}).titulo || pagina || "—");

function renderDados(perfil, usuario) {
  const form = $("#form-dados");
  form.elements.nome.value = perfil.nome || "";
  $("#conta-email").textContent = perfil.email || usuario.email || "";
  $("#conta-papel").textContent = PAPEIS[perfil.papel].titulo;
  const mods = (perfil.modulos || []).filter((m) => liberavel(perfil.papel, m));
  $("#conta-modulos").textContent = perfil.papel === "adm" ? "Todos"
    : mods.length ? mods.map((m) => (PERMISSOES.find((p) => p.id === m) || {}).titulo || m).join(", ") : "Nenhum";
  $("#conta-primeiro").textContent = perfil.primeiro_acesso ? dataHora(perfil.primeiro_acesso) : "—";
}

async function renderAcessos(armazem, perfil) {
  let lista = [];
  try {
    lista = (await armazem.acessos({ limite: 200 })).filter((a) => a.perfil_id === perfil.id).slice(0, 15);
  } catch {
    /* sem histórico: mostra a tabela vazia */
  }
  $("#meus-acessos").innerHTML = lista.length
    ? lista.map((a) => `<tr><td class="data">${dataHora(a.em)}</td><td>${esc(nomePagina(a.pagina))}</td><td>${esc(a.dispositivo || "—")}</td></tr>`).join("")
    : `<tr><td colspan="3" class="vazio">Nenhum acesso registrado.</td></tr>`;
}

// Início: roda depois de todo o módulo carregado
async function iniciar() {
  const sessao = await abrirPagina("conta.html");
  if (!sessao) return;
  const { armazem, usuario, perfil } = sessao;
  renderDados(perfil, usuario);
  $("#conteudo").hidden = false;

  $("#form-dados").addEventListener("submit", async (e) => {
    e.preventDefault();
    const nome = e.target.elements.nome.value.trim();
    try {
      await armazem.atualizarMeuNome(nome);
      $("#usuario").textContent = nome || perfil.email;
      avisar("Nome salvo.");
    } catch (err) {
      avisar("Não foi possível salvar o nome: " + err.message);
    }
  });

  $("#form-senha").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const erro = $("#erro-senha");
    erro.hidden = true;
    const senha = form.elements.senha.value;
    if (senha.length < 8) {
      erro.textContent = "A senha precisa ter pelo menos 8 caracteres.";
      erro.hidden = false;
      return;
    }
    if (senha !== form.elements.confirmacao.value) {
      erro.textContent = "As senhas não conferem.";
      erro.hidden = false;
      return;
    }
    try {
      await armazem.definirSenha(senha);
      form.reset();
      avisar(armazem.modo === "demo" ? "No modo demonstração a senha não é guardada." : "Senha alterada.");
    } catch (err) {
      erro.textContent = "Não foi possível trocar a senha. " + err.message;
      erro.hidden = false;
    }
  });

  renderAcessos(armazem, perfil);
}

iniciar();
