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
  // O pedido fica guardado na plataforma (Supabase, só gravação para o site) e o banco manda o e-mail
  // "ALERTA DE CONTATO NA PLATAFORMA". Se não der para enviar, o aviso oferece o WhatsApp com o pedido já escrito.
  const aviso = document.getElementById("form-aviso");
  const botao = form.querySelector("button[type=submit]");
  const campo = (nome) => (form.elements[nome] ? form.elements[nome].value.trim() : "");
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
    try {
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
      if (!resposta.ok) throw new Error("HTTP " + resposta.status);
      location.href = "obrigado.html";
    } catch (err) {
      console.error("Formulário de contato:", err);
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
    }
  });
});
