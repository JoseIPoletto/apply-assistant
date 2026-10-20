import { adapt, decide, type EngineCtx } from '../engine/decide';
import type { AiField } from '../engine/ai';
import type { AiResponse, Msg } from '../shared/messages';
import { bumpBankUse, loadBank, loadCv, loadProfile, loadSettings, upsertBankEntry } from '../shared/storage';
import type { Decision, Settings } from '../shared/types';
import { isNavButton, pickAdapter } from './adapters';
import { rootOf } from './deep';
import { readAnswer, scanFields, type FieldHandle } from './dom-fields';
import { applyFill } from './fill';
import { clearAll, injectStyles, mark, unmark } from './highlight';
import { createToolbar, type Counts } from './toolbar';

const log = (...a: unknown[]) => console.info('[Apply Assistant]', ...a);

const adapter = pickAdapter();
// Con all_frames, no duplicar la barrita en iframes de LinkedIn (ads, etc.).
const isTop = window.top === window;
if (adapter && (isTop || adapter.id !== 'linkedin')) void main();

async function main() {
  const site = adapter!;
  log('activo en', location.hostname, '— sitio:', site.id);
  let settings: Settings = await loadSettings();
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.settings) void loadSettings().then((s) => (settings = s));
  });

  injectStyles();
  const processed = new WeakSet<HTMLElement>();
  const decisions = new WeakMap<HTMLElement, Decision>();
  const toolbar = createToolbar(() => void run(true), () => {
    site.findRoots().forEach((r) => clearAll(r));
    toolbar.setStatus('Marcas quitadas.');
  });

  // En LinkedIn la barrita queda siempre visible: así sabés que la extensión corre.
  const alwaysVisible = site.id === 'linkedin';
  if (alwaysVisible) {
    toolbar.show();
    toolbar.setStatus('Esperando un formulario de postulación…');
  }

  async function buildCtx(): Promise<EngineCtx> {
    const [profile, bank, cvBytes] = await Promise.all([
      loadProfile(),
      loadBank(),
      chrome.storage.local.getBytesInUse('cvFile'),
    ]);
    return {
      profile,
      bank,
      claudeEnabled: settings.claudeEnabled && !!settings.apiKey,
      hasCv: cvBytes > 0 && site.uploadCv(settings),
    };
  }

  function recount(roots = site.findRoots()) {
    const c: Counts = { exact: 0, inferred: 0, missing: 0 };
    for (const root of roots) {
      for (const h of scanFields(root)) {
        const d = decisions.get(h.primary);
        if (!d) continue;
        if (d.status === 'exact') c.exact++;
        else if (d.status === 'inferred') c.inferred++;
        else if (d.status === 'missing') c.missing++;
      }
    }
    toolbar.setCounts(c);
    return c;
  }

  async function apply(h: FieldHandle, d: Decision) {
    if (d.fill && (d.status === 'exact' || d.status === 'inferred')) {
      const ok = await applyFill(h, d.fill, loadCv);
      if (!ok) d = { ...d, status: 'missing', note: `No pude escribir el valor (${d.note})` };
      else if (d.bankId) void bumpBankUse(d.bankId);
    }
    decisions.set(h.primary, d);
    mark(h, d);
  }

  async function fillRoot(root: HTMLElement, manual: boolean) {
    injectStyles(rootOf(root));
    listenOn(rootOf(root));
    const ctx = await buildCtx();
    const pendingAi: { h: FieldHandle; d: Decision }[] = [];

    for (const h of scanFields(root)) {
      if (!manual && processed.has(h.primary)) continue;
      processed.add(h.primary);
      if (h.info.hasValue && !settings.overwriteExisting) continue; // lo que ya está, no se toca
      if (!h.info.label) continue;

      const d = decide(h.info, ctx);
      log(`${d.status.padEnd(8)} [${h.info.kind}] "${h.info.label}" → ${d.note}`);
      if (d.status === 'needs-ai') {
        pendingAi.push({ h, d });
        const waiting: Decision = { ...d, status: 'missing', note: 'Consultando a Claude…' };
        decisions.set(h.primary, waiting);
        mark(h, waiting);
        continue;
      }
      await apply(h, d);
    }
    const c = recount();
    toolbar.setStatus(
      c.inferred || c.missing ? 'Revisá lo amarillo y completá lo rojo. El envío es tuyo.' : 'Paso completo. El envío es tuyo.',
    );
    if (pendingAi.length) await resolveWithClaude(pendingAi, ctx);
  }

  async function resolveWithClaude(items: { h: FieldHandle; d: Decision }[], ctx: EngineCtx) {
    toolbar.setStatus(`Consultando a Claude (${items.length})…`);
    const fields: AiField[] = items.map(({ h, d }) => ({
      ...h.info,
      hints: (d.hints ?? []).map((e) => ({ question: e.question, answer: e.answer })),
    }));
    let res: AiResponse;
    try {
      res = await chrome.runtime.sendMessage({ type: 'ai.resolve', payload: { fields, job: site.jobContext() } } satisfies Msg);
    } catch (e) {
      res = { ok: false, error: String(e) };
    }
    if (!res.ok) {
      toolbar.setStatus(`Claude no respondió: ${res.error.slice(0, 80)}`);
      for (const { h } of items) {
        const d: Decision = { status: 'missing', source: 'none', note: 'Claude no disponible; completalo vos.' };
        decisions.set(h.primary, d);
        mark(h, d);
      }
      recount();
      return;
    }
    const byKey = new Map(res.answers.map((a) => [a.key, a]));
    for (const { h } of items) {
      const a = byKey.get(h.info.key);
      let d: Decision;
      if (!a || a.answer == null) {
        d = { status: 'missing', source: 'claude', note: `Claude no tiene el dato${a?.reason ? `: ${a.reason}` : ''}` };
      } else {
        const ad = adapt(h.info, a.answer, ctx);
        d = ad
          ? { status: 'inferred', fill: ad.fill, source: 'claude', note: `Claude: ${a.reason || 'respuesta propuesta'}` }
          : { status: 'missing', source: 'claude', note: `Claude propuso "${String(a.answer).slice(0, 60)}" pero no encaja con las opciones.` };
      }
      await apply(h, d);
    }
    toolbar.setStatus('Listo. Revisá lo amarillo; el envío lo hacés vos.');
    recount();
  }

  // ───── ciclo: detecta el formulario / cada paso nuevo ─────
  let running = false;
  let again = false;
  let hadRoots = false;
  async function run(manual = false) {
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      if (!chrome.runtime?.id) {
        // La extensión se actualizó y este script quedó viejo: pedir recarga y no hacer nada más.
        toolbar.show();
        toolbar.setStatus('Apply Assistant se actualizó: recargá la página (F5).');
        return;
      }
      const roots = site.findRoots();
      if (roots.length !== (hadRoots ? 1 : 0)) log(roots.length ? `formulario detectado (${roots.length})` : 'sin formulario abierto');
      hadRoots = roots.length > 0;

      if (roots.length) toolbar.show();
      else if (alwaysVisible) {
        toolbar.setCounts({ exact: 0, inferred: 0, missing: 0 });
        toolbar.setStatus(manual ? 'No detecto ningún formulario abierto. Mandale captura a Claude.' : 'Esperando un formulario de postulación…');
      } else toolbar.hide();

      for (const r of roots) {
        const fresh = scanFields(r).some((h) => !processed.has(h.primary));
        if (manual || (settings.autoFill && fresh)) await fillRoot(r, manual);
      }
    } catch (e) {
      log('error', e);
      toolbar.setStatus(`Error: ${String(e).slice(0, 90)}`);
    } finally {
      running = false;
      if (again) {
        again = false;
        void run(false);
      }
    }
  }

  // MutationObserver no ve cambios dentro de shadow DOM: además escaneamos cada 1,5 s.
  let timer: number | undefined;
  new MutationObserver(() => {
    clearTimeout(timer);
    timer = window.setTimeout(() => void run(false), 350);
  }).observe(document.body, { childList: true, subtree: true });
  window.setInterval(() => void run(false), 1500);
  void run(false);

  chrome.runtime.onMessage.addListener((msg: Msg) => {
    if (msg.type === 'fill') void run(true);
  });

  // ───── aprendizaje: solo de TUS cambios (eventos isTrusted) ─────
  function handleFor(target: EventTarget | null): FieldHandle | null {
    if (!(target instanceof HTMLElement)) return null;
    for (const root of site.findRoots()) {
      if (!root.contains(target)) continue;
      return scanFields(root).find((h) => h.inputs.includes(target)) ?? null;
    }
    return null;
  }

  async function learn(h: FieldHandle) {
    if (!h.info.label || h.info.kind === 'file') return;
    const answer = readAnswer(h);
    if (answer == null) return;
    await upsertBankEntry({ question: h.info.label, kind: h.info.kind, options: h.info.options, answer });
    log('aprendido:', h.info.label, '→', answer);
  }

  function onChange(ev: Event) {
    if (!ev.isTrusted) return;
    const h = handleFor(ev.composedPath()[0] ?? ev.target);
    if (!h) return;
    const prev = decisions.get(h.primary);
    unmark(h);
    decisions.set(h.primary, { status: 'exact', source: 'none', note: 'Respondido por vos' });
    recount();
    // Los datos del perfil no se aprenden desde el formulario (el perfil manda).
    if (prev?.source === 'profile' || prev?.status === 'skip') return;
    void learn(h);
  }

  // Al avanzar de paso, lo amarillo que dejaste tal cual cuenta como aceptado.
  function onClick(ev: Event) {
    if (!ev.isTrusted || !isNavButton((ev.composedPath()[0] ?? ev.target) as Element)) return;
    for (const root of site.findRoots()) {
      for (const h of scanFields(root)) {
        const d = decisions.get(h.primary);
        if (d?.status === 'inferred' && (d.source === 'bank' || d.source === 'claude')) void learn(h);
      }
    }
  }

  // "change" no cruza la frontera del shadow DOM: escuchamos en cada raíz.
  const listened = new WeakSet<Document | ShadowRoot>();
  function listenOn(r: Document | ShadowRoot) {
    if (listened.has(r)) return;
    listened.add(r);
    const fromHere = (ev: Event) => r === document ? ev.composedPath()[0] === ev.target : true; // evita doble manejo
    r.addEventListener('change', (ev) => fromHere(ev) && onChange(ev), true);
    r.addEventListener('click', (ev) => fromHere(ev) && onClick(ev), true);
  }
  listenOn(document);
}
