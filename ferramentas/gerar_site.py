"""Gera as páginas HTML do site a partir de um só lugar.

Cabeçalho, formulário de contato e rodapé são compartilhados por todas as páginas.
Para alterar um texto, edite este arquivo e rode, na pasta do site:

    python3 ferramentas/gerar_site.py
"""
import hashlib
import json
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent

EMAIL = "mvszanette@gmail.com"
WHATS = "5532998111414"
FONE = "(32) 99811-1414"
CREA = "CREA/RNP 1420122860"

# ---------------------------------------------------------------- ícones (traço)
ICON = {
    "menu": '<path d="M4 6h16M4 12h16M4 18h16"/>',
    "down": '<path d="m6 9 6 6 6-6"/>',
    "mail": '<rect x="2" y="4" width="20" height="16" rx="1"/><path d="m22 7-10 6L2 7"/>',
    "phone": '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
    "badge": '<rect x="3" y="4" width="18" height="16" rx="1"/><circle cx="9" cy="10" r="2"/><path d="M15 8h2M15 12h2M7 16h10"/>',
    "forklift": '<path d="M12 12H5a2 2 0 0 0-2 2v5"/><circle cx="13" cy="19" r="2"/><circle cx="5" cy="19" r="2"/><path d="M8 19h3m5-17v17h6M6 12V7c0-1.1.9-2 2-2h3l5 5"/>',
    "gauge": '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
    "wrench": '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
    "calendar": '<rect x="3" y="4" width="18" height="18" rx="1"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="m9 16 2 2 4-4"/>',
    "presentation": '<path d="M2 3h20"/><path d="M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3"/><path d="m7 21 5-5 5 5"/>',
    "droplet": '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>',
    "fan": '<path d="M10.827 16.379a6.082 6.082 0 0 1-8.618-7.002l5.412 1.45a6.082 6.082 0 0 1 7.002-8.618l-1.45 5.412a6.082 6.082 0 0 1 8.618 7.002l-5.412-1.45a6.082 6.082 0 0 1-7.002 8.618l1.45-5.412Z"/><path d="M12 12v.01"/>',
    "snow": '<path d="M2 12h20M12 2v20M4.93 4.93l14.14 14.14M4.93 19.07 19.07 4.93"/>',
    "file": '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="m9 15 2 2 4-4"/>',
    "track": '<rect x="2" y="8" width="20" height="8" rx="4"/><circle cx="7" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="17" cy="12" r="1.5"/>',
    "tire": '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><path d="M12 2v6M12 16v6M2 12h6M16 12h6"/>',
    "filter": '<path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/>',
    "fuel": '<path d="M3 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18"/><path d="M2 22h14"/><path d="M15 9h2a2 2 0 0 1 2 2v6a2 2 0 0 0 4 0V8l-3-3"/><path d="M7 7h4"/>',
    "bolt": '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
    "factory": '<path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M17 18h1M12 18h1M7 18h1"/>',
    "list": '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    "chart": '<path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>',
    "plug": '<path d="M12 22v-5M9 8V2M15 8V2M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z"/>',
    "leaf": '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>',
    "search": '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    "truck": '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
    "car": '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>',
    "clipboard": '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
}


def icon(nome, cls="i"):
    return f'<svg class="{cls}" viewBox="0 0 24 24" aria-hidden="true">{ICON[nome]}</svg>'


CK = '<svg class="ck" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12"/><path d="m7 12.5 3.2 3.2L17 9"/></svg>'


def checks(itens, cls="checks"):
    """Lista com check. Cada item é texto simples ou (título, descrição)."""
    linhas = []
    for item in itens:
        if isinstance(item, tuple):
            corpo = f"<div><strong>{item[0]}</strong><span>{item[1]}</span></div>"
        else:
            corpo = f"<div>{item}</div>"
        linhas.append(f"          <li>{CK}{corpo}</li>")
    return f'<ul class="{cls}">\n' + "\n".join(linhas) + "\n        </ul>"


def faq(itens):
    return "\n".join(
        f"          <details>\n            <summary>{p}</summary>\n            <p>{r}</p>\n          </details>"
        for p, r in itens
    )


# ---------------------------------------------------------------- partes comuns
FAVICON = (
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E"
    "%3Crect width='32' height='32' fill='%23f5b800'/%3E%3Ctext x='16' y='21.5' text-anchor='middle' "
    "font-family='Arial, sans-serif' font-weight='800' font-size='14' fill='%23111214'%3EMZ%3C/text%3E%3C/svg%3E"
)


def versao(caminho):
    """Endereço do arquivo com a versão do conteúdo (?v=...). Quando a imagem, o CSS ou o JS mudam,
    o endereço muda junto e todo visitante baixa o arquivo novo, sem ficar com a cópia antiga do navegador."""
    arquivo = RAIZ / caminho
    if not arquivo.exists():
        return caminho
    return f"{caminho}?v={hashlib.sha1(arquivo.read_bytes()).hexdigest()[:8]}"


def head(titulo, descricao, com_formulario=False, extra="", indexar=True):
    tos = f'\n  <script src="{versao("tos-mecanica.js")}" defer></script>' if com_formulario else ""
    robots = "" if indexar else '\n  <meta name="robots" content="noindex">'
    return f"""<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{titulo}</title>
  <meta name="description" content="{descricao}">{robots}
  <meta property="og:title" content="{titulo}">
  <meta property="og:description" content="{descricao}">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="pt_BR">
  <link rel="icon" href="{FAVICON}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Roboto+Condensed:wght@500;600;700;800&family=Roboto:wght@400;500;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="{versao("styles.css")}">
  <script src="{versao("config.js")}"></script>{tos}
  <script src="{versao("main.js")}" defer></script>{extra}
</head>
<body>
"""


# Linhas de projeto: submenu "Projetos" do cabeçalho, rodapé e seções de projetos.html
PROJETOS_MENU = [
    ("laudos-projetos", "Laudos e projetos de Engenharia Mecânica"),
    ("gestao-frotas-ativos", "Consultoria em gestão de frotas e ativos"),
    ("eletrificacao", "Projeto de eletrificação de frota"),
    ("indicacao", "Indicação de serviços técnicos"),
]


def logo(home):
    return f"""<a class="logo" href="{home}" aria-label="Marcos Zanette – Engenharia Mecânica, página inicial">
      <span class="logo-name">Marcos Zanette</span>
      <span class="logo-sub">Engenharia Mecânica</span>
    </a>"""


def header(inicio, contato="#contato"):
    """inicio = "" na página inicial ou "index.html" nas demais."""
    home = inicio or "#top"  # "#top" leva ao início da página
    sub = "\n".join(f'            <a href="projetos.html#{a}">{t}</a>' for a, t in PROJETOS_MENU)
    return f"""
  <header class="site-header">
    <div class="header-top">
      <div class="container">
    {logo(home)}
        <button class="menu-toggle" type="button" aria-label="Abrir menu" aria-expanded="false" aria-controls="menu">{icon("menu")}</button>
      </div>
    </div>
    <nav class="nav" id="menu" aria-label="Principal">
      <div class="container">
        <a href="{home}">Página inicial</a>
        <div class="nav-drop">
          <a class="nav-drop-link" href="projetos.html">Projetos</a>
          <div class="nav-sub">
{sub}
            <a class="nav-sub-todos" href="projetos.html">Todos os projetos</a>
          </div>
        </div>
        <a href="{inicio}#equipamentos">Equipamentos atendidos</a>
        <a href="{inicio}#perfil">Sobre o profissional</a>
        <a class="btn btn-primary" href="{contato}">Contato</a>
      </div>
    </nav>
    <div class="header-stripe" aria-hidden="true"></div>
  </header>
"""


UFS = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split()

# Lista curta de serviços. Cada opção leva os códigos TOS (área 16 – Mecânica) que chegam no e-mail.
SERVICOS_FORM = [
    ("Laudo NR-12", [
        ("Laudo NR-12 – equipamento móvel / linha amarela", "16.7.29 16.5.6"),
        ("Laudo NR-12 – caminhão munck", "16.5.9"),
        ("Laudo NR-12 – empilhadeira", "16.5.8"),
        ("Laudo NR-12 – máquinas industriais", "16.7.29 16.7.32"),
    ]),
    ("Laudos mecânicos e eletromecânicos", [
        ("Laudo de equipamento de movimentação de terra", "16.7.4.5"),
        ("Laudo mecânico", "16.7.4"),
        ("Laudo eletromecânico", "16.7.5"),
        ("Laudo de caminhões", "16.5.5.4"),
        ("Laudo de implementos e reboques", "16.5.7 16.5.10"),
    ]),
    ("Laudo NR-13", [
        ("Laudo NR-13 – vaso de pressão / compressor", "16.3.2 16.3.3 16.3.15"),
        ("Laudo NR-13 – caldeira", "16.2.1.10"),
    ]),
    ("Manutenção e gestão de frotas", [
        ("Plano de manutenção de frota / equipamentos", "16.5.6 16.7.4"),
        ("Consultoria em gestão de frota", "16.5.6 16.5.5"),
        ("Treinamento para gestores de frota", "16.5.6 16.5.5"),
        ("Especificação de insumos", "16.5.6 16.5.5"),
    ]),
    ("Eletrificação de frotas", [
        ("Análise de viabilidade de eletrificação de frota", "16.5.5 16.5.6"),
    ]),
    ("Manutenção industrial", [
        ("Laudo de máquinas e equipamentos industriais", "16.7.32"),
        ("Consultoria em manutenção industrial", "16.7.13 16.7.32"),
        ("Assessoria técnica em manutenção industrial", "16.7.13 16.7.32"),
    ]),
    ("Climatização", [
        ("PMOC", "16.2.2"),
        ("Projeto de instalação de ar-condicionado", "16.2.1.4"),
    ]),
    ("Içamento", [
        ("Plano de rigging / içamento", "16.6.3 16.6.7"),
    ]),
    ("ART e outros", [
        ("ART de serviço de engenharia mecânica", ""),
    ]),
]


def opcoes_servico(selecionado=None):
    linhas = [f'<option value="" disabled{"" if selecionado else " selected"}>Selecione o serviço…</option>']
    for grupo, itens in SERVICOS_FORM:
        linhas.append(f'<optgroup label="{grupo}">')
        for nome, tos in itens:
            sel = " selected" if nome == selecionado else ""
            linhas.append(f'  <option data-tos="{tos}"{sel}>{nome}</option>')
        linhas.append("</optgroup>")
    linhas.append('<option data-outro value="Outro serviço (lista do CREA)">Outro serviço – escolher na lista do CREA</option>')
    return "\n".join("                " + l for l in linhas)


def contato(selecionado=None):
    ufs = "\n".join(f"                  <option>{uf}</option>" for uf in UFS)
    return f"""
    <!-- ============ CONTATO ============ -->
    <section class="contact bg-gray" id="contato">
      <div class="container contact-grid">
        <div class="contact-info">
          <h2 class="section-title">Contato</h2>
          <p>Para solicitar uma proposta técnica, preencha o formulário com os dados do serviço e do equipamento.</p>
          <ul class="contact-list">
            <li>{icon("mail")}<div><small>E-mail</small><a href="mailto:{EMAIL}" data-email>{EMAIL}</a></div></li>
            <li>{icon("phone")}<div><small>WhatsApp</small><a href="https://wa.me/{WHATS}" data-whatsapp target="_blank" rel="noopener">{FONE}</a></div></li>
            <li>{icon("badge")}<div><small>Responsável técnico</small>Marcos Zanette – Engenheiro Mecânico<br><span data-config="crea">{CREA}</span></div></li>
          </ul>
        </div>

        <!-- Envio pelo FormSubmit (gratuito). O e-mail de destino é definido em config.js. -->
        <form class="quote-form" id="form-proposta" action="https://formsubmit.co/{EMAIL}" method="POST">
          <input type="hidden" name="_subject" value="Solicitação de proposta pelo site">
          <input type="hidden" name="_template" value="table">
          <input type="hidden" name="_captcha" value="false">
          <input type="hidden" name="_next" value="">
          <input type="hidden" name="_autoresponse" value="Sua solicitação de proposta foi recebida e será respondida pelo e-mail ou telefone informado. Marcos Zanette – Engenheiro Mecânico – {CREA}">
          <input type="hidden" name="Código TOS" value="">
          <input type="text" name="_honey" class="honeypot" tabindex="-1" autocomplete="off" aria-hidden="true">

          <div class="form-grid">
            <div class="field">
              <label for="f-nome">Nome</label>
              <input id="f-nome" name="Nome" type="text" autocomplete="name" required>
            </div>
            <div class="field">
              <label for="f-email">E-mail</label>
              <input id="f-email" name="email" type="email" autocomplete="email" required>
            </div>
            <div class="field">
              <label for="f-whats">WhatsApp</label>
              <input id="f-whats" name="WhatsApp" type="tel" autocomplete="tel" inputmode="tel" required>
            </div>
            <div class="field">
              <label for="f-empresa">Empresa <span class="opt">(opcional)</span></label>
              <input id="f-empresa" name="Empresa" type="text" autocomplete="organization">
            </div>
            <div class="field w4">
              <label for="f-cidade">Cidade</label>
              <input id="f-cidade" name="Cidade" type="text" autocomplete="address-level2" required>
            </div>
            <div class="field w2">
              <label for="f-uf">Estado</label>
              <select id="f-uf" name="Estado" required>
                <option value="" disabled selected>UF</option>
{ufs}
              </select>
            </div>
            <div class="field">
              <label for="f-doc">CPF/CNPJ <span class="opt">(opcional)</span></label>
              <input id="f-doc" name="CPF/CNPJ" type="text" inputmode="numeric">
            </div>
            <div class="field">
              <label for="f-qtd">Nº de equipamentos <span class="opt">(opcional)</span></label>
              <input id="f-qtd" name="Quantidade" type="text" inputmode="numeric">
            </div>
            <div class="field full">
              <label for="f-servico">Serviço</label>
              <select id="f-servico" name="Serviço" required>
{opcoes_servico(selecionado)}
              </select>
            </div>
            <div class="tos-box" id="tos-box" hidden>
              <p>Selecione o item na Tabela de Obras e Serviços do CREA (área de Mecânica).</p>
              <div class="field full">
                <label for="tos-subarea">Subárea</label>
                <select id="tos-subarea"></select>
              </div>
              <div class="field full">
                <label for="tos-obra">Obra ou serviço</label>
                <select id="tos-obra"></select>
              </div>
              <div class="field full">
                <label for="tos-complemento">Complemento <span class="opt">(quando houver)</span></label>
                <select id="tos-complemento"></select>
              </div>
            </div>
            <div class="field full">
              <label for="f-equip">Equipamento <span class="opt">(fabricante, modelo e ano – opcional)</span></label>
              <input id="f-equip" name="Equipamento" type="text">
            </div>
            <div class="field full">
              <label for="f-msg">Mensagem <span class="opt">(opcional)</span></label>
              <textarea id="f-msg" name="Mensagem"></textarea>
            </div>
          </div>

          <p class="lgpd">Os dados informados são utilizados exclusivamente para a elaboração e o envio da proposta. Consulte a <a href="politica-de-privacidade.html">Política de Privacidade</a>.</p>
          <button class="btn btn-primary" type="submit">Enviar solicitação</button>
        </form>
      </div>
    </section>
"""


def footer(inicio):
    home = inicio or "#top"  # "#top" leva ao início da página
    return f"""
  <footer class="site-footer">
    <div class="container">
      <div class="footer-grid">
        <div class="footer-brand">
          {logo(home)}
          <p>Engenharia mecânica aplicada à manutenção, à segurança e à conformidade legal.</p>
        </div>
        <div>
          <h3>Projetos</h3>
          <ul>
{chr(10).join(f'            <li><a href="projetos.html#{a}">{t}</a></li>' for a, t in PROJETOS_MENU)}
          </ul>
        </div>
        <div>
          <h3>Equipamentos atendidos</h3>
          <ul>
{chr(10).join(f'            <li><a href="{inicio}#equipamentos">{titulo}</a></li>' for _, titulo, _ in EQUIPAMENTOS)}
          </ul>
        </div>
        <div>
          <h3>Contato</h3>
          <p class="footer-call">Vamos conversar?</p>
          <ul class="footer-contact">
            <li><a href="mailto:{EMAIL}?subject=Contato%20pelo%20site" data-email="link">{icon("mail")}Enviar e-mail</a></li>
            <li><a href="https://wa.me/{WHATS}" data-whatsapp="link" target="_blank" rel="noopener">{icon("phone")}WhatsApp</a></li>
          </ul>
        </div>
        <div>
          <h3>Responsável técnico</h3>
          <ul>
            <li>Marcos Zanette</li>
            <li>Engenheiro Mecânico</li>
            <li data-config="crea">{CREA}</li>
          </ul>
        </div>
      </div>
      <div class="footer-bottom">
        <span>© <span id="ano">2026</span> Marcos Zanette – Engenharia Mecânica</span>
        <span><a href="politica-de-privacidade.html">Política de Privacidade</a> · <a href="area-restrita.html" rel="nofollow">Área restrita</a></span>
      </div>
    </div>
  </footer>

</body>
</html>
"""


# ---------------------------------------------------------------- página inicial
def foto(*opcoes):
    """Primeira foto que existir na pasta do site (a última opção é usada se nenhuma existir)."""
    for caminho in opcoes:
        if (RAIZ / caminho).exists():
            return caminho
    return opcoes[-1]


# Grupos da seção "Equipamentos atendidos" (uma foto só, ao lado da lista)
EQUIPAMENTOS = [
    ("track", "Linha amarela", ["Escavadeira hidráulica", "Pá carregadeira", "Trator de esteiras", "Motoniveladora",
                                "Rolo compactador", "Retroescavadeira", "Minicarregadeira", "Miniescavadeira",
                                "Trator agrícola"]),
    ("truck", "Caminhões linha diesel", ["Caminhão munck", "Caminhão basculante", "Caminhão pipa", "Cavalo mecânico",
                                         "Caminhão cesto aéreo", "Caminhão hidrossemeadura", "Caminhão espargidor",
                                         "Caminhão lubrificante", "Caminhão poliguindaste"]),
    ("car", "Veículos leves e de apoio", ["Picapes e utilitários",
                                          "Veículos de apoio operacional (elétricos, gasolina e diesel)",
                                          "Ônibus e vans"]),
    ("forklift", "Máquinas de movimentação de carga", ["Empilhadeiras", "Plataformas elevatórias", "Talhas",
                                                       "Guinchos", "Paleteiras", "Manipuladores"]),
    ("plug", "Equipamentos de apoio", ["Geradores", "Motobombas", "Compressores de ar", "Torres de iluminação",
                                       "Roçadeiras", "Motosserras"]),
]

# Cards de "Projetos" na página inicial (o Laudo NR-12 aparece antes, em destaque):
# âncora em projetos.html, ícone, título, texto e foto em img/servicos/<foto>.jpg
AREAS_INICIO = [
    ("gestao-frotas-ativos", "presentation", "Consultoria para gestão de frotas",
     "Planos de manutenção, indicadores, especificação de insumos e treinamentos para frotas de linha amarela e caminhões.",
     "consultoria-frotas"),
    ("eletrificacao", "bolt", "Eletrificação de frotas",
     "Análise de viabilidade técnica e econômica para a transição de veículos e equipamentos para modelos elétricos ou híbridos.",
     "eletrificacao"),
    ("manutencao-industrial", "factory", "Manutenção industrial",
     "Laudos, consultoria e assessoria técnica para máquinas, equipamentos e instalações industriais.",
     "manutencao-industrial"),
]

OUTROS = [
    "Instalações de gás",
    "Sistemas de combate a incêndio",
    "Estruturas para eventos",
    "Equipamentos de elevação e içamento",
    "Veículos, reboques e food trucks",
]

# Seção "Experiência": área, tipo de trabalho, escopo e descrição (sem clientes nem dados dos laudos)
EXPERIENCIA = [
    ("Segurança de máquinas", "Laudo de conformidade NR-12", "Máquinas, veículos e equipamentos",
     "Apreciação de riscos com cálculo HRN, matriz de conformidade item a item e recomendações técnicas, com ART."),
    ("Segurança de máquinas", "Laudo de proteção de partes móveis NR-12", "Máquinas, veículos e equipamentos",
     "Avaliação das proteções fixas e móveis, dos intertravamentos e das distâncias de segurança, com as adequações necessárias."),
    ("Vasos de pressão", "Laudo NR-13", "Compressores de ar",
     "Inspeção de segurança do vaso de pressão, dos dispositivos de segurança e da documentação, com ART."),
    ("Estruturas e içamento", "Vistoria e memorial de cálculo", "Trenó de arraste",
     "Inspeção visual e dimensional e memorial de cálculo estrutural de longarinas, cambão e pontos de içamento, com ART."),
    ("Climatização", "PMOC", "Ambientes climatizados",
     "Levantamento de ocupantes, áreas e carga térmica, com rotinas e periodicidade de manutenção conforme a Lei 13.589/2018."),
    ("Perícia", "Parecer técnico", "Falhas e vistorias técnicas",
     "Análise de falhas em equipamentos e veículos, com testes, desmontagem e avaliação das evidências."),
]

AMBIENTES = ["Construção civil", "Mineração", "Logística", "Terraplanagem"]

NORMAS_NR12 = [
    "NR-12", "NR-11", "NR-22", "NR-29", "ABNT NBR ISO 12100", "ISO/TR 14121-2", "ABNT NBR 14153",
    "ABNT NBR ISO 13849-1", "ABNT NBR ISO 13850", "ABNT NBR ISO 14118", "ABNT NBR ISO 14119", "ABNT NBR ISO 20474",
]

FAQ_INICIO = [
    ("Quais equipamentos precisam de laudo NR-12?",
     "A NR-12 se aplica a máquinas e equipamentos utilizados no trabalho, incluindo equipamentos móveis como escavadeiras, carregadeiras, caminhões munck e empilhadeiras. O laudo documenta a apreciação de riscos e a conformidade com os requisitos da norma."),
    ("Qual a validade do laudo NR-12?",
     "A NR-12 não define um prazo fixo de validade. O laudo deve ser revisado sempre que houver modificação no equipamento, mudança de aplicação, acidente ou atualização normativa. Para equipamentos críticos, a revisão periódica é uma boa prática."),
    ("O laudo atende às exigências de mobilização de grandes contratantes?",
     "O laudo contempla apreciação de riscos, matriz de conformidade, registro fotográfico e ART, que são os itens normalmente exigidos para a liberação de equipamentos em operações de mineração, portos e óleo e gás."),
    ("O que é ART?",
     "A Anotação de Responsabilidade Técnica, instituída pela Lei 6.496/1977, é o registro no CREA que identifica o profissional responsável por um serviço de engenharia, como laudo, projeto, vistoria ou plano de manutenção."),
    ("Como é definido o valor do serviço?",
     "O valor é definido conforme o tipo de serviço, a quantidade e o tipo de equipamento e a necessidade de deslocamento, e é informado na proposta."),
]

FAQ_PROJETOS = [
    ("A consultoria atende frotas de qualquer porte?",
     "Sim. O escopo é definido de acordo com o tamanho da frota, os tipos de equipamento e os objetivos da operação."),
    ("O treinamento pode ser realizado na empresa?",
     "Sim. Os treinamentos são realizados na empresa ou online, com conteúdo adaptado à frota e à operação, e emissão de certificado de participação."),
    ("A análise de eletrificação inclui o projeto elétrico da recarga?",
     "A análise dimensiona a demanda de energia e a infraestrutura de recarga necessária e serve de base para o projeto elétrico, que é elaborado por profissional habilitado em engenharia elétrica."),
    ("Quais serviços de manutenção industrial são atendidos?",
     "Laudos técnicos de máquinas e equipamentos, consultoria para estruturação e gestão da manutenção e assessoria técnica em paradas programadas, especificações, contratação e acompanhamento de serviços."),
    ("A indicação de insumos e serviços tem vínculo com fornecedores?",
     "Não. A indicação é técnica e independente, baseada na aplicação, na severidade da operação, nas recomendações do fabricante e no custo por hora trabalhada."),
]

NR12_RESUMO = [
    "Inspeção em campo e teste de funcionamento",
    "Apreciação de riscos com cálculo HRN",
    "Matriz de conformidade item a item",
    "Laudo com registro fotográfico e ART",
]

NR12_ETAPAS = [
    ("Inspeção em campo", "Checklist do equipamento e teste de funcionamento, com simulação de paradas e emergências."),
    ("Apreciação de riscos", "Identificação dos perigos e cálculo HRN, com categoria de segurança e PLr quando aplicável."),
    ("Matriz de conformidade NR-12", "Verificação item a item dos requisitos aplicáveis ao equipamento."),
    ("Recomendações técnicas", "Medidas de adequação em ordem de prioridade, incluindo as recomendações do fabricante."),
    ("Laudo com ART", "Relatório com registro fotográfico, conclusão técnica e ART registrada no CREA."),
]

NR12_TEXTO = ("Avaliação técnica de conformidade com a NR-12 para equipamentos de linha amarela, caminhões e implementos, "
              "com apreciação de riscos, matriz de conformidade e ART registrada no CREA.")


def foto_perfil():
    """Foto do card "Sobre o profissional" (img/perfil.jpg); sem a foto, mostra o espaço reservado."""
    if (RAIZ / "img" / "perfil.jpg").exists():
        return f'<div class="profile-midia"><img src="{versao("img/perfil.jpg")}" alt="Marcos Zanette, engenheiro mecânico" loading="lazy"></div>'
    return '<div class="profile-midia photo" role="img" aria-label="Foto do profissional"></div>'


def destaque_nr12(itens, extra="", contato="#contato"):
    """Bloco escuro de destaque do Laudo NR-12 (página inicial e página de projetos)."""
    return f"""<article class="nr12-bloco" id="laudo-nr12">
          <div class="nr12-bloco-img photo" style="--photo:url('{versao("img/servicos/laudo-nr12.jpg")}') 55% 62% / cover no-repeat" role="img" aria-label="Pás carregadeiras de linha amarela"></div>
          <div class="nr12-bloco-corpo">
            <span class="selo">Destaque</span>
            <h3>Laudo NR-12 para equipamentos móveis</h3>
            <p>{NR12_TEXTO} Atende às exigências de fiscalização e aos requisitos de mobilização de grandes contratantes.</p>
            {checks(itens)}{extra}
            <div class="feature-actions">
              <a class="btn btn-primary" href="{contato}">Solicitar proposta</a>
              <a class="link-arrow" href="laudo-nr12.html">Conheça o laudo NR-12</a>
            </div>
          </div>
        </article>"""


def pagina_inicial():
    jsonld = json.dumps({
        "@context": "https://schema.org",
        "@type": "ProfessionalService",
        "name": "Marcos Zanette – Engenharia Mecânica",
        "description": "Laudo NR-12 para equipamentos móveis, gestão e eletrificação de frotas, manutenção industrial, laudos NR-13, PMOC e ART.",
        "telephone": "+55-32-99811-1414",
        "email": EMAIL,
        "address": {"@type": "PostalAddress", "addressLocality": "Juiz de Fora", "addressRegion": "MG", "addressCountry": "BR"},
        "areaServed": "BR",
    }, ensure_ascii=False, indent=2)
    extra = '\n  <script type="application/ld+json">\n' + jsonld + "\n  </script>"

    areas = "\n".join(
        f"""          <article class="svc">
            <div class="svc-img" style="--photo:url('{versao(f"img/servicos/{foto_}.jpg")}') center / cover no-repeat">
              <span class="svc-icon">{icon(ic)}</span>
            </div>
            <div class="svc-body">
              <h3>{titulo}</h3>
              <p>{texto}</p>
              <a class="link-arrow" href="projetos.html#{ancora}">Saiba mais</a>
            </div>
          </article>"""
        for ancora, ic, titulo, texto, foto_ in AREAS_INICIO
    )
    grupos = "\n".join(
        f"""            <div class="equip-grupo">
              <h3>{icon(ic)}{titulo}</h3>
              <ul>
{chr(10).join(f"                <li>{i}</li>" for i in itens)}
              </ul>
            </div>"""
        for ic, titulo, itens in EQUIPAMENTOS
    )
    casos = "\n".join(
        f"""          <article class="case">
            <span class="case-tag">{area}</span>
            <h3>{titulo}</h3>
            <p class="case-escopo">{escopo}</p>
            <p>{texto}</p>
          </article>"""
        for area, titulo, escopo, texto in EXPERIENCIA
    )
    ambientes = "\n".join(f"          <li>{a}</li>" for a in AMBIENTES)
    foto_equip = versao(foto("img/equipamentos.jpg", "img/servicos/insumos.jpg"))

    return head(
        "Soluções em Engenharia Mecânica | Laudo NR-12 e Gestão de Frotas",
        "Laudo NR-12 para equipamentos móveis, gestão e eletrificação de frotas, manutenção industrial, laudos NR-13, PMOC e ART. Engenheiro mecânico especialista em linha amarela e caminhões linha diesel.",
        com_formulario=True, extra=extra,
    ) + header("") + f"""
  <main>
    <!-- ============ TOPO ============ -->
    <section class="band hero" id="inicio" style="--band-img:url('{versao("img/hero.jpg")}')">
      <div class="container">
        <h1>Soluções em Engenharia Mecânica</h1>
        <p class="band-lead">Soluções especializadas em engenharia mecânica para ativos, equipamentos móveis e instalações industriais, com foco em segurança, confiabilidade e desempenho operacional.</p>
        <p class="band-lead">Atuamos na elaboração de laudos técnicos, planos de manutenção, inspeções, consultoria em engenharia e treinamentos técnicos, atendendo equipamentos de linha amarela, caminhões, veículos leves e de apoio.</p>
        <div class="hero-actions">
          <a class="btn btn-primary" href="#contato">Solicitar proposta</a>
        </div>
      </div>
    </section>

    <!-- ============ NÚMEROS ============ -->
    <section class="stats" id="numeros" aria-label="Números">
      <div class="container">
        <div class="stats-grid">
          <div class="stat"><strong>10</strong><span>Anos de atuação</span></div>
          <div class="stat"><strong>+700</strong><span>Equipamentos sob gestão</span></div>
          <div class="stat"><strong>+200</strong><span>Laudos emitidos</span></div>
          <div class="stat"><strong>4</strong><span>Setores atendidos</span></div>
        </div>
        <div class="scope">
          <p><b>Equipamentos</b>Linha amarela · Caminhões linha diesel · Veículos leves e de apoio · Movimentação de carga · Equipamentos de apoio</p>
          <p><b>Setores</b>Mineração · Portos · Óleo e gás · Construção</p>
        </div>
      </div>
    </section>

    <!-- ============ PROJETOS (resumo; o detalhamento fica em projetos.html) ============ -->
    <section id="projetos">
      <div class="container">
        <h2 class="section-title">Projetos</h2>
        <p class="section-intro">Laudos, projetos, consultoria e treinamentos em engenharia mecânica, com foco na segurança e na conformidade legal de equipamentos, frotas e instalações.</p>
        {destaque_nr12(NR12_RESUMO)}
        <div class="svc-grid">
{areas}
        </div>
        <div class="proj-mais">
          <p><b>Também:</b> <a href="laudo-nr13.html">Laudo NR-13</a> · <a href="projetos.html#refrigeracao">Projetos e laudos de sistemas de refrigeração</a> · <a href="projetos.html#treinamentos">Treinamentos técnicos</a> · <a href="projetos.html#indicacao">Indicação de serviços técnicos</a></p>
          <a class="btn btn-dark" href="projetos.html">Ver todos os projetos</a>
        </div>
      </div>
    </section>

    <!-- ============ EQUIPAMENTOS ============ -->
    <section class="bg-gray" id="equipamentos">
      <div class="container">
        <div class="equip-layout">
          <div class="equip-foto photo" style="--photo:url('{foto_equip}') center / cover no-repeat" role="img" aria-label="Equipamentos de linha amarela"></div>
          <div>
            <h2 class="section-title">Equipamentos atendidos</h2>
            <p class="section-intro">Laudos, inspeções, planos de manutenção e consultoria para equipamentos móveis, caminhões, veículos, máquinas de movimentação de carga e equipamentos de apoio.</p>
            <div class="equip-grupos">
{grupos}
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ============ SOBRE O PROFISSIONAL ============ -->
    <section id="perfil">
      <div class="container">
        <div class="profile">
          <div class="profile-text">
            <h2 class="section-title">Sobre o profissional</h2>
            <p class="profile-name">Marcos Zanette</p>
            <p class="profile-role">Engenheiro Mecânico · <span data-config="crea">{CREA}</span></p>
            {checks([
                "Gerente de manutenção",
                "Especialista em equipamentos de linha amarela e caminhões linha diesel",
                "Especialista em confiabilidade e eficiência operacional",
                "Conformidade com a legislação",
            ])}
            <div class="years"><strong>10</strong><span>Anos de atuação<br>na área</span></div>
          </div>
          {foto_perfil()}
        </div>
      </div>
    </section>

    <!-- ============ EXPERIÊNCIA ============ -->
    <!-- Apenas descrições do tipo de trabalho: os laudos são confidenciais e não devem ser publicados. -->
    <section class="bg-gray" id="experiencia">
      <div class="container">
        <h2 class="section-title">Experiência</h2>
        <p class="section-intro">Principais laudos, vistorias e pareceres técnicos já realizados.</p>
        <div class="cases">
{casos}
        </div>
        <h3 class="subhead">Ambientes de atuação</h3>
        <ul class="chips chips-ambientes">
{ambientes}
        </ul>
      </div>
    </section>

    <!-- ============ PERGUNTAS FREQUENTES ============ -->
    <section class="center" id="duvidas">
      <div class="container">
        <h2 class="section-title">Perguntas frequentes</h2>
        <div class="faq">
{faq(FAQ_INICIO)}
        </div>
      </div>
    </section>
{contato()}
  </main>
""" + footer("")


# ---------------------------------------------------------------- página de projetos
LAUDOS = [
    ("laudo-nr13", "gauge", "Laudo NR-13",
     ["Vasos de pressão e compressores", "Autoclaves e caldeiras", "Inspeção de segurança com ART"],
     ("laudo-nr13.html", "Saiba mais")),
    ("laudos-mecanicos", "wrench", "Laudos mecânicos e eletromecânicos",
     ["Avaliação técnica de equipamentos e componentes", "Laudos de condição e de análise de falhas", "Sistemas mecânicos e eletromecânicos, com ART"],
     None),
    ("refrigeracao", "snow", "Projetos e laudos de sistemas de refrigeração",
     ["PMOC conforme a Lei 13.589/2018", "Projeto de instalação de ar-condicionado com cálculo de carga térmica", "Laudos técnicos de sistemas de climatização"],
     ("pmoc.html", "PMOC")),
    ("pareceres", "file", "Vistorias, pareceres e memoriais de cálculo",
     ["Vistorias técnicas e pareceres", "Perícia em equipamentos e veículos", "Memoriais de cálculo estrutural e de içamento"],
     None),
]


def painel(ancora, ic, titulo, itens, link=None, nota=""):
    link_html = f'\n            <a class="link-arrow" href="{link[0]}">{link[1]}</a>' if link else ""
    ancora_html = f' id="{ancora}"' if ancora else ""
    return f"""          <div class="panel"{ancora_html}>
            <div class="service-icon">{icon(ic)}</div>
            <h3>{titulo}</h3>
            {checks(itens)}{nota}{link_html}
          </div>"""


def pagina_projetos():
    normas = "\n".join(f"          <li>{n}</li>" for n in NORMAS_NR12)
    quando = """
            <h4 class="nr12-bloco-sub">Quando o laudo é exigido</h4>
            <ul class="nr12-bloco-tags">
              <li>Mobilização em contratantes</li>
              <li>Fiscalização do trabalho</li>
              <li>Locação de equipamentos</li>
              <li>Compra e venda</li>
              <li>Auditorias e certificações</li>
              <li>Modificações e acidentes</li>
            </ul>"""
    laudos = "\n".join(painel(a, ic, t, itens, link) for a, ic, t, itens, link in LAUDOS)
    destaques = [
        ("track", "Material rodante", "Avaliação de desgaste e especificação de esteiras, roletes, rodas-guia e sapatas conforme a aplicação."),
        ("tire", "Pneus", "Especificação por aplicação e severidade da operação, com acompanhamento de desgaste, pressão e custo por hora ou quilômetro."),
        ("filter", "Insumos de manutenção preventiva e corretiva", "Filtros, lubrificantes, graxas, fluidos e componentes de reposição adequados a cada plano de manutenção."),
        ("fuel", "Eficiência energética de combustíveis", "Análise de consumo por hora trabalhada ou por quilômetro, comparação entre combustíveis e aditivos e identificação de perdas."),
    ]
    destaques_html = "\n".join(
        f"""            <div class="highlight">{icon(ic)}<h4>{t}</h4><p>{d}</p></div>"""
        for ic, t, d in destaques
    )
    subnav = "\n".join(f'        <a href="#{a}">{t}</a>' for a, t in PROJETOS_MENU)
    faixa = versao(foto("img/projetos.jpg", "img/servicos/consultoria-frotas.jpg"))

    return head(
        "Projetos de Engenharia Mecânica | Laudo NR-12, Gestão de Frotas e Eletrificação",
        "Laudos e projetos de engenharia mecânica, laudo NR-12 para equipamentos móveis, consultoria em gestão de frotas e ativos, eletrificação de frotas, manutenção industrial e indicação de serviços técnicos.",
        com_formulario=True,
    ) + header("index.html") + f"""
  <main>
    <section class="band page-hero" style="--band-img:url('{faixa}')">
      <div class="container">
        <nav class="crumbs" aria-label="Você está em"><a href="index.html">Página inicial</a> / Projetos</nav>
        <h1>Projetos</h1>
        <p>Laudos, projetos, consultoria e treinamentos em engenharia mecânica para equipamentos móveis, frotas e instalações industriais.</p>
        <div class="hero-actions">
          <a class="btn btn-primary" href="#contato">Solicitar proposta</a>
        </div>
      </div>
    </section>

    <nav class="subnav" aria-label="Projetos">
      <div class="container">
{subnav}
      </div>
    </nav>

    <!-- ============ LAUDOS E PROJETOS ============ -->
    <section id="laudos-projetos">
      <div class="container">
        <h2 class="section-title">Laudos e projetos de Engenharia Mecânica</h2>
        <p class="section-intro">Laudos técnicos, projetos e pareceres com ART registrada no CREA, para equipamentos móveis, máquinas e instalações.</p>
        {destaque_nr12(NR12_ETAPAS, extra=quando)}
        <h3 class="subhead">Normas aplicadas ao laudo NR-12</h3>
        <ul class="chips">
{normas}
        </ul>
        <div class="grid-2">
{laudos}
        </div>
        <p class="svc-mais"><b>Outros serviços de engenharia mecânica:</b> {" · ".join(OUTROS)}.</p>
      </div>
    </section>

    <!-- ============ GESTÃO DE FROTAS E ATIVOS ============ -->
    <section class="bg-gray" id="gestao-frotas-ativos">
      <div class="container">
        <h2 class="section-title">Consultoria em gestão de frotas e ativos</h2>
        <p class="section-intro">Apoio técnico a gestores de frotas e de manutenção industrial, com foco na disponibilidade dos equipamentos, na redução do custo de manutenção e na conformidade com a legislação.</p>
        <div class="banner-foto photo" style="--photo:url('{versao("img/servicos/consultoria-frotas.jpg")}') center / cover no-repeat" role="img" aria-label="Ilustração de escavadeira, pá carregadeira e caminhão basculante com painéis de plano de manutenção, disponibilidade e custo por hora"></div>
        <div class="fleet-grid">
{painel("", "presentation", "Consultoria para gestão de frotas", [
    "Diagnóstico da gestão de manutenção: processos, indicadores e histórico de falhas",
    "Planos de manutenção preventiva por equipamento, com base no horímetro ou na quilometragem e nas recomendações do fabricante",
    "Indicadores: disponibilidade física, MTBF, MTTR, backlog e custo por hora trabalhada",
    "Análise de falhas recorrentes e ações de confiabilidade",
    "Rotinas de inspeção pré-uso e controle da documentação técnica (laudos NR-12, ARTs, manuais)",
    "Preparação da frota para mobilização em grandes contratantes",
])}
{painel("treinamentos", "badge", "Treinamentos técnicos", [
    "Gestão de manutenção de frotas: planejamento, controle e indicadores",
    "NR-12 aplicada a equipamentos móveis: requisitos, inspeção e documentação",
    "Inspeção pré-uso para operadores e mecânicos",
    "Lubrificação e controle de contaminação",
    "Confiabilidade e análise de falhas",
], nota='''
            <p class="note">Na empresa ou online, com conteúdo adaptado à frota e à operação. Certificado de participação.</p>''')}
        </div>

        <h3 class="subhead" id="manutencao-industrial">Manutenção industrial</h3>
        <p class="section-intro">Laudos, consultoria e assessoria técnica para aumentar a disponibilidade e a segurança de máquinas, equipamentos e instalações industriais.</p>
        <div class="banner-foto photo" style="--photo:url('{versao("img/servicos/manutencao-industrial.jpg")}') center / cover no-repeat" role="img" aria-label="Ilustração de manutenção industrial: conjunto motor-bomba, ponte rolante, painel de comando e vaso de pressão"></div>
        <div class="ind-grid">
{painel("", "clipboard", "Laudos", [
    "Laudos técnicos de máquinas e equipamentos industriais",
    "Laudo NR-12 de máquinas fixas e linhas de produção",
    "Laudo NR-13 de vasos de pressão, compressores e caldeiras",
    "Laudos de condição e de análise de falhas",
])}
{painel("", "chart", "Consultoria", [
    "Plano de manutenção preventiva, preditiva e corretiva",
    "Indicadores: disponibilidade, MTBF, MTTR e backlog",
    "Criticidade e gestão de ativos",
    "Análise de causa raiz de falhas recorrentes",
    "Gestão de sobressalentes e estoque de peças",
])}
{painel("", "search", "Assessoria técnica", [
    "Planejamento e acompanhamento de paradas programadas",
    "Especificação técnica para compra de equipamentos e serviços",
    "Avaliação técnica de propostas e fornecedores",
    "Acompanhamento e fiscalização de serviços de terceiros",
    "Suporte técnico em auditorias e fiscalizações",
])}
        </div>
      </div>
    </section>

    <!-- ============ ELETRIFICAÇÃO ============ -->
    <section id="eletrificacao">
      <div class="container">
        <h2 class="section-title">Projeto de eletrificação de frota</h2>
        <p class="section-intro">Análise de viabilidade técnica e econômica para a transição de veículos e equipamentos a combustão para modelos elétricos ou híbridos. Metas de descarbonização, exigências de grandes contratantes e a variação do preço do diesel tornam a eletrificação uma decisão estratégica: a análise indica onde ela é viável e em quanto tempo o investimento retorna.</p>
        <div class="banner-foto photo" style="--photo:url('{versao("img/servicos/eletrificacao.jpg")}') center / cover no-repeat" role="img" aria-label="Ilustração de caminhão elétrico conectado a uma estação de recarga"></div>
        {checks([
                ("Diagnóstico da frota", "Perfil de uso, ciclos de trabalho, quilometragem ou horas trabalhadas, consumo de combustível e custo de manutenção por equipamento."),
                ("Seleção dos candidatos", "Identificação dos veículos e equipamentos com maior potencial de eletrificação, conforme a operação e a disponibilidade de modelos no mercado."),
                ("Autonomia e ciclo de operação", "Compatibilidade entre a autonomia das baterias, os turnos de trabalho e as rotas."),
                ("Infraestrutura de recarga", "Levantamento da demanda de energia e do tipo, da quantidade e da localização dos carregadores, como base para o projeto elétrico."),
                ("Custo total de propriedade (TCO)", "Comparativo entre aquisição, energia e combustível, manutenção, vida útil das baterias e valor residual, com cálculo do retorno do investimento."),
                ("Emissões e ESG", "Estimativa da redução de emissões de CO₂ e indicadores para relatórios de sustentabilidade."),
            ], cls="checks checks-2")}
        <p class="note note-largo"><b>Entregável:</b> relatório de viabilidade técnico-econômica, com recomendação por grupo de equipamentos e plano de transição em etapas.</p>
        <div class="feature-actions">
          <a class="btn btn-primary" href="#contato">Solicitar proposta</a>
        </div>
      </div>
    </section>

    <!-- ============ INDICAÇÃO DE SERVIÇOS TÉCNICOS ============ -->
    <section class="bg-gray" id="indicacao">
      <div class="container">
        <h2 class="section-title">Indicação de serviços técnicos</h2>
        <p class="section-intro">Indicação técnica dos insumos e serviços mais adequados a cada equipamento e condição de operação. <strong>Recomendação independente, sem vínculo com fabricantes ou fornecedores.</strong></p>
        <div class="highlight-grid highlight-4">
{destaques_html}
        </div>
        <div class="kv">
          <p><b>Serviços especializados:</b> indicação de serviços de manutenção, reforma de componentes e análises laboratoriais adequados a cada caso.</p>
          <p><b>Também avaliados:</b> peças de desgaste e ferramentas de penetração no solo (dentes, lâminas e bordas cortantes).</p>
          <p><b>Critérios:</b> aplicação e severidade da operação, recomendações do fabricante, histórico de falhas, análise de óleo e custo por hora trabalhada.</p>
          <p><b>Entregável:</b> relatório de especificação com as recomendações por equipamento.</p>
        </div>
      </div>
    </section>

    <!-- ============ PERGUNTAS FREQUENTES ============ -->
    <section class="center" id="duvidas">
      <div class="container">
        <h2 class="section-title">Perguntas frequentes</h2>
        <div class="faq">
{faq(FAQ_PROJETOS)}
        </div>
      </div>
    </section>
{contato()}
  </main>
""" + footer("index.html")


# ---------------------------------------------------------------- páginas de serviço
PAGINAS = [
    {
        "arquivo": "laudo-nr12.html",
        "titulo": "Laudo NR-12 para Equipamentos Móveis | Marcos Zanette Engenharia Mecânica",
        "descricao": "Laudo NR-12 com apreciação de riscos, matriz de conformidade e ART para escavadeiras, carregadeiras, caminhões munck, empilhadeiras e máquinas industriais.",
        "migalha": "Laudo NR-12",
        "foto": "laudo-nr12",
        "h1": "Laudo NR-12",
        "lead": "Apreciação de riscos, matriz de conformidade e ART para equipamentos móveis de linha amarela, caminhões munck, empilhadeiras e máquinas industriais.",
        "quando_titulo": "Quando é exigido",
        "quando": [
            "Mobilização de equipamentos em contratantes de mineração, portos e óleo e gás",
            "Fiscalização do trabalho",
            "Locação, compra e venda de equipamentos",
            "Auditorias de clientes e certificações",
            "Instalação de proteções e dispositivos de segurança",
            "Modificações, acidentes ou mudança de aplicação",
        ],
        "inclui": [
            "Inspeção técnica em campo",
            "Identificação do equipamento e análise documental",
            "Apreciação de riscos com cálculo HRN",
            "Categoria de segurança e PLr, quando aplicável",
            "Matriz de conformidade com os requisitos da NR-12",
            "Recomendações técnicas e do fabricante",
            "Registro fotográfico",
            "ART registrada no CREA",
        ],
        "metodo": [
            ("Inspeção em campo", "Checklist do equipamento e teste de funcionamento, simulando paradas e emergências."),
            ("Análise documental", "Manuais, histórico de manutenção e procedimentos operacionais."),
            ("Apreciação de riscos", "Identificação dos perigos e cálculo HRN, com categoria de segurança e PLr quando aplicável."),
            ("Matriz de conformidade", "Verificação item a item dos requisitos da NR-12."),
            ("Recomendações", "Medidas técnicas em ordem de prioridade, incluindo as recomendações do fabricante."),
            ("Laudo e ART", "Relatório com registro fotográfico, conclusão técnica e ART registrada no CREA."),
        ],
        "faq": [
            ("Qual a validade do laudo NR-12?",
             "A NR-12 não define um prazo fixo de validade. O laudo deve ser revisado sempre que houver modificação no equipamento, mudança de aplicação, acidente ou atualização normativa. Para equipamentos críticos, a revisão periódica é uma boa prática."),
            ("Quem pode emitir o laudo NR-12?",
             "Um profissional legalmente habilitado, com registro ativo no CREA, como o engenheiro mecânico, que registra a ART do serviço. Sem a ART, o laudo não tem validade perante a fiscalização."),
            ("O laudo atende às exigências de mobilização de grandes contratantes?",
             "O laudo contempla apreciação de riscos, matriz de conformidade, registro fotográfico e ART, que são os itens normalmente exigidos para a liberação de equipamentos em operações de mineração, portos e óleo e gás."),
            ("O laudo inclui a adequação dos equipamentos?",
             "O laudo identifica o que precisa ser adequado e indica as soluções técnicas. A fabricação e a instalação de proteções físicas não fazem parte do laudo."),
            ("Como é definido o valor do serviço?",
             "O valor é definido conforme a quantidade e o tipo de equipamento e a necessidade de deslocamento, e é informado na proposta."),
        ],
        "opcao": "Laudo NR-12 – equipamento móvel / linha amarela",
    },
    {
        "arquivo": "laudo-nr13.html",
        "titulo": "Laudo NR-13 de Vasos de Pressão, Compressores e Caldeiras | Marcos Zanette Engenharia Mecânica",
        "descricao": "Inspeção de segurança e laudo NR-13 de vasos de pressão, compressores de ar, autoclaves e caldeiras, com ART de engenheiro mecânico.",
        "migalha": "Laudo NR-13",
        "foto": "laudo-nr13",
        "h1": "Laudo NR-13",
        "lead": "Inspeção de segurança e laudo de vasos de pressão, compressores de ar, autoclaves e caldeiras, com ART.",
        "quando_titulo": "Quando é necessário",
        "quando": [
            "Antes de colocar o equipamento em operação (inspeção inicial)",
            "Nas inspeções periódicas, nos prazos definidos pela NR-13",
            "Após reparos, alterações, mudança de local ou longo período parado",
            "Fiscalização do trabalho e auditorias",
            "Exigência de seguradoras ou de contratantes",
        ],
        "inclui": [
            "Inspeção de segurança do equipamento no local",
            "Verificação de válvula de segurança, manômetro e dispositivos de controle",
            "Conferência da placa de identificação",
            "Orientação sobre a documentação obrigatória (prontuário e registro de segurança)",
            "Relatório de inspeção com parecer conclusivo",
            "ART registrada no CREA",
        ],
        "faq": [
            ("Todo compressor precisa de NR-13?",
             "O enquadramento depende da pressão máxima de operação e do volume do reservatório, conforme os critérios da NR-13. Esses dados constam na placa de identificação do equipamento e podem ser informados no formulário de contato."),
            ("Com que frequência a inspeção deve ser feita?",
             "Os prazos das inspeções periódicas dependem da categoria do equipamento e da existência de Serviço Próprio de Inspeção na empresa, conforme a NR-13. O prazo da próxima inspeção é indicado no relatório."),
            ("E se o equipamento não tiver documentação?",
             "É uma situação comum em equipamentos antigos ou usados. Na inspeção, o caso é avaliado e são indicadas as providências para regularizar a documentação exigida pela norma."),
            ("Como é definido o valor do serviço?",
             "O valor é definido conforme a quantidade e o tipo de equipamento, os ensaios necessários e a necessidade de deslocamento, e é informado na proposta."),
        ],
        "opcao": "Laudo NR-13 – vaso de pressão / compressor",
    },
    {
        "arquivo": "pmoc.html",
        "titulo": "PMOC e Projeto de Ar-Condicionado com ART | Marcos Zanette Engenharia Mecânica",
        "descricao": "PMOC – Plano de Manutenção, Operação e Controle de sistemas de climatização com responsável técnico e ART, conforme a Lei 13.589/2018, e projeto de instalação de ar-condicionado.",
        "migalha": "PMOC",
        "foto": "pmoc",
        "h1": "PMOC",
        "lead": "Plano de Manutenção, Operação e Controle de sistemas de climatização, com responsável técnico e ART, conforme a Lei 13.589/2018.",
        "quando_titulo": "Quem precisa",
        "quando": [
            "Escritórios e empresas",
            "Lojas, shoppings e restaurantes",
            "Clínicas, consultórios e hospitais",
            "Escolas, academias e templos",
            "Hotéis e órgãos públicos",
            "Condomínios com áreas comuns climatizadas",
        ],
        "inclui": [
            "Levantamento dos aparelhos e dos ambientes climatizados",
            "PMOC com as rotinas e a periodicidade de manutenção",
            "Responsabilidade técnica com ART registrada no CREA",
            "Orientação para os registros de manutenção",
            "Orientação sobre as análises de qualidade do ar (Resolução ANVISA RE nº 9/2003)",
        ],
        "nota": "Também disponível: projeto de instalação de sistemas de ar-condicionado, com cálculo de carga térmica e ART.",
        "faq": [
            ("O PMOC é obrigatório?",
             "Sim, para edifícios de uso público e coletivo com ar-condicionado, conforme a Lei 13.589/2018. A ausência do PMOC sujeita o estabelecimento às penalidades da legislação sanitária."),
            ("É necessário um engenheiro para elaborar o PMOC?",
             "Sim. O PMOC deve ter um responsável técnico habilitado, com ART. A manutenção do dia a dia pode continuar com a equipe ou empresa de refrigeração já contratada, seguindo o plano."),
            ("A empresa já tem manutenção contratada. O PMOC ainda é necessário?",
             "Sim. A empresa de manutenção executa os serviços; o PMOC é o plano que define o que deve ser feito e com que frequência, sob a responsabilidade de um engenheiro."),
            ("Como é definido o valor do serviço?",
             "O valor é definido conforme a quantidade de aparelhos, o tamanho do local e a necessidade de deslocamento, e é informado na proposta."),
        ],
        "opcao": "PMOC",
    },
]


def pagina_servico(p):
    quando = checks(p["quando"])
    inclui = checks(p["inclui"])
    nota = f'\n        <p class="note">{p["nota"]}</p>' if p.get("nota") else ""
    metodo = ""
    foto = RAIZ / "img" / "servicos" / f"{p['foto']}.jpg"
    faixa = f" style=\"--band-img:url('{versao(f'img/servicos/{foto.name}')}')\"" if foto.exists() else ""
    fundo_split = "bg-gray"
    if p.get("metodo"):
        etapas = "\n".join(
            f"          <li>\n            <h3>{t}</h3>\n            <p>{d}</p>\n          </li>" for t, d in p["metodo"]
        )
        normas = "\n".join(f"          <li>{n}</li>" for n in NORMAS_NR12)
        metodo = f"""
    <section class="bg-gray" id="metodologia">
      <div class="container">
        <h2 class="section-title">Metodologia</h2>
        <ol class="steps">
{etapas}
        </ol>
        <h3 class="subhead">Normas aplicadas</h3>
        <ul class="chips">
{normas}
        </ul>
      </div>
    </section>
"""
        fundo_split = ""
    return head(p["titulo"], p["descricao"], com_formulario=True) + header("index.html") + f"""
  <main>
    <section class="band page-hero"{faixa}>
      <div class="container">
        <nav class="crumbs" aria-label="Você está em"><a href="index.html">Página inicial</a> / {p["migalha"]}</nav>
        <h1>{p["h1"]}</h1>
        <p>{p["lead"]}</p>
        <div class="hero-actions">
          <a class="btn btn-primary" href="#contato">Solicitar proposta</a>
        </div>
      </div>
    </section>

    <section class="{fundo_split}">
      <div class="container">
        <div class="split">
          <div class="panel">
            <h3>{p["quando_titulo"]}</h3>
            {quando}
          </div>
          <div class="panel">
            <h3>O que está incluído</h3>
            {inclui}
          </div>
        </div>{nota}
      </div>
    </section>
{metodo}
    <section class="center" id="duvidas">
      <div class="container">
        <h2 class="section-title">Perguntas frequentes</h2>
        <div class="faq">
{faq(p["faq"])}
        </div>
      </div>
    </section>
{contato(p["opcao"])}
  </main>
""" + footer("index.html")


def pagina_obrigado():
    return head("Solicitação recebida | Marcos Zanette Engenharia Mecânica",
                "Solicitação de proposta recebida.", indexar=False) + header("index.html", "index.html#contato") + """
  <main class="thanks">
    <div>
      <h1>Solicitação recebida</h1>
      <p>Sua solicitação de proposta foi registrada e será respondida pelo e-mail ou telefone informado.</p>
      <a class="btn btn-dark" href="index.html">Voltar ao site</a>
    </div>
  </main>
""" + footer("index.html")


def pagina_privacidade():
    return head("Política de Privacidade | Marcos Zanette Engenharia Mecânica",
                "Política de privacidade do site Marcos Zanette – Engenharia Mecânica.") + header("index.html", "index.html#contato") + f"""
  <main>
    <section class="band page-hero">
      <div class="container">
        <nav class="crumbs" aria-label="Você está em"><a href="index.html">Página inicial</a> / Política de Privacidade</nav>
        <h1>Política de Privacidade</h1>
        <p>Como os dados enviados pelo formulário de contato são tratados, em conformidade com a Lei Geral de Proteção de Dados (Lei 13.709/2018).</p>
      </div>
    </section>

    <section>
      <div class="container prose">
        <h2>Responsável pelos dados</h2>
        <p>Marcos Zanette, engenheiro mecânico, {CREA}. Contato: <a href="mailto:{EMAIL}" data-email>{EMAIL}</a>.</p>

        <h2>Dados coletados</h2>
        <p>Pelo formulário de contato são coletados: nome, e-mail, telefone/WhatsApp, cidade e estado, e, opcionalmente, empresa, CPF/CNPJ, dados do equipamento e a mensagem enviada.</p>

        <h2>Finalidade</h2>
        <p>Os dados são utilizados exclusivamente para responder à solicitação, elaborar e enviar a proposta técnica e manter o contato relacionado ao serviço solicitado. Não são utilizados para envio de publicidade nem compartilhados para fins comerciais.</p>

        <h2>Base legal</h2>
        <p>O tratamento se baseia na execução de procedimentos preliminares relacionados a contrato, a pedido do titular dos dados (art. 7º, V, da LGPD).</p>

        <h2>Compartilhamento</h2>
        <p>O envio do formulário é processado pelo serviço FormSubmit (formsubmit.co), que encaminha a mensagem por e-mail. O site também carrega fontes do Google Fonts. Fora esses serviços técnicos necessários ao funcionamento do site, os dados não são compartilhados com terceiros.</p>

        <h2>Armazenamento</h2>
        <p>Os dados são mantidos pelo tempo necessário para o atendimento da solicitação e para o cumprimento de obrigações legais, e então eliminados.</p>

        <h2>Cookies</h2>
        <p>Este site não utiliza cookies de rastreamento ou de publicidade.</p>

        <h2>Direitos do titular</h2>
        <p>O titular pode solicitar, a qualquer momento, a confirmação do tratamento, o acesso, a correção ou a eliminação dos seus dados, pelo e-mail <a href="mailto:{EMAIL}" data-email>{EMAIL}</a>.</p>

        <p><em>Última atualização: outubro de 2026.</em></p>
      </div>
    </section>
  </main>
""" + footer("index.html")


def main():
    paginas = {"index.html": pagina_inicial(), "projetos.html": pagina_projetos(), "obrigado.html": pagina_obrigado(),
               "politica-de-privacidade.html": pagina_privacidade()}
    for p in PAGINAS:
        paginas[p["arquivo"]] = pagina_servico(p)
    for nome, html in paginas.items():
        (RAIZ / nome).write_text(html, encoding="utf-8")
        print("gerado:", nome)


if __name__ == "__main__":
    main()
