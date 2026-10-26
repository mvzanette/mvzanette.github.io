#!/usr/bin/env bash
# Cópia de segurança do site (executada pelo GitHub Actions: .github/workflows/backup-aws.yml).
# Copia do Supabase as tabelas do site (estrutura, regras de acesso e dados, em SQL), os logins, uma planilha CSV por
# tabela e os arquivos guardados (PDFs e anexos), e compacta tudo num .7z com senha (AES-256, com os nomes dos
# arquivos também protegidos). O envio para o S3 da AWS fica no workflow.
#
# Uso: ferramentas/backup-aws.sh <pasta de trabalho> <arquivo .7z de saída>
# Precisa de SUPABASE_DB_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e BACKUP_SENHA. PG_BIN aponta para os
# programas do PostgreSQL (padrão: a versão mais nova instalada).
# Saída 3: a cópia foi feita, mas algum arquivo guardado não baixou (a lista vai em FALHAS.txt, dentro da cópia).
# O repositório é público e o log também: aqui só aparecem contagens e tamanhos, nunca o conteúdo.
set -euo pipefail

TRAB="$1"
SAIDA="$2"
PG_BIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
D="$TRAB/copia"
rm -rf "$D"
mkdir -p "$D/planilhas" "$D/arquivos"
psql() { "$PG_BIN/psql" "$SUPABASE_DB_URL" -X -q -v ON_ERROR_STOP=1 "$@"; }

# 1. Tabelas do site (schema public): estrutura, regras de acesso e dados
"$PG_BIN/pg_dump" "$SUPABASE_DB_URL" --schema=public --no-owner --no-privileges -f "$D/banco-site.sql"
# Num projeto novo o schema public já existe: a restauração não para nele. Sem as linhas \restrict do pg_dump (comando
# do psql), o arquivo também roda no SQL Editor do Supabase.
sed -i -e 's/^CREATE SCHEMA public;$/CREATE SCHEMA IF NOT EXISTS public;/' -e '/^\\\(un\)\?restrict /d' "$D/banco-site.sql"

# 2. Logins (usuários e identidades), para recriar as contas num projeto novo; sem eles, o resto continua valendo
if ! "$PG_BIN/pg_dump" "$SUPABASE_DB_URL" --data-only --table=auth.users --table=auth.identities --no-owner --no-privileges \
  -f "$D/logins.sql" 2> "$TRAB/erro-logins.txt"; then
  echo "::warning::Os logins não entraram na cópia ($(head -1 "$TRAB/erro-logins.txt")). O resto segue."
  rm -f "$D/logins.sql"
fi
if [ -f "$D/logins.sql" ]; then sed -i '/^\\\(un\)\?restrict /d' "$D/logins.sql"; fi
rm -f "$TRAB/erro-logins.txt"

# 3. Uma planilha por tabela do site (CSV com a marca de UTF-8, para o Excel abrir com os acentos)
planilhas=0
for t in $(psql -At -c "select tablename from pg_tables where schemaname = 'public' order by 1"); do
  { printf '\xEF\xBB\xBF'; psql -c "\\copy public.\"$t\" to stdout with (format csv, header)"; } > "$D/planilhas/$t.csv"
  planilhas=$((planilhas + 1))
done

# 4. Arquivos guardados: a lista sai do banco e os arquivos, da API do Storage
psql -At -F $'\t' -c "select bucket_id, name from storage.objects where name not like '%.emptyFolderPlaceholder' order by 1, 2" > "$TRAB/arquivos.tsv"
saida=0
node "$(dirname "$0")/backup-arquivos.mjs" "$TRAB/arquivos.tsv" "$D/arquivos" || saida=$?
if [ "$saida" -ne 0 ] && [ "$saida" -ne 3 ]; then exit "$saida"; fi

# 5. Como abrir e restaurar
cat > "$D/LEIAME.txt" <<'TEXTO'
Cópia de segurança da área restrita do site (feita todo dia pelo GitHub Actions, a partir do Supabase).

banco-site.sql   tabelas do site: estrutura, regras de acesso e dados (ARTs, finanças, caixa, empresas, perfis...)
logins.sql       usuários e identidades do login (para recriar as contas num projeto novo)
planilhas/       uma planilha CSV por tabela, para consultar no Excel ou no Google Planilhas
arquivos/        os PDFs e anexos guardados, por pasta (arts, caixa, financas), com os mesmos caminhos do site
FALHAS.txt       só aparece se algum arquivo não baixou

Para restaurar num projeto novo do Supabase: rode logins.sql e depois banco-site.sql (no SQL Editor ou com o psql),
rode o supabase/schema.sql do repositório (cria as pastas de arquivos e as regras delas) e envie a pasta arquivos/
para o Storage com os mesmos caminhos.
TEXTO

echo "Banco: $(du -h "$D/banco-site.sql" | cut -f1) em SQL e $planilhas planilhas; $(wc -l < "$TRAB/arquivos.tsv") arquivos guardados."

# 6. Compactar com senha (AES-256; -mhe=on protege também os nomes dos arquivos)
rm -f "$SAIDA"
(cd "$TRAB" && 7z a -t7z -mx=7 -mhe=on -p"$BACKUP_SENHA" "$SAIDA" copia > /dev/null)
rm -rf "$D" "$TRAB/arquivos.tsv"
echo "Cópia compactada: $(du -h "$SAIDA" | cut -f1)."
exit "$saida"
