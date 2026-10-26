// Cópia de segurança: baixa os arquivos guardados no Supabase Storage (PDFs das ARTs, anexos do caixa e PDFs das
// finanças) para a pasta da cópia. Chamado por ferramentas/backup-aws.sh.
//
// Uso: node ferramentas/backup-arquivos.mjs <lista.tsv> <pasta>
// A lista tem uma linha "bucket<TAB>caminho" por arquivo (tirada de storage.objects).
// O repositório é público e o log do GitHub Actions também: aqui só aparecem contagens, nunca o nome dos arquivos.
// Os que não baixarem ficam listados em FALHAS.txt, dentro da cópia (que vai com senha).

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: CHAVE } = process.env;
const [lista, pasta] = process.argv.slice(2);
if (!lista || !pasta) {
  console.error("Uso: node ferramentas/backup-arquivos.mjs <lista.tsv> <pasta>");
  process.exit(2);
}
if (!SUPABASE_URL || !CHAVE) {
  console.error("Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(2);
}

// A chave nova (sb_secret_…) vai só no apikey; a antiga (service_role, JWT) também no Authorization
const cabecalho = { apikey: CHAVE, ...(CHAVE.startsWith("sb_") ? {} : { Authorization: `Bearer ${CHAVE}` }) };
const paraUrl = (caminho) => caminho.split("/").map(encodeURIComponent).join("/");

const arquivos = (await readFile(lista, "utf8"))
  .split("\n")
  .filter((l) => l.includes("\t"))
  .map((l) => ({ bucket: l.slice(0, l.indexOf("\t")), nome: l.slice(l.indexOf("\t") + 1) }));

let baixados = 0;
let bytes = 0;
const falhas = []; // { bucket, nome, motivo }

async function baixar({ bucket, nome }) {
  // Dentro da pasta da cópia, sem ".." (nada sai dela)
  const partes = nome.split("/").filter((p) => p && p !== "." && p !== "..");
  const destino = join(pasta, bucket, ...partes);
  let motivo = "";
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    try {
      const r = await fetch(`${SUPABASE_URL}/storage/v1/object/authenticated/${encodeURIComponent(bucket)}/${paraUrl(nome)}`, { headers: cabecalho });
      if (!r.ok) {
        // Arquivo que não existe ou chave sem permissão não melhora tentando de novo
        if (r.status !== 429 && r.status < 500) {
          falhas.push({ bucket, nome, motivo: `HTTP ${r.status}` });
          return;
        }
        throw new Error(`HTTP ${r.status}`);
      }
      const dados = Buffer.from(await r.arrayBuffer());
      await mkdir(dirname(destino), { recursive: true });
      await writeFile(destino, dados);
      baixados++;
      bytes += dados.length;
      return;
    } catch (e) {
      motivo = e.message;
      if (tentativa < 3) await new Promise((ok) => setTimeout(ok, 1500 * tentativa));
    }
  }
  falhas.push({ bucket, nome, motivo });
}

// Quatro downloads ao mesmo tempo
const fila = [...arquivos];
await Promise.all(Array.from({ length: 4 }, async () => {
  while (fila.length) await baixar(fila.shift());
}));

const mb = (bytes / 1048576).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
console.log(`Arquivos: ${baixados} de ${arquivos.length} baixados (${mb} MB).`);
if (falhas.length) {
  await writeFile(join(pasta, "FALHAS.txt"), falhas.map((f) => `${f.bucket}/${f.nome}\t${f.motivo}`).join("\n") + "\n");
  // Só o bucket e o motivo no log
  const resumo = {};
  for (const f of falhas) resumo[`${f.bucket} (${f.motivo})`] = (resumo[`${f.bucket} (${f.motivo})`] || 0) + 1;
  console.error(`Não baixaram ${falhas.length}: ${Object.entries(resumo).map(([k, n]) => `${n} em ${k}`).join(", ")}. A lista está em FALHAS.txt, dentro da cópia.`);
  process.exit(3);
}
