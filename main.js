// Aplica os dados de config.js, controla o menu no celular e o formulário. Não é preciso editar este arquivo.
document.addEventListener("DOMContentLoaded", () => {
  const zap =
    "https://wa.me/" + CONFIG.whatsapp + "?text=" + encodeURIComponent(CONFIG.whatsappTexto);

  // data-whatsapp="link" e data-email="link": troca só o endereço do link, sem mostrar o número ou o e-mail
  document.querySelectorAll("[data-whatsapp]").forEach((a) => {
    a.href = zap;
    if (a.dataset.whatsapp !== "link") a.textContent = CONFIG.telefoneExibicao;
  });
  document.querySelectorAll("[data-config]").forEach((el) => {
    el.textContent = CONFIG[el.dataset.config];
  });
  document.querySelectorAll("[data-email]").forEach((a) => {
    if (a.dataset.email === "link") {
      a.href = "mailto:" + CONFIG.email + "?subject=" + encodeURIComponent("Contato pelo site");
    } else {
      a.href = "mailto:" + CONFIG.email;
      a.textContent = CONFIG.email;
    }
  });

  const ano = document.getElementById("ano");
  if (ano) ano.textContent = new Date().getFullYear();

  // Menu no celular
  const toggle = document.querySelector(".menu-toggle");
  const menu = document.getElementById("menu");
  if (toggle && menu) {
    const setOpen = (open) => {
      menu.classList.toggle("open", open);
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Fechar menu" : "Abrir menu");
    };
    toggle.addEventListener("click", () => setOpen(!menu.classList.contains("open")));
    menu.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => setOpen(false)));
  }

  // Formulário de orçamento: fechado até clicar no título. Os links para #contato (botão Contato do topo e
  // Solicitar proposta) abrem ele, inclusive vindo de outra página (index.html#contato).
  const orcamento = document.getElementById("orcamento");
  if (orcamento) {
    const abrir = () => {
      orcamento.open = true;
    };
    if (location.hash === "#contato") abrir();
    window.addEventListener("hashchange", () => {
      if (location.hash === "#contato") abrir();
    });
    document.querySelectorAll('a[href$="#contato"]').forEach((a) =>
      a.addEventListener("click", () => {
        if (a.pathname === location.pathname) abrir();
      })
    );
  }

  const form = document.getElementById("form-proposta");
  if (!form || typeof TOS_MECANICA === "undefined") return;

  // ---- Serviço e código TOS do CREA ----
  // Cada opção da lista curta traz os códigos em data-tos; a opção "Outro" abre a lista
  // completa da área de Mecânica em cascata. O e-mail recebe o código e a descrição.
  const desc = new Map(TOS_MECANICA.map(([codigo, , descricao]) => [codigo, descricao]));
  const rotulo = (codigo) => codigo + " – " + desc.get(codigo);
  const legivel = (d) => {
    const t = d.replace(/^(de|da|do|das|dos)\s+/i, "");
    return t.charAt(0).toUpperCase() + t.slice(1);
  };
  const filhos = (codigo) => {
    const nivel = codigo.split(".").length + 1;
    return TOS_MECANICA.filter(([c]) => c.startsWith(codigo + ".") && c.split(".").length === nivel);
  };

  const servico = form.elements["Serviço"];
  const tos = form.elements["Código TOS"];
  const caixa = document.getElementById("tos-box");
  const subarea = document.getElementById("tos-subarea");
  const obra = document.getElementById("tos-obra");
  const complemento = document.getElementById("tos-complemento");

  const preencher = (select, itens, vazio) => {
    select.replaceChildren(new Option(vazio, ""));
    itens.forEach(([c, , d]) => select.append(new Option(c + " – " + legivel(d), c)));
    select.disabled = itens.length === 0;
  };

  const atualizar = () => {
    const opcao = servico.selectedOptions[0];
    const outro = !!opcao && opcao.hasAttribute("data-outro");
    caixa.hidden = !outro;
    subarea.required = outro;
    obra.required = outro;
    if (outro) {
      tos.value = [subarea.value, obra.value, complemento.value].filter(Boolean).map(rotulo).join(" › ");
    } else {
      const codigos = ((opcao && opcao.dataset.tos) || "").split(/\s+/).filter(Boolean);
      tos.value = codigos.length ? codigos.map(rotulo).join("; ") : "A definir";
    }
  };

  preencher(subarea, filhos("16"), "Selecione a subárea…");
  preencher(obra, [], "Selecione a subárea primeiro");
  preencher(complemento, [], "Sem complemento");

  servico.addEventListener("change", atualizar);
  subarea.addEventListener("change", () => {
    preencher(obra, subarea.value ? filhos(subarea.value) : [], subarea.value ? "Selecione a obra ou serviço…" : "Selecione a subárea primeiro");
    preencher(complemento, [], "Sem complemento");
    atualizar();
  });
  obra.addEventListener("change", () => {
    const itens = obra.value ? filhos(obra.value) : [];
    preencher(complemento, itens, itens.length ? "Selecione o complemento (opcional)…" : "Sem complemento");
    atualizar();
  });
  complemento.addEventListener("change", atualizar);
  atualizar();

  // ---- Envio ----
  // Dois caminhos ao mesmo tempo: o pedido fica guardado na plataforma (Supabase, só gravação para o site) e o
  // e-mail "ALERTA DE CONTATO NA PLATAFORMA" sai pelo Web3Forms (com a chave em config.js). Basta um dar certo.
  // Se nenhum der, o aviso oferece o WhatsApp com o pedido já escrito.
  const aviso = document.getElementById("form-aviso");
  const botao = form.querySelector("button[type=submit]");
  const campo = (nome) => (form.elements[nome] ? form.elements[nome].value.trim() : "");

  const resumoDe = (p) =>
    p.nome + (p.empresa ? " (" + p.empresa + ")" : "") + ", de " + p.cidade + "/" + p.uf + ", pediu orçamento de " + p.servico +
    (p.quantidade ? " para " + p.quantidade + " equipamento(s)" : "") + (p.equipamento ? ". Equipamento: " + p.equipamento : "") + ".";
  // O que pedir ao cliente para montar a proposta, conforme o serviço (o mesmo do e-mail enviado pelo banco)
  const pedirDe = (servico) =>
    /NR-12/i.test(servico) ? "fabricante, modelo, ano e número de série, fotos da placa de identificação e do equipamento e o local de uso"
    : /NR-13/i.test(servico) ? "pressão máxima de operação, volume do reservatório e fotos da placa de identificação e do equipamento"
    : /PMOC|ar-condicionado/i.test(servico) ? "quantidade, tipo e capacidade dos aparelhos de ar-condicionado e a área atendida"
    : /frota/i.test(servico) ? "tamanho e composição da frota, tipo de operação e os dados de manutenção disponíveis"
    : "fabricante, modelo e ano do equipamento, fotos e o local do serviço";
  const passosDe = (p) => [
    "1. Responder em até 1 dia útil: responda este e-mail (a resposta vai direto para " + p.email + ") ou chame no WhatsApp " + p.whatsapp +
      ": https://wa.me/" + (p.whatsapp.replace(/\D/g, "").length <= 11 ? "55" : "") + p.whatsapp.replace(/\D/g, ""),
    "2. Confirmar os dados do serviço: pedir " + pedirDe(p.servico) + ".",
    "3. Enviar a proposta técnica com escopo, prazo, valor e a ART do serviço.",
    "4. Serviço fechado: emitir a ART e cadastrar no Controle de ART da área restrita.",
  ].join("\n");

  async function gravarNaPlataforma(pedido) {
    const { SUPABASE_URL: url, SUPABASE_ANON_KEY: chave } = await import("./area/config-area.js");
    if (!url || !chave) throw new Error("banco não configurado");
    const resposta = await fetch(url + "/rest/v1/contatos", {
      method: "POST",
      headers: {
        apikey: chave,
        // A chave nova (sb_publishable_…) vai só no apikey; a antiga (anon, JWT) também no Authorization
        ...(chave.startsWith("sb_") ? {} : { Authorization: "Bearer " + chave }),
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(pedido),
    });
    if (!resposta.ok) throw new Error("plataforma: HTTP " + resposta.status);
  }

  async function enviarEmail(pedido) {
    const quando = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
    const resposta = await fetch("https://api.web3forms.com/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        access_key: CONFIG.web3formsChave,
        subject: "ALERTA DE CONTATO NA PLATAFORMA – " + pedido.nome.slice(0, 60),
        from_name: "Site Marcos Zanette",
        email: pedido.email,
        replyto: pedido.email,
        "Recebido em": quando,
        Resumo: resumoDe(pedido),
        Nome: pedido.nome,
        WhatsApp: pedido.whatsapp,
        Empresa: pedido.empresa || "—",
        Cidade: pedido.cidade + "/" + pedido.uf,
        "CPF/CNPJ": pedido.documento || "—",
        "Nº de equipamentos": pedido.quantidade || "—",
        Serviço: pedido.servico,
        "Código TOS (CREA)": pedido.codigo_tos || "—",
        Equipamento: pedido.equipamento || "—",
        Mensagem: pedido.mensagem || "—",
        Página: pedido.pagina,
        "Próximos passos": passosDe(pedido),
      }),
    });
    const r = await resposta.json().catch(() => ({}));
    if (!resposta.ok || !r.success) throw new Error("e-mail: " + (r.message || "HTTP " + resposta.status));
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (campo("_honey")) return; // robô preenchendo o campo escondido
    atualizar();
    const pedido = {
      nome: campo("Nome"),
      email: campo("email"),
      whatsapp: campo("WhatsApp"),
      empresa: campo("Empresa") || null,
      cidade: campo("Cidade"),
      uf: campo("Estado"),
      documento: campo("CPF/CNPJ") || null,
      quantidade: campo("Quantidade") || null,
      servico: campo("Serviço"),
      codigo_tos: campo("Código TOS") || null,
      equipamento: campo("Equipamento") || null,
      mensagem: campo("Mensagem") || null,
      pagina: location.pathname.split("/").pop() || "index.html",
    };
    aviso.hidden = true;
    botao.disabled = true;
    botao.textContent = "Enviando…";
    const envios = [gravarNaPlataforma(pedido)];
    if (CONFIG.web3formsChave) envios.push(enviarEmail(pedido));
    const resultados = await Promise.allSettled(envios);
    resultados.filter((r) => r.status === "rejected").forEach((r) => console.error("Formulário de contato:", r.reason));
    if (resultados.some((r) => r.status === "fulfilled")) {
      location.href = "obrigado.html";
      return;
    }
    const texto =
      "Olá! Gostaria de solicitar uma proposta técnica.\n" +
      [
        ["Nome", pedido.nome],
        ["Empresa", pedido.empresa],
        ["Cidade", pedido.cidade + "/" + pedido.uf],
        ["Serviço", pedido.servico],
        ["Equipamento", pedido.equipamento],
        ["Nº de equipamentos", pedido.quantidade],
        ["Mensagem", pedido.mensagem],
      ]
        .filter(([, v]) => v && v !== "/")
        .map(([k, v]) => k + ": " + v)
        .join("\n");
    aviso.innerHTML =
      'Não foi possível enviar pelo site agora. <a href="https://wa.me/' + CONFIG.whatsapp + "?text=" +
      encodeURIComponent(texto) + '" target="_blank" rel="noopener">Envie pelo WhatsApp</a> (o pedido já vai escrito) ' +
      'ou pelo e-mail <a href="mailto:' + CONFIG.email + '">' + CONFIG.email + "</a>.";
    aviso.hidden = false;
    botao.disabled = false;
    botao.textContent = "Enviar solicitação";
  });
});
