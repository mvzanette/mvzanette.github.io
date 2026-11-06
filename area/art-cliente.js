// Controle de ART – acompanhamento pelo cliente: ao subir uma ART, pergunta se ela será acompanhada ou monitorada por
// algum cliente e, se sim, abre a configuração (cliente da base, aparecer no portal dele e e-mail antes do vencimento).
// O e-mail sai da rotina diária do GitHub (ferramentas/avisos-clientes.mjs), aviso_dias antes do fim previsto.
import { dataBR } from "./regras.js";
import { $, esc, avisar, opcoes } from "./ui.js";

const soDigitos = (v) => String(v || "").replace(/\D/g, "");
const semAcento = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const lerEmails = (texto) =>
  [...new Set(String(texto || "").split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)))];

// Cliente da base que combina com a ART (pela raiz do CNPJ, pelo CPF ou pelo nome do contratante)
export function clienteSugerido(art, clientes) {
  const d = soDigitos(art.contratante_doc);
  const porDoc = d && clientes.find((c) => {
    const x = soDigitos(c.documento);
    return x && (d.length === 14 && x.length === 14 ? x.slice(0, 8) === d.slice(0, 8) : x === d);
  });
  return porDoc || clientes.find((c) => art.contratante && semAcento(c.nome) === semAcento(art.contratante)) || null;
}

// Resumo no formulário da ART
export function blocoAcompanhamento(art, clientes) {
  const c = art.acompanhada && clientes.find((x) => x.id === art.cliente_id);
  const emails = (art.aviso_emails || []).length ? art.aviso_emails : (c && c.emails) || [];
  return `<div class="bloco" id="bloco-acomp-cliente"><h3>Acompanhamento pelo cliente</h3>
    ${c ? `<p>Acompanhada por <b>${esc(c.nome)}</b>: aparece no portal do cliente, com o fim previsto e o PDF.</p>
        <p class="dica">${art.aviso_cliente
          ? `E-mail ${art.aviso_dias} dias antes do vencimento para ${esc(emails.join(", ") || "— (cadastre um e-mail no cliente)")}${art.fim ? ` (por volta de ${dataBR(diaDoAviso(art))})` : ""}.`
          : "Sem aviso por e-mail."}</p>`
      : '<p class="dica">Nenhum cliente acompanha esta ART.</p>'}
    <div class="linha-acoes"><button class="btn btn-claro" type="button" id="btn-acomp-cliente">Configurar acompanhamento</button></div>
  </div>`;
}

const diaDoAviso = (art) => new Date(Date.parse(art.fim) - (art.aviso_dias || 30) * 86400000).toISOString().slice(0, 10);

function dialogo() {
  let dlg = $("#dlg-acomp-cliente");
  if (!dlg) {
    dlg = document.createElement("dialog");
    dlg.className = "dialogo";
    dlg.id = "dlg-acomp-cliente";
    dlg.setAttribute("aria-labelledby", "titulo-acomp-cliente");
    document.body.append(dlg);
  }
  return dlg;
}

// Pergunta (pergunta=true) e configuração. lista: as ARTs (uma ou as importadas juntas). Devolve true se salvou.
export function configurarAcompanhamento({ armazem, lista, clientes, pergunta = false }) {
  return new Promise((resolver) => {
    const dlg = dialogo();
    const primeira = lista[0];
    const sugerido = (primeira.acompanhada && clientes.find((c) => c.id === primeira.cliente_id)) || clienteSugerido(primeira, clientes);
    const titulo = lista.length === 1 ? `ART nº ${esc(primeira.numero)}` : `${lista.length} ARTs`;
    const ativa = !pergunta || primeira.acompanhada;
    dlg.innerHTML = `<form id="form-acomp-cliente">
      <div class="dlg-cab"><h2 id="titulo-acomp-cliente">Acompanhamento pelo cliente – ${titulo}</h2><button class="btn-link" type="button" data-cancelar>Fechar</button></div>
      <div class="dlg-corpo acomp-cliente">
        <p><b>${lista.length === 1 ? "Esta ART será acompanhada" : "Estas ARTs serão acompanhadas"} ou monitorada${lista.length === 1 ? "" : "s"} por algum cliente?</b></p>
        <div class="opcoes" role="radiogroup">
          <label><input type="radio" name="sim" value="nao"${ativa ? "" : " checked"}> Não</label>
          <label><input type="radio" name="sim" value="sim"${ativa ? " checked" : ""}> Sim</label>
        </div>
        <div id="acomp-config"${ativa ? "" : " hidden"}>
          <div class="campos">
            <label class="c6">Cliente da base<select name="cliente_id">
              <option value="">Escolha…</option>${opcoes(clientes.map((c) => [c.id, c.nome]), sugerido && sugerido.id)}<option value="novo">+ Novo cliente</option></select></label>
            <div class="c6" id="acomp-novo" hidden>
              <div class="campos">
                <label class="c3">Nome do cliente<input name="novo_nome" value="${esc(primeira.contratante || "")}" maxlength="160"></label>
                <label class="c3">CPF / CNPJ<input name="novo_doc" value="${esc(primeira.contratante_doc || "")}" maxlength="30"></label>
              </div>
            </div>
            <label class="c6 opcao-campo"><input type="checkbox" name="aviso_cliente"${primeira.acompanhada ? (primeira.aviso_cliente ? " checked" : "") : " checked"}> Avisar o cliente por e-mail antes do vencimento</label>
            <label class="c2">Dias antes do fim previsto<input type="number" name="aviso_dias" min="1" max="365" value="${primeira.aviso_dias || 30}"></label>
            <label class="c4">E-mails que recebem o aviso (vazio: os do cliente)<input name="aviso_emails" value="${esc((primeira.aviso_emails || []).join(", "))}" placeholder="os e-mails cadastrados no cliente"></label>
          </div>
          <p class="dica">A ART aparece no portal do cliente (Arquivos e ARTs), com o fim previsto e o PDF. O aviso sai uma vez, ${"<b>"}no dia escolhido antes do fim previsto${"</b>"}, e também chega uma cópia para você. ARTs baixadas ou arquivadas saem do portal e não geram aviso.</p>
          <p class="dica" id="acomp-emails-cliente"></p>
        </div>
      </div>
      <div class="dlg-rodape">
        <button class="btn btn-claro" type="button" data-cancelar>${pergunta ? "Responder depois" : "Cancelar"}</button>
        <button class="btn btn-primary" type="submit">Salvar</button>
      </div>
    </form>`;
    const form = $("#form-acomp-cliente", dlg);
    const atualizar = () => {
      const sim = form.elements.sim.value === "sim";
      $("#acomp-config", form).hidden = !sim;
      const id = form.elements.cliente_id.value;
      $("#acomp-novo", form).hidden = id !== "novo";
      const c = clientes.find((x) => x.id === id);
      $("#acomp-emails-cliente", form).textContent = c
        ? (c.emails || []).length ? `E-mails de ${c.nome}: ${c.emails.join(", ")}.` : `${c.nome} ainda não tem e-mail cadastrado: informe acima ou cadastre em Clientes.`
        : id === "novo" ? "Informe os e-mails acima: eles também ficam no cadastro do cliente." : "";
      form.elements.aviso_dias.disabled = !form.elements.aviso_cliente.checked;
    };
    form.addEventListener("change", atualizar);
    atualizar();
    let salvou = false;
    const fechar = () => { dlg.close(); };
    dlg.onclose = () => resolver(salvou);
    form.querySelectorAll("[data-cancelar]").forEach((b) => b.addEventListener("click", fechar));
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const sim = form.elements.sim.value === "sim";
      let campos = { acompanhada: false, aviso_cliente: false };
      try {
        if (sim) {
          let id = form.elements.cliente_id.value;
          const emails = lerEmails(form.elements.aviso_emails.value);
          if (!id) return avisar("Escolha o cliente que acompanha.");
          if (id === "novo") {
            const nome = form.elements.novo_nome.value.trim();
            if (!nome) return avisar("Informe o nome do novo cliente.");
            const novo = await armazem.colecao("clientes").salvar({ nome, documento: form.elements.novo_doc.value.trim() || null, emails });
            clientes.push(novo);
            id = novo.id;
          }
          const c = clientes.find((x) => x.id === id);
          const dias = Math.min(365, Math.max(1, Number(form.elements.aviso_dias.value) || 30));
          const aviso = form.elements.aviso_cliente.checked;
          if (aviso && !emails.length && !(c && (c.emails || []).length)) return avisar("Para o aviso, informe um e-mail (ou cadastre no cliente).");
          campos = { cliente_id: id, acompanhada: true, aviso_cliente: aviso, aviso_dias: dias, aviso_emails: c && emails.join() === (c.emails || []).join() ? [] : emails };
        }
        for (const art of lista) await armazem.salvar({ ...art, ...campos });
        salvou = true;
        avisar(sim ? "Acompanhamento pelo cliente salvo." : "Sem acompanhamento pelo cliente.");
        fechar();
      } catch (err) {
        avisar("Não foi possível salvar: " + err.message);
      }
    });
    dlg.showModal();
  });
}
