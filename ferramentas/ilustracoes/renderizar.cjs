// Gera o JPG publicado no site a partir de uma ilustração SVG desta pasta.
// Uso (precisa do Node com Playwright e do ImageMagick):
//   node ferramentas/ilustracoes/renderizar.cjs ferramentas/ilustracoes/eletrificacao.svg img/servicos/eletrificacao.jpg
const { execFileSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");

(async () => {
  const [svg, destino] = process.argv.slice(2);
  if (!svg || !destino) throw new Error("Uso: node renderizar.cjs <entrada.svg> <saida.jpg>");
  const texto = fs.readFileSync(svg, "utf8");
  const [, , largura, altura] = texto.match(/viewBox="([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+)"/).slice(1).map(Number);
  const navegador = await chromium.launch();
  const pagina = await navegador.newPage({ viewport: { width: largura, height: altura } });
  await pagina.goto("file://" + path.resolve(svg));
  const png = destino.replace(/\.jpg$/, ".tmp.png");
  await pagina.screenshot({ path: png, clip: { x: 0, y: 0, width: largura, height: altura } });
  await navegador.close();
  execFileSync("convert", [png, "-strip", "-interlace", "Plane", "-sampling-factor", "4:2:0", "-quality", "86", destino]);
  fs.unlinkSync(png);
  console.log("gerado:", destino);
})();
