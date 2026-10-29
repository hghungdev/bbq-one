#!/usr/bin/env bash
# Trinh sát bề mặt tấn công — dùng cho MỌI dự án. CHỈ ĐỌC: grep / cat / audit; không sửa file, không gọi mạng ngoài
# registry của trình quản lý gói. KHÔNG in giá trị bí mật — chỉ in vị trí file.
# Chạy từ bất kỳ đâu trong repo:  bash <đường dẫn skill>/scripts/recon.sh
# Biến: RECON_LIMIT (mặc định 15 dòng / mục), RECON_NO_AUDIT=1 (bỏ audit khi offline).
set -u
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
L="${RECON_LIMIT:-15}"

EXCL=(--exclude-dir=node_modules --exclude-dir=dist --exclude-dir=build --exclude-dir=out --exclude-dir=.git
  --exclude-dir=vendor --exclude-dir=.venv --exclude-dir=venv --exclude-dir=__pycache__ --exclude-dir=.next
  --exclude-dir=.nuxt --exclude-dir=.output --exclude-dir=.svelte-kit --exclude-dir=coverage --exclude-dir=target
  --exclude-dir=.claude --exclude-dir=.idea --exclude-dir=.vscode)
INCL=(--include=*.ts --include=*.tsx --include=*.js --include=*.jsx --include=*.mjs --include=*.cjs --include=*.vue
  --include=*.svelte --include=*.astro --include=*.html --include=*.py --include=*.go --include=*.rb --include=*.php
  --include=*.java --include=*.kt --include=*.cs --include=*.rs --include=*.swift --include=*.dart)

S() { printf '\n==== %s ====\n' "$1"; }
# G <regex...>: tìm trong mã nguồn (bỏ test / spec / thư mục build), giới hạn L dòng.
G() { grep -rnIE "${EXCL[@]}" "${INCL[@]}" "$@" . 2>/dev/null | grep -vE '(\.|/)(test|spec)s?(\.|/)|__tests__|/fixtures?/' | cut -c1-220 | head -n "$L"; }
# F <regex>: chỉ in TÊN FILE có khớp (dùng cho bí mật — không in giá trị).
C() { grep -rnIE "${EXCL[@]}" "${INCL[@]}" "$@" . 2>/dev/null | grep -vE '(\.|/)(test|spec)s?(\.|/)|__tests__|/fixtures?/' | wc -l; }
F() { grep -rlIE "${EXCL[@]}" "$1" . 2>/dev/null | head -n "$L"; }
has() { [ -e "$1" ]; }
dep() { has package.json && grep -qE "\"$1\"" package.json; }

# ── 0. Nhận stack ──────────────────────────────────────────────────────────────────────────────────────────────────────
S "0. Stack (→ đọc module tương ứng trong references/stacks/)"
git log --oneline -3 2>/dev/null
STACK=()
EXT_MANIFEST=$(grep -rlE '"manifest_version"' --include=manifest.json "${EXCL[@]}" . 2>/dev/null | head -1)
[ -n "$EXT_MANIFEST" ] && STACK+=("browser-extension($EXT_MANIFEST)")
for d in vue react next nuxt svelte @sveltejs/kit @angular/core astro solid-js electron; do dep "$d" && STACK+=("frontend:$d"); done
for d in express fastify @nestjs/core koa hono @hapi/hapi; do dep "$d" && STACK+=("backend-node:$d"); done
for d in @supabase/supabase-js firebase firebase-admin prisma mongoose sequelize typeorm drizzle-orm pg mysql2; do dep "$d" && STACK+=("data:$d"); done
for d in openai @anthropic-ai/sdk langchain @langchain/core ai @google/generative-ai; do dep "$d" && STACK+=("llm:$d"); done
for f in requirements.txt pyproject.toml Pipfile; do has "$f" && STACK+=("python($(grep -ohiE 'django|flask|fastapi|openai|anthropic|langchain' "$f" 2>/dev/null | sort -u | tr '\n' ' '))"); done
has go.mod && STACK+=("go"); has Cargo.toml && STACK+=("rust"); has Gemfile && STACK+=("ruby")
has composer.json && STACK+=("php"); { has pom.xml || has build.gradle || has build.gradle.kts; } && STACK+=("jvm")
has supabase && STACK+=("supabase-dir"); { has firebase.json || has firestore.rules; } && STACK+=("firebase-rules")
ls Dockerfile* docker-compose*.y*ml 2>/dev/null | head -1 | grep -q . && STACK+=("docker")
ls ./*.tf infra/*.tf terraform/*.tf 2>/dev/null | head -1 | grep -q . && STACK+=("terraform")
printf '%s\n' "${STACK[@]:-(không nhận ra — đọc README / cấu trúc thư mục)}"

# ── 1. Bí mật (chỉ vị trí) ─────────────────────────────────────────────────────────────────────────────────────────────
S "1. Bí mật — chỉ in file (mở xem tay; khóa công khai theo thiết kế như Supabase anon / Firebase web key thì bỏ qua)"
for pat in 'AKIA[0-9A-Z]{16}' '-----BEGIN [A-Z ]*PRIVATE KEY-----' 'xox[baprs]-[0-9A-Za-z-]{10,}' 'gh[pousr]_[A-Za-z0-9]{30,}' \
  'github_pat_[A-Za-z0-9_]{20,}' 'sk-(proj-|ant-)?[A-Za-z0-9_-]{20,}' 'AIza[0-9A-Za-z_-]{35}' 'service_role' \
  'eyJhbGciOi[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}' '(password|passwd|secret|api_?key|token)["'\'']?\s*[:=]\s*["'\''][^"'\'' ]{8,}'; do
  r=$(F "$pat" | grep -vE '\.env(\.example|\.sample|\.template)?$|package-lock\.json|yarn\.lock|pnpm-lock' | tr '\n' ' ')
  [ -n "$r" ] && echo "[$pat] → $r"
done
echo "-- file .env bị git theo dõi (phải trống):"
git ls-files 2>/dev/null | grep -E '(^|/)\.env($|\.)' | grep -vE 'example|sample|template'
command -v gitleaks >/dev/null && { echo "-- gitleaks (cả lịch sử, đã che):"; gitleaks detect --no-banner --redact 2>&1 | tail -3; }

# ── 2. Browser extension ───────────────────────────────────────────────────────────────────────────────────────────────
if [ -n "$EXT_MANIFEST" ]; then
  S "2. Browser extension — manifest ($EXT_MANIFEST)"
  node -e "
const m=require(require('path').resolve('$EXT_MANIFEST'));
const p=(k,v)=>console.log(k.padEnd(18),JSON.stringify(v===undefined?null:v));
p('manifest_version',m.manifest_version);p('permissions',m.permissions);p('host_permissions',m.host_permissions);
p('optional',[m.optional_permissions,m.optional_host_permissions]);p('content_scripts',(m.content_scripts||[]).map(c=>({matches:c.matches,all_frames:c.all_frames,world:c.world})));
p('externally_conn',m.externally_connectable);p('web_accessible',m.web_accessible_resources);p('CSP',m.content_security_policy);
p('background',m.background);p('update_url',m.update_url);" 2>/dev/null || cat "$EXT_MANIFEST" | head -40
  echo "-- message / API nhạy cảm:"
  G 'onMessageExternal|onConnectExternal|runtime\.onMessage|onConnect\.|executeScript|insertCSS|tabs\.(create|update)|windows\.create|bookmarks\.(create|update)|downloads\.download|omnibox\.on|contextMenus\.onClicked|nativeMessaging'
fi

# ── 3. Điểm chìm HTML ──────────────────────────────────────────────────────────────────────────────────────────────────
S "3. Điểm chìm HTML / DOM (XSS)"
G 'v-html|dangerouslySetInnerHTML|\{@html|bypassSecurityTrust|\.innerHTML\s*=|outerHTML\s*=|insertAdjacentHTML|document\.write|createContextualFragment|\|\s*safe\b|mark_safe|html_safe|raw\(|template\.HTML\('
echo "-- phân tích HTML (trơ = DOMParser / createHTMLDocument; sống = createElement + innerHTML):"
G 'DOMParser|createHTMLDocument|parseFromString|DOMPurify|sanitize'
echo "-- URL động vào href / src / điều hướng:"
G ':href=|:src=|href=\{|src=\{|window\.open\(|location(\.href)?\s*=|router\.push\(|redirect\('

# ── 4. Thực thi mã / giải tuần tự ──────────────────────────────────────────────────────────────────────────────────────
S "4. Thực thi mã / lệnh / giải tuần tự"
G '\beval\(|new Function\(|setTimeout\(\s*["'\''`]|vm\.run|child_process|(^|[^.[:alnum:]_])exec(Sync|File)?\(|spawn\([^)]*shell|os\.system|subprocess\.[a-z]+\([^)]*shell=True|exec\.Command\("(sh|bash)"|pickle\.loads|yaml\.load\(|unserialize\(|Marshal\.load|ObjectInputStream'

# ── 5. Truy vấn / đường dẫn / mạng ─────────────────────────────────────────────────────────────────────────────────────
S "5. Injection: SQL / NoSQL / PostgREST / đường dẫn / SSRF"
G '(query|execute|raw|exec)\(\s*[`"'\''][^`"'\'']*(SELECT|INSERT|UPDATE|DELETE|WHERE)[^`"'\'']*(\$\{|"\s*\+|%s|\{\})|\$queryRawUnsafe|\$executeRawUnsafe|Sprintf\("(SELECT|INSERT|UPDATE|DELETE)|\$where|\.or\(`|\.filter\(`'
G 'path\.(join|resolve)\([^)]*(req\.|params|query|body)|sendFile\(|res\.download\(|open\([^)]*request\.|zipfile|AdmZip|unzipper|extract(all)?\('
G '(fetch|axios(\.[a-z]+)?|got|request|requests\.(get|post)|http\.Get|urllib\.request\.urlopen)\([^)]*(req\.|params|query|body|url\b|input)'

# ── 6. Xác thực / phân quyền / phiên ───────────────────────────────────────────────────────────────────────────────────
S "6. Xác thực, phiên, CORS"
G 'jwt\.(decode|verify|sign)|ignoreExpiration|algorithms?\s*:|alg.*none|signInWith|signUp\(|auth\.mfa|AssuranceLevel|bcrypt|argon2|scrypt|md5\(|sha1\(|createHash\(["'\'']md5'
G 'localStorage\.setItem\([^)]*(token|jwt|session)|httpOnly|sameSite|\bsecure:\s*false|Access-Control-Allow-Origin|cors\(|origin:\s*(true|["'\'']\*)|credentials:\s*true'
echo "-- route (kiểm từng route có middleware xác thực / phân quyền):"
G '\.(get|post|put|patch|delete)\(\s*["'\''`]/|@(Get|Post|Put|Patch|Delete)\(|@app\.(get|post|put|delete|route)|HandleFunc\('
echo "-- gán hàng loạt (mass assignment):"
G '\.(create|update|insert|upsert)\(\s*req\.body|fields\s*=\s*["'\'']__all__|Object\.assign\([^,]+,\s*req\.body'

# ── 7. BaaS ────────────────────────────────────────────────────────────────────────────────────────────────────────────
if has supabase || dep @supabase/supabase-js; then
  S "7. Supabase — RLS / hàm / storage (bảng tạo ở dashboard không có ở đây → người dùng kiểm Advisors)"
  SQL=$(find . -path ./node_modules -prune -o -name '*.sql' -print 2>/dev/null | grep -i supabase)
  if [ -n "$SQL" ]; then
    echo "create table: $(cat $SQL | grep -ciE 'create table')  · enable RLS: $(cat $SQL | grep -ciE 'enable row level security')  · create policy: $(cat $SQL | grep -ciE 'create policy')"
    echo "-- bảng có tạo nhưng KHÔNG thấy enable RLS:"
    for t in $(cat $SQL | grep -oiE 'create table (if not exists )?(public\.)?[a-z_0-9]+' | awk '{print $NF}' | sed 's/^public\.//' | sort -u); do
      cat $SQL | grep -qiE "alter table (public\.)?$t enable row level security" || echo "   ⚠ $t"
    done
    echo "-- SECURITY DEFINER (bỏ qua RLS — phải SET search_path + tự kiểm auth.uid()):"
    grep -niE 'security definer' $SQL 2>/dev/null | head -n "$L"
    echo "-- policy quá rộng (using true / chỉ authenticated):"
    grep -niE 'using\s*\(\s*true\s*\)|with check\s*\(\s*true\s*\)|auth\.role\(\)\s*=\s*'\''authenticated'\''' $SQL 2>/dev/null | head -n "$L"
    echo "-- storage bucket public:"; grep -niE "public\s*[:=,]\s*true|storage\.buckets" $SQL 2>/dev/null | head -5
  fi
  echo "-- service role trong code client:"; G 'service_role|SUPABASE_SERVICE' | grep -vE 'supabase/functions/' | head -5
  ls supabase/functions 2>/dev/null | sed 's/^/   edge function: /'
fi
if has firebase.json || has firestore.rules || dep firebase; then
  S "7. Firebase — security rules"
  for f in firestore.rules storage.rules database.rules.json; do has "$f" && { echo "-- $f:"; grep -nE 'allow|if true|request\.auth != null|request\.time <' "$f" | head -n "$L"; }; done
fi

# ── 8. Mật mã / TLS ────────────────────────────────────────────────────────────────────────────────────────────────────
S "8. Mật mã & TLS"
G 'Math\.random\(|random\.random\(|rand\(\)|PBKDF2|ITERATIONS|iterations\s*[:=]|createCipher\(|AES.*ECB|ECB|rejectUnauthorized:\s*false|verify\s*=\s*False|InsecureSkipVerify:\s*true|NODE_TLS_REJECT_UNAUTHORIZED'

# ── 9. Riêng tư / log ──────────────────────────────────────────────────────────────────────────────────────────────────
S "9. Log & request ra ngoài trong mã"
echo "số console.log/debug/info/print (ngoài test): $(C 'console\.(log|debug|info)\(|\bprint\(')"
G '(console\.(log|info|debug)|logger\.[a-z]+|print)\([^)]*(password|token|secret|req\.body|authorization)'
echo "-- URL https cứng trong mã (CDN, analytics, API ngoài):"
G 'https?://[a-z0-9.-]+\.[a-z]{2,}' | grep -vE 'localhost|127\.0\.0\.1|example\.(com|org)|\.example\b|w3\.org|schema\.org|//\s|^\s*\*' | head -n "$L"

# ── 10. Chuỗi cung ứng ─────────────────────────────────────────────────────────────────────────────────────────────────
S "10. Chuỗi cung ứng"
LOCKS=$(ls package-lock.json yarn.lock pnpm-lock.yaml bun.lockb poetry.lock Pipfile.lock go.sum Cargo.lock 2>/dev/null | tr '\n' ' ')
[ -n "$LOCKS" ] && echo "lockfile: $LOCKS" || echo "⚠ không có lockfile (cài lại có thể kéo bản mới chưa kiểm)"
ls .github/workflows/*.y*ml .github/dependabot.y*ml renovate.json .gitlab-ci.yml 2>/dev/null || echo "⚠ không thấy CI / Dependabot / Renovate"
if [ -d .github/workflows ]; then
  echo "-- Actions rủi ro (pull_request_target, action không ghim, quyền rộng):"
  grep -nE 'pull_request_target|uses:\s*[^@]+@(main|master)\b|permissions:\s*write-all' .github/workflows/*.y*ml 2>/dev/null | head -n "$L"
fi
if [ "${RECON_NO_AUDIT:-0}" != 1 ]; then
  if has package-lock.json; then
    echo "-- npm audit (production, --omit=dev):"; npm audit --omit=dev 2>/dev/null | grep -E 'vulnerabilit|Severity: (high|critical)' | head -5
    echo "-- npm audit (gồm công cụ dev):"; npm audit 2>/dev/null | grep -E 'vulnerabilit' | tail -1
  elif has pnpm-lock.yaml; then pnpm audit --prod 2>/dev/null | tail -3
  elif has yarn.lock; then yarn npm audit --environment production 2>/dev/null | tail -3 || yarn audit --groups dependencies 2>/dev/null | tail -3
  fi
  { has requirements.txt || has pyproject.toml; } && { command -v pip-audit >/dev/null && pip-audit 2>/dev/null | tail -5 || echo "(pip-audit chưa cài)"; }
  has go.mod && { command -v govulncheck >/dev/null && govulncheck ./... 2>/dev/null | tail -5 || echo "(govulncheck chưa cài)"; }
  has Cargo.toml && { command -v cargo-audit >/dev/null && cargo audit 2>/dev/null | tail -5 || echo "(cargo-audit chưa cài)"; }
fi
has package.json && node -e "const p=require('./package.json');const s=p.scripts||{};['preinstall','install','postinstall','prepare'].forEach(k=>s[k]&&console.log('script',k,'=',s[k]))"

# ── 11. Giới hạn / DoS ─────────────────────────────────────────────────────────────────────────────────────────────────
S "11. Giới hạn kích thước / ReDoS"
G 'MAX_[A-Z_]*(BYTES|SIZE|ROWS|DEPTH|LEN)|limit:\s*["'\'']?[0-9]+(kb|mb)|bodyParser|express\.json\(|client_max_body_size|new RegExp\('

# ── 12. Phá hủy / hạ tầng ──────────────────────────────────────────────────────────────────────────────────────────────
S "12. Thao tác phá hủy & hạ tầng"
G 'deleteMany\(\s*\{\s*\}|DROP TABLE|TRUNCATE|rm -rf|removeTree|deleteAll|clearAll|destroyAll'
for f in $(ls Dockerfile* 2>/dev/null); do grep -qE '^USER ' "$f" || echo "⚠ $f không có USER (chạy root)"; grep -nE 'FROM .*:latest|COPY \. ' "$f" | head -3; done

echo; echo "Xong. Tiếp: references/core-checklist.md + module stack ở mục 0; ghi kết quả vào REDTEAM-PROFILE.md."
