import { isAdminRequest } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_TOOLBAR = `
<div id="adm">
  <div class="adm-row">
    <a href="/admin" class="adm-link">&larr; Admin</a>
    <strong>API Key &amp; Authorize</strong>
    <span class="adm-status" id="adm-status">Belum authorize</span>
  </div>
  <div class="adm-row">
    <select id="adm-agent"></select>
    <button id="adm-regen" class="adm-btn">Generate key baru &amp; authorize</button>
    <span class="adm-sep">atau agent baru:</span>
    <input id="adm-name" placeholder="Nama agent" />
    <input id="adm-provider" placeholder="Provider (opsional)" />
    <button id="adm-create" class="adm-btn adm-primary">Buat &amp; authorize</button>
  </div>
  <div class="adm-row" id="adm-keybox" hidden>
    <code id="adm-key"></code>
    <button id="adm-copy" class="adm-btn">Salin</button>
    <span class="adm-hint">Key hanya tampil sekali. Sudah otomatis ter-authorize di Swagger.</span>
  </div>
  <div class="adm-row adm-err" id="adm-err" hidden></div>
</div>`;

const ADMIN_STYLE = `
  #adm { background:#18181b; color:#e4e4e7; border-bottom:1px solid #3f3f46; padding:12px 20px; font:13px system-ui,sans-serif; }
  .adm-row { display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin:4px 0; }
  .adm-link { color:#a78bfa; text-decoration:none; }
  .adm-status { margin-left:auto; color:#a1a1aa; }
  .adm-status.ok { color:#34d399; }
  .adm-sep { color:#71717a; }
  #adm select, #adm input { background:#09090b; color:#e4e4e7; border:1px solid #3f3f46; border-radius:6px; padding:6px 8px; font-size:13px; }
  .adm-btn { background:#27272a; color:#e4e4e7; border:1px solid #3f3f46; border-radius:6px; padding:6px 10px; cursor:pointer; font-size:13px; }
  .adm-btn:hover { background:#3f3f46; }
  .adm-btn:disabled { opacity:.5; cursor:default; }
  .adm-primary { background:#7c3aed; border-color:#7c3aed; color:#fff; }
  .adm-primary:hover { background:#6d28d9; }
  #adm code { background:#09090b; color:#c4b5fd; border-radius:6px; padding:6px 8px; font-size:12px; overflow-x:auto; max-width:100%; }
  .adm-hint { color:#71717a; }
  .adm-err { color:#f87171; }
`;

const ADMIN_SCRIPT = `
  (function () {
    var $ = function (id) { return document.getElementById(id); };
    var busy = false;

    function setBusy(v) {
      busy = v;
      ['adm-regen', 'adm-create'].forEach(function (id) { $(id).disabled = v; });
    }
    function showError(msg) {
      var el = $('adm-err');
      el.hidden = !msg;
      el.textContent = msg || '';
    }
    function authorize(key, label) {
      window.ui.authActions.authorize({
        AgentApiKey: {
          name: 'AgentApiKey',
          schema: { type: 'http', scheme: 'bearer' },
          value: key
        }
      });
      $('adm-key').textContent = key;
      $('adm-keybox').hidden = false;
      var st = $('adm-status');
      st.textContent = 'Authorized sebagai ' + label;
      st.className = 'adm-status ok';
    }
    async function loadAgents(selectId) {
      var res = await fetch('/api/admin/agents');
      if (!res.ok) { showError('Gagal memuat agent (sesi admin habis?)'); return; }
      var agents = await res.json();
      var sel = $('adm-agent');
      sel.textContent = '';
      agents.forEach(function (a) {
        var o = document.createElement('option');
        o.value = a.id;
        o.textContent = a.name + (a.active ? '' : ' (nonaktif)');
        o.dataset.name = a.name;
        sel.appendChild(o);
      });
      if (selectId) sel.value = selectId;
      $('adm-regen').disabled = agents.length === 0;
    }
    async function call(url, init) {
      var res = await fetch(url, init);
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
      return data;
    }

    $('adm-regen').addEventListener('click', async function () {
      if (busy) return;
      var opt = $('adm-agent').selectedOptions[0];
      if (!opt) return;
      if (!confirm('Generate API key baru untuk "' + opt.dataset.name + '"? Key lama akan hangus.')) return;
      setBusy(true); showError('');
      try {
        var data = await call('/api/admin/agents/' + opt.value + '/regenerate', { method: 'POST' });
        authorize(data.apiKey, opt.dataset.name);
      } catch (e) { showError(e.message); }
      setBusy(false);
    });

    $('adm-create').addEventListener('click', async function () {
      if (busy) return;
      var name = $('adm-name').value.trim();
      if (!name) { showError('Nama agent wajib diisi'); return; }
      setBusy(true); showError('');
      try {
        var data = await call('/api/admin/agents', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: name, provider: $('adm-provider').value.trim() || 'unknown' })
        });
        authorize(data.apiKey, data.agent.name);
        $('adm-name').value = '';
        $('adm-provider').value = '';
        await loadAgents(data.agent.id);
      } catch (e) { showError(e.message); }
      setBusy(false);
    });

    $('adm-copy').addEventListener('click', function () {
      navigator.clipboard.writeText($('adm-key').textContent || '');
    });

    window.addEventListener('load', function () { loadAgents(); });
  })();
`;

/**
 * GET /api/v1/docs — Swagger UI interaktif (memuat spesifikasi dari /api/v1/openapi).
 * Bila pemanggil login sebagai admin, toolbar pembuat API key + auto-authorize ditampilkan.
 */
export async function GET() {
  const admin = await isAdminRequest();

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>web-vid-review — Swagger UI</title>
<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui.css">
<style>
  body { margin: 0; background: #09090b; }
  #swagger-ui .topbar { display: none; }
  ${admin ? ADMIN_STYLE : ""}
</style>
</head>
<body>
${admin ? ADMIN_TOOLBAR : ""}
<div id="swagger-ui"></div>
<script src="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui-bundle.js" crossorigin></script>
<script>
  window.addEventListener('load', function () {
    window.ui = SwaggerUIBundle({
      url: '/api/v1/openapi',
      dom_id: '#swagger-ui',
      deepLinking: true,
      tryItOutEnabled: true,
      persistAuthorization: true,
    });
  });
</script>
${admin ? `<script>${ADMIN_SCRIPT}</script>` : ""}
</body>
</html>`;

  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
