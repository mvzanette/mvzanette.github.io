#!/usr/bin/env python3
"""Põe a versão (?v=…) nos endereços dos arquivos da área restrita.

Cada página da área ganha um import map que aponta todos os módulos (.js) para o endereço com a versão do
conteúdo, e os estilos e scripts da página também levam a versão. Assim, depois de publicar, o navegador
busca os arquivos novos de uma vez, sem misturar com cópias antigas guardadas em cache.

Rode depois de alterar qualquer arquivo da área e antes de publicar:
    python3 ferramentas/versionar_area.py
"""
import hashlib
import json
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
AREA = RAIZ / "area"
PAGINAS = [RAIZ / "area-restrita.html", *sorted(AREA.glob("*.html"))]
MODULOS = sorted([*AREA.glob("*.js"), *(AREA / "vendor").glob("*.mjs")])


def versao(arquivo: Path) -> str:
    return hashlib.sha1(arquivo.read_bytes()).hexdigest()[:8]


def relativo(arquivo: Path, pagina: Path) -> str:
    caminho = arquivo.relative_to(RAIZ).as_posix()
    return "./" + caminho if pagina.parent == RAIZ else "./" + Path(caminho).relative_to("area").as_posix()


def com_versao(endereco: str, pagina: Path):
    """Endereço local de estilo ou script com ?v= atualizado (None para endereços externos)."""
    if re.match(r"^(https?:)?//|^data:", endereco):
        return None
    limpo = endereco.split("?", 1)[0]
    arquivo = (pagina.parent / limpo).resolve()
    if not arquivo.is_file():
        raise SystemExit(f"{pagina.name}: arquivo não encontrado: {endereco}")
    return f"{limpo}?v={versao(arquivo)}"


def versionar(pagina: Path) -> bool:
    html = original = pagina.read_text(encoding="utf-8")

    def trocar(m):
        novo = com_versao(m.group(2), pagina)
        return m.group(0) if novo is None else f"{m.group(1)}{novo}{m.group(3)}"

    html = re.sub(r'(<link rel="stylesheet" href=")([^"]+)(")', trocar, html)
    html = re.sub(r'(<script(?: type="module")? src=")([^"]+)(")', trocar, html)

    mapa = {relativo(m, pagina): f"{relativo(m, pagina)}?v={versao(m)}" for m in MODULOS}
    bloco = '<script type="importmap" data-versoes>' + json.dumps({"imports": mapa}, ensure_ascii=False) + "</script>\n"
    html = re.sub(r'[ \t]*<script type="importmap" data-versoes>.*?</script>\n', "", html, flags=re.S)
    posicao = html.find('<script type="module"')
    if posicao < 0:
        raise SystemExit(f"{pagina.name}: página sem script de módulo")
    inicio_linha = html.rfind("\n", 0, posicao) + 1
    recuo = html[inicio_linha:posicao]
    html = html[:inicio_linha] + recuo + bloco + html[inicio_linha:]

    if html != original:
        pagina.write_text(html, encoding="utf-8")
        return True
    return False


if __name__ == "__main__":
    alteradas = [p.relative_to(RAIZ).as_posix() for p in PAGINAS if versionar(p)]
    print(f"{len(PAGINAS)} páginas verificadas; atualizadas: {', '.join(alteradas) or 'nenhuma'}")
