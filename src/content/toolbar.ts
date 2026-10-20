export interface Counts {
  exact: number;
  inferred: number;
  missing: number;
}

export interface Toolbar {
  show(): void;
  hide(): void;
  setCounts(c: Counts): void;
  setStatus(s: string): void;
}

/** Barrita flotante en shadow DOM (no la afectan los estilos del sitio). No tiene botón de enviar, a propósito. */
export function createToolbar(onFill: () => void, onClear: () => void): Toolbar {
  const host = document.createElement('div');
  host.dataset.aaToolbar = '1';
  host.style.cssText ='position:fixed;left:16px;bottom:16px;z-index:2147483647;display:none;';
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      .bar{font:13px/1.3 system-ui,sans-serif;background:#1d2226;color:#fff;border-radius:10px;padding:10px 12px;
           box-shadow:0 4px 18px rgba(0,0,0,.3);display:flex;flex-direction:column;gap:6px;min-width:230px}
      .row{display:flex;gap:10px;align-items:center}
      .pill{display:inline-flex;align-items:center;gap:4px}
      .dot{width:9px;height:9px;border-radius:50%}
      button{font:inherit;border:0;border-radius:6px;padding:5px 10px;cursor:pointer}
      .primary{background:#70b5f9;color:#0b1e2d;font-weight:600}
      .ghost{background:transparent;color:#cbd5e1;border:1px solid #4b5563}
      .status{color:#9ca3af;font-size:12px;min-height:14px}
    </style>
    <div class="bar">
      <div class="row"><img src="${chrome.runtime.getURL('icons/icon32.png')}" width="18" height="18" alt="" style="border-radius:4px"><strong>Apply Assistant</strong><span style="color:#9ca3af;font-size:11px">v${chrome.runtime.getManifest().version}</span></div>
      <div class="row">
        <span class="pill"><span class="dot" style="background:#4ade80"></span><b id="e">0</b> ok</span>
        <span class="pill"><span class="dot" style="background:#e8b600"></span><b id="i">0</b> revisar</span>
        <span class="pill"><span class="dot" style="background:#d93a3a"></span><b id="m">0</b> vacíos</span>
      </div>
      <div class="row">
        <button class="primary" id="fill">Completar paso</button>
        <button class="ghost" id="clear">Quitar marcas</button>
      </div>
      <div class="status" id="status">El envío final lo hacés vos.</div>
    </div>`;
  shadow.getElementById('fill')!.addEventListener('click', onFill);
  shadow.getElementById('clear')!.addEventListener('click', onClear);
  document.documentElement.appendChild(host);

  const $ = (id: string) => shadow.getElementById(id)!;
  return {
    show: () => (host.style.display = 'block'),
    hide: () => (host.style.display = 'none'),
    setCounts: (c) => {
      $('e').textContent = String(c.exact);
      $('i').textContent = String(c.inferred);
      $('m').textContent = String(c.missing);
    },
    setStatus: (s) => ($('status').textContent = s),
  };
}
