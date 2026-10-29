import { isAdminRequest } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_TOOLBAR = `
<div id="adm-root">
  <div class="adm-container">
    <div class="adm-topbar">
      <div class="adm-brand">
        <a href="/admin" class="adm-back-link" title="Kembali ke Admin Panel">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          Admin
        </a>
        <span class="adm-brand-sep">/</span>
        <span class="adm-brand-title">API Console &amp; Key Manager</span>
      </div>
      <div class="adm-status-badge" id="adm-status">
        <span class="adm-dot"></span>
        <span id="adm-status-text">Belum Ter-authorize</span>
      </div>
    </div>

    <div class="adm-controls">
      <!-- Existing Agent -->
      <div class="adm-control-group">
        <label class="adm-label">Pilih Agent Terdaftar</label>
        <div class="adm-inline-form">
          <select id="adm-agent" class="adm-select"></select>
          <button id="adm-regen" class="adm-btn adm-btn-secondary" title="Buat API key baru untuk agent terpilih">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/></svg>
            Key Baru &amp; Authorize
          </button>
        </div>
      </div>

      <div class="adm-divider">
        <span>atau</span>
      </div>

      <!-- Quick Create Agent -->
      <div class="adm-control-group adm-flex-1">
        <label class="adm-label">Buat Agent Baru Cepat</label>
        <div class="adm-inline-form">
          <input id="adm-name" class="adm-input" placeholder="Nama agent (misal: PipelineBot)" />
          <input id="adm-provider" class="adm-input adm-input-sm" placeholder="Provider (opsional)" />
          <button id="adm-create" class="adm-btn adm-btn-primary">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
            Buat &amp; Authorize
          </button>
        </div>
      </div>
    </div>

    <!-- Key Reveal Box -->
    <div id="adm-keybox" class="adm-keybox" hidden>
      <div class="adm-keybox-header">
        <div class="adm-keybox-info">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></svg>
          <strong>API Key Berhasil Dibuat</strong>
          <span class="adm-keybox-note">&bull; Otomatis aktif &amp; ter-authorize di Swagger di bawah! Simpan key ini (hanya tampil sekali):</span>
        </div>
        <button id="adm-copy" class="adm-btn adm-btn-copy">
          <span id="adm-copy-label">Salin Key</span>
        </button>
      </div>
      <div class="adm-keybox-code-wrapper">
        <code id="adm-key"></code>
      </div>
    </div>

    <div class="adm-err-box" id="adm-err" hidden></div>
  </div>
</div>`;

const SWAGGER_DARK_CSS = `
  /* Global reset & typography */
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 0;
    background-color: #09090b !important;
    color: #e4e4e7 !important;
    font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
    -webkit-font-smoothing: antialiased;
  }

  /* Admin Toolbar Styling */
  #adm-root {
    background: #111113;
    border-bottom: 1px solid #27272a;
    padding: 16px 24px;
    box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.5);
  }
  .adm-container {
    max-width: 1400px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .adm-topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .adm-brand {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
  }
  .adm-back-link {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: #a78bfa;
    text-decoration: none;
    font-weight: 500;
    padding: 4px 8px;
    border-radius: 6px;
    background: rgba(167, 139, 250, 0.1);
    transition: all 0.15s ease;
  }
  .adm-back-link:hover {
    background: rgba(167, 139, 250, 0.2);
    color: #c4b5fd;
  }
  .adm-brand-sep { color: #52525b; }
  .adm-brand-title {
    color: #fafafa;
    font-weight: 600;
  }
  .adm-status-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 9999px;
    background: #18181b;
    border: 1px solid #27272a;
    font-size: 12px;
    font-weight: 500;
    color: #a1a1aa;
    transition: all 0.2s ease;
  }
  .adm-status-badge .adm-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #71717a;
  }
  .adm-status-badge.ok {
    background: rgba(16, 185, 129, 0.1);
    border-color: rgba(16, 185, 129, 0.25);
    color: #34d399;
  }
  .adm-status-badge.ok .adm-dot {
    background: #10b981;
    box-shadow: 0 0 8px #10b981;
  }
  .adm-controls {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 16px;
    background: #18181b;
    padding: 14px 18px;
    border-radius: 12px;
    border: 1px solid #27272a;
  }
  .adm-control-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .adm-flex-1 { flex: 1; min-width: 320px; }
  .adm-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #a1a1aa;
  }
  .adm-inline-form {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .adm-divider {
    display: flex;
    align-items: center;
    padding-bottom: 8px;
    color: #52525b;
    font-size: 12px;
    font-style: italic;
  }
  .adm-select, .adm-input {
    background: #09090b;
    border: 1px solid #3f3f46;
    color: #f4f4f5;
    padding: 8px 12px;
    border-radius: 8px;
    font-size: 13px;
    outline: none;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }
  .adm-select:focus, .adm-input:focus {
    border-color: #8b5cf6;
    box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.2);
  }
  .adm-select { min-width: 180px; cursor: pointer; }
  .adm-input { flex: 1; min-width: 140px; }
  .adm-input-sm { width: 140px; }
  .adm-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    border: 1px solid transparent;
    transition: all 0.15s ease;
    white-space: nowrap;
  }
  .adm-btn-primary {
    background: #7c3aed;
    color: #ffffff;
  }
  .adm-btn-primary:hover:not(:disabled) {
    background: #6d28d9;
  }
  .adm-btn-secondary {
    background: #27272a;
    border-color: #3f3f46;
    color: #e4e4e7;
  }
  .adm-btn-secondary:hover:not(:disabled) {
    background: #3f3f46;
    color: #ffffff;
  }
  .adm-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .adm-keybox {
    background: rgba(109, 40, 217, 0.08);
    border: 1px solid rgba(139, 92, 246, 0.3);
    border-radius: 12px;
    padding: 14px 18px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .adm-keybox-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }
  .adm-keybox-info {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: #e4e4e7;
  }
  .adm-keybox-note {
    color: #a1a1aa;
    font-size: 12px;
  }
  .adm-btn-copy {
    background: #7c3aed;
    color: #fff;
    padding: 6px 12px;
    font-size: 12px;
  }
  .adm-btn-copy:hover {
    background: #6d28d9;
  }
  .adm-keybox-code-wrapper {
    background: #09090b;
    border: 1px solid #27272a;
    border-radius: 8px;
    padding: 8px 12px;
    overflow-x: auto;
  }
  #adm-key {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 12px;
    color: #c4b5fd;
    word-break: break-all;
  }
  .adm-err-box {
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 8px;
    color: #f87171;
    font-size: 13px;
    padding: 10px 14px;
  }

  /* ==========================================================================
     Swagger UI Dark Theme Overhaul
     ========================================================================== */
  #swagger-ui {
    max-width: 1400px;
    margin: 0 auto;
    padding: 20px;
  }
  .swagger-ui .topbar { display: none !important; }

  /* Info / Header Section */
  .swagger-ui .info {
    margin: 20px 0 30px !important;
  }
  .swagger-ui .info .title {
    color: #fafafa !important;
    font-size: 32px !important;
    font-weight: 700 !important;
    letter-spacing: -0.02em;
  }
  .swagger-ui .info .title small {
    background: #27272a !important;
    color: #a78bfa !important;
    border-radius: 9999px !important;
    padding: 4px 10px !important;
    font-size: 12px !important;
    vertical-align: middle;
    margin-left: 10px;
    border: 1px solid #3f3f46;
  }
  .swagger-ui .info p,
  .swagger-ui .info li,
  .swagger-ui .info table {
    color: #a1a1aa !important;
    font-size: 14px !important;
    line-height: 1.6 !important;
  }
  .swagger-ui .info a {
    color: #a78bfa !important;
    text-decoration: underline;
  }
  .swagger-ui .info a:hover {
    color: #c4b5fd !important;
  }

  /* Scheme & Authorize container */
  .swagger-ui .scheme-container {
    background: #111113 !important;
    box-shadow: none !important;
    border: 1px solid #27272a !important;
    border-radius: 12px !important;
    padding: 16px 20px !important;
    margin-bottom: 24px !important;
  }
  .swagger-ui .schemes > label {
    color: #e4e4e7 !important;
    font-size: 13px !important;
  }
  .swagger-ui .schemes select {
    background: #18181b !important;
    border: 1px solid #3f3f46 !important;
    color: #f4f4f5 !important;
    border-radius: 6px !important;
    padding: 6px 10px !important;
  }

  /* Main Authorize Button */
  .swagger-ui .btn.authorize {
    background: #18181b !important;
    color: #34d399 !important;
    border: 1px solid rgba(16, 185, 129, 0.4) !important;
    border-radius: 8px !important;
    font-weight: 600 !important;
    padding: 8px 16px !important;
    transition: all 0.15s ease;
  }
  .swagger-ui .btn.authorize:hover {
    background: rgba(16, 185, 129, 0.1) !important;
    border-color: #10b981 !important;
  }
  .swagger-ui .btn.authorize svg {
    fill: #34d399 !important;
  }

  /* Tags / Groups */
  .swagger-ui .opblock-tag {
    color: #fafafa !important;
    border-bottom: 1px solid #27272a !important;
    font-size: 20px !important;
    font-weight: 600 !important;
    padding: 16px 0 10px !important;
  }
  .swagger-ui .opblock-tag:hover {
    background: transparent !important;
  }
  .swagger-ui .opblock-tag small {
    color: #71717a !important;
  }

  /* Operation Blocks (Endpoints) */
  .swagger-ui .opblock {
    background: #111113 !important;
    border: 1px solid #27272a !important;
    border-radius: 10px !important;
    margin: 0 0 12px !important;
    box-shadow: none !important;
    transition: border-color 0.15s ease;
  }
  .swagger-ui .opblock:hover {
    border-color: #3f3f46 !important;
  }
  .swagger-ui .opblock .opblock-summary {
    padding: 10px 14px !important;
    border-radius: 10px !important;
  }
  .swagger-ui .opblock .opblock-summary-method {
    font-size: 12px !important;
    font-weight: 700 !important;
    border-radius: 6px !important;
    min-width: 70px !important;
    text-shadow: none !important;
    padding: 5px 10px !important;
  }
  .swagger-ui .opblock .opblock-summary-path,
  .swagger-ui .opblock .opblock-summary-path__deprecated {
    color: #f4f4f5 !important;
    font-size: 14px !important;
    font-weight: 500 !important;
  }
  .swagger-ui .opblock .opblock-summary-description {
    color: #a1a1aa !important;
    font-size: 13px !important;
  }

  /* Method Specific Styling */
  /* GET */
  .swagger-ui .opblock.opblock-get {
    border-color: rgba(2, 132, 199, 0.3) !important;
    background: rgba(2, 132, 199, 0.03) !important;
  }
  .swagger-ui .opblock.opblock-get .opblock-summary-method {
    background: #0284c7 !important;
  }
  .swagger-ui .opblock.opblock-get .opblock-summary {
    border-color: rgba(2, 132, 199, 0.2) !important;
  }

  /* POST */
  .swagger-ui .opblock.opblock-post {
    border-color: rgba(16, 185, 129, 0.3) !important;
    background: rgba(16, 185, 129, 0.03) !important;
  }
  .swagger-ui .opblock.opblock-post .opblock-summary-method {
    background: #059669 !important;
  }
  .swagger-ui .opblock.opblock-post .opblock-summary {
    border-color: rgba(16, 185, 129, 0.2) !important;
  }

  /* PATCH / PUT */
  .swagger-ui .opblock.opblock-patch,
  .swagger-ui .opblock.opblock-put {
    border-color: rgba(217, 119, 6, 0.3) !important;
    background: rgba(217, 119, 6, 0.03) !important;
  }
  .swagger-ui .opblock.opblock-patch .opblock-summary-method,
  .swagger-ui .opblock.opblock-put .opblock-summary-method {
    background: #d97706 !important;
  }

  /* DELETE */
  .swagger-ui .opblock.opblock-delete {
    border-color: rgba(220, 38, 38, 0.3) !important;
    background: rgba(220, 38, 38, 0.03) !important;
  }
  .swagger-ui .opblock.opblock-delete .opblock-summary-method {
    background: #dc2626 !important;
  }

  /* Inside Opblock Body */
  .swagger-ui .opblock-body {
    background: #0d0d0f !important;
    border-top: 1px solid #27272a !important;
    padding: 20px !important;
    border-bottom-left-radius: 10px;
    border-bottom-right-radius: 10px;
  }
  .swagger-ui .opblock-description-wrapper p,
  .swagger-ui .opblock-external-docs-wrapper p,
  .swagger-ui .opblock-title_normal p {
    color: #d4d4d8 !important;
    font-size: 13px !important;
  }

  /* Tables & Parameters */
  .swagger-ui table thead tr td,
  .swagger-ui table thead tr th {
    color: #a1a1aa !important;
    border-bottom: 1px solid #27272a !important;
    font-size: 12px !important;
    text-transform: uppercase;
  }
  .swagger-ui .parameters-col_name {
    color: #fafafa !important;
    font-size: 13px !important;
  }
  .swagger-ui .parameter__name {
    color: #e4e4e7 !important;
    font-weight: 600 !important;
  }
  .swagger-ui .parameter__type {
    color: #a78bfa !important;
  }
  .swagger-ui .parameter__in {
    color: #71717a !important;
  }
  .swagger-ui .parameters-col_description p {
    color: #a1a1aa !important;
  }

  /* Form Elements inside Swagger */
  .swagger-ui input[type=text],
  .swagger-ui input[type=password],
  .swagger-ui input[type=search],
  .swagger-ui input[type=email],
  .swagger-ui input[type=file],
  .swagger-ui textarea,
  .swagger-ui select {
    background: #18181b !important;
    border: 1px solid #3f3f46 !important;
    color: #f4f4f5 !important;
    border-radius: 6px !important;
    padding: 8px 10px !important;
    font-size: 13px !important;
  }
  .swagger-ui textarea {
    font-family: ui-monospace, monospace !important;
  }

  /* Buttons */
  .swagger-ui .btn {
    border-radius: 6px !important;
    font-size: 13px !important;
    border: 1px solid #3f3f46 !important;
    color: #e4e4e7 !important;
    background: #18181b !important;
    box-shadow: none !important;
    transition: all 0.15s ease;
  }
  .swagger-ui .btn:hover {
    background: #27272a !important;
    color: #ffffff !important;
  }
  .swagger-ui .btn.execute {
    background: #7c3aed !important;
    border-color: #7c3aed !important;
    color: #ffffff !important;
    font-weight: 600 !important;
  }
  .swagger-ui .btn.execute:hover {
    background: #6d28d9 !important;
  }
  .swagger-ui .btn-clear {
    background: #27272a !important;
    border-color: #3f3f46 !important;
  }

  /* Responses Section */
  .swagger-ui .responses-inner {
    padding: 10px 0 !important;
  }
  .swagger-ui .responses-inner h4,
  .swagger-ui .responses-inner h5 {
    color: #e4e4e7 !important;
  }
  .swagger-ui .response-col_status {
    color: #fafafa !important;
    font-weight: 600 !important;
  }
  .swagger-ui .response-col_description {
    color: #a1a1aa !important;
  }
  .swagger-ui .highlight-code,
  .swagger-ui .microlight,
  .swagger-ui pre {
    background: #09090b !important;
    border: 1px solid #27272a !important;
    border-radius: 8px !important;
    color: #c4b5fd !important;
  }

  /* Models Section */
  .swagger-ui section.models {
    border: 1px solid #27272a !important;
    border-radius: 12px !important;
    background: #111113 !important;
    margin-top: 30px !important;
  }
  .swagger-ui section.models h4 {
    color: #fafafa !important;
    border-bottom: 1px solid #27272a !important;
  }
  .swagger-ui .model-box {
    background: #0d0d0f !important;
    border-radius: 8px;
    padding: 10px;
  }
  .swagger-ui .model {
    color: #d4d4d8 !important;
  }
  .swagger-ui .model-title {
    color: #fafafa !important;
  }
  .swagger-ui .prop-type {
    color: #a78bfa !important;
  }

  /* Dialog / Modal (Authorization Window) */
  .swagger-ui .dialog-ux .backdrop-ux {
    background: rgba(0, 0, 0, 0.75) !important;
    backdrop-filter: blur(4px);
  }
  .swagger-ui .dialog-ux .modal-ux {
    background: #18181b !important;
    border: 1px solid #3f3f46 !important;
    border-radius: 14px !important;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5) !important;
  }
  .swagger-ui .dialog-ux .modal-ux-header {
    border-bottom: 1px solid #27272a !important;
  }
  .swagger-ui .dialog-ux .modal-ux-header h3 {
    color: #fafafa !important;
  }
  .swagger-ui .dialog-ux .modal-ux-content {
    color: #d4d4d8 !important;
  }
  .swagger-ui .dialog-ux .modal-ux-content h4 {
    color: #f4f4f5 !important;
  }
  .swagger-ui .dialog-ux .modal-ux-content p {
    color: #a1a1aa !important;
  }
`;

const ADMIN_SCRIPT = `
  (function () {
    var $ = function (id) { return document.getElementById(id); };
    var busy = false;

    function setBusy(v) {
      busy = v;
      ['adm-regen', 'adm-create'].forEach(function (id) {
        var el = $(id);
        if (el) el.disabled = v;
      });
    }
    function showError(msg) {
      var el = $('adm-err');
      if (!el) return;
      el.hidden = !msg;
      el.textContent = msg || '';
    }
    function updateAuthorizeStatus(key, agentName) {
      if (window.ui && window.ui.authActions) {
        window.ui.authActions.authorize({
          AgentApiKey: {
            name: 'AgentApiKey',
            schema: { type: 'http', scheme: 'bearer' },
            value: key
          }
        });
      }
      $('adm-key').textContent = key;
      $('adm-keybox').hidden = false;
      var st = $('adm-status');
      var stText = $('adm-status-text');
      if (st && stText) {
        stText.textContent = 'Authorized: ' + agentName;
        st.className = 'adm-status-badge ok';
      }
    }
    async function loadAgents(selectId) {
      try {
        var res = await fetch('/api/admin/agents');
        if (!res.ok) {
          showError('Gagal memuat daftar agent (sesi admin kedaluwarsa?)');
          return;
        }
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
        var regenBtn = $('adm-regen');
        if (regenBtn) regenBtn.disabled = agents.length === 0;
      } catch (err) {
        showError('Koneksi gagal saat memuat agent: ' + err.message);
      }
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
      if (!confirm('Generate API key baru untuk "' + opt.dataset.name + '"? Key lama akan langsung hangus.')) return;
      setBusy(true);
      showError('');
      try {
        var data = await call('/api/admin/agents/' + opt.value + '/regenerate', { method: 'POST' });
        updateAuthorizeStatus(data.apiKey, opt.dataset.name);
      } catch (e) {
        showError(e.message);
      }
      setBusy(false);
    });

    $('adm-create').addEventListener('click', async function () {
      if (busy) return;
      var name = $('adm-name').value.trim();
      if (!name) {
        showError('Nama agent wajib diisi');
        return;
      }
      setBusy(true);
      showError('');
      try {
        var data = await call('/api/admin/agents', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: name, provider: $('adm-provider').value.trim() || 'custom' })
        });
        updateAuthorizeStatus(data.apiKey, data.agent.name);
        $('adm-name').value = '';
        $('adm-provider').value = '';
        await loadAgents(data.agent.id);
      } catch (e) {
        showError(e.message);
      }
      setBusy(false);
    });

    $('adm-copy').addEventListener('click', function () {
      var key = $('adm-key').textContent || '';
      if (!key) return;
      navigator.clipboard.writeText(key).then(function () {
        var lbl = $('adm-copy-label');
        if (lbl) {
          lbl.textContent = 'Tersalin!';
          setTimeout(function () { lbl.textContent = 'Salin Key'; }, 2000);
        }
      });
    });

    window.addEventListener('load', function () {
      loadAgents();
    });
  })();
`;

/**
 * GET /api/v1/docs — Swagger UI interaktif bertema dark modern (Tailwind Zinc Palette).
 * Jika pemanggil login sebagai admin, toolbar modern untuk mengelola API key & auto-authorize aktif di atas.
 */
export async function GET() {
  const admin = await isAdminRequest();

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>web-vid-review — API Documentation</title>
<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui.css">
<style>
  ${SWAGGER_DARK_CSS}
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
      defaultModelsExpandDepth: 1,
      defaultModelExpandDepth: 1,
      docExpansion: 'list',
    });
  });
</script>
${admin ? `<script>${ADMIN_SCRIPT}</script>` : ""}
</body>
</html>`;

  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
