// Tela de login da área restrita (area-restrita.html). Depois de entrar, abre o início (índice dos módulos)
// ou a página pedida.
import { conectar, PAGINA_INICIO } from "./sessao.js";

const $ = (sel) => document.querySelector(sel);
const parametros = new URLSearchParams(location.search);

// O link de "Esqueci a senha" volta com type=recovery no endereço; o Supabase limpa o endereço ao ler o link
const recuperacao = /type=recovery/.test(location.hash);

// Só aceita páginas da própria área (ex.: art.html) como destino depois do login
const pedida = parametros.get("volta") || "";
const destino = /^[a-z0-9-]+\.html$/.test(pedida) ? new URL(pedida, PAGINA_INICIO).href : PAGINA_INICIO;

// Volta da área com o acesso bloqueado (ver abrirPagina em sessao.js)
const AVISOS_ACESSO = {
  pendente: "Sua conta ainda não foi liberada. O administrador precisa definir o seu perfil de acesso.",
  inativo: "Seu acesso está desativado. Se precisar entrar, fale com o administrador.",
};

let tempoToast;
function avisar(texto) {
  const t = $("#toast");
  t.textContent = texto;
  t.hidden = false;
  clearTimeout(tempoToast);
  tempoToast = setTimeout(() => (t.hidden = true), 6000);
}

function mostrar(id) {
  $("#tela-login").hidden = false;
  $("#form-login").hidden = id !== "form-login";
  $("#form-nova-senha").hidden = id !== "form-nova-senha";
  $(`#${id} input`).focus();
}

const aviso = AVISOS_ACESSO[parametros.get("acesso")];
if (aviso) {
  $("#aviso-acesso").textContent = aviso;
  $("#aviso-acesso").hidden = false;
}

let armazem;
try {
  armazem = await conectar();
} catch {
  mostrar("form-login");
  $("#erro-login").hidden = false;
  $("#erro-login").textContent = "Não foi possível conectar ao banco de dados. Verifique a internet e a configuração.";
}

if (armazem) {
  if (armazem.modo === "demo") $("#aviso-demo").hidden = false;
  const usuario = await armazem.usuario();
  if (usuario && recuperacao) mostrar("form-nova-senha");
  else if (usuario && !aviso) location.replace(destino);
  else mostrar("form-login");
}

$("#form-login").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const erro = $("#erro-login");
  erro.hidden = true;
  try {
    await armazem.entrar(f.get("email").trim(), f.get("senha"));
    location.replace(destino);
  } catch {
    erro.hidden = false;
    erro.textContent = "Usuário ou senha inválidos.";
  }
});

$("#btn-recuperar").addEventListener("click", async () => {
  const email = $("#form-login").elements.email.value.trim();
  if (!email) return avisar("Digite o usuário (e-mail) para receber o link de recuperação.");
  if (armazem.modo === "demo") return avisar("No modo demonstração não há envio de e-mail de recuperação.");
  try {
    await armazem.recuperarSenha(email);
    avisar("Se o e-mail estiver cadastrado, você receberá um link para criar uma nova senha. Se não chegar, peça ao administrador.");
  } catch {
    avisar("Não foi possível enviar o e-mail de recuperação. Peça ao administrador para redefinir a sua senha.");
  }
});

$("#form-nova-senha").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const erro = $("#erro-senha");
  erro.hidden = true;
  if (f.get("senha") !== f.get("confirmacao")) {
    erro.hidden = false;
    erro.textContent = "As senhas não conferem.";
    return;
  }
  try {
    await armazem.definirSenha(f.get("senha"));
    location.replace(PAGINA_INICIO);
  } catch (err) {
    erro.hidden = false;
    erro.textContent = "Não foi possível salvar a nova senha. " + err.message;
  }
});
