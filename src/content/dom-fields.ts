import { isPlaceholder } from '../engine/options';
import { detectLang } from '../shared/normalize';
import type { FieldInfo, FieldKind } from '../shared/types';
import { rootOf } from './deep';

// Lectura de campos apoyada en semántica (label for, aria-*, fieldset/legend, roles),
// no en clases CSS: LinkedIn las cambia seguido.

export interface FieldHandle {
  info: FieldInfo;
  primary: HTMLElement; // elemento que identifica al campo (para no procesarlo dos veces)
  inputs: HTMLElement[]; // radios/checkboxes del grupo o [primary]
  anchor: HTMLElement; // donde se pinta el semáforo
}

const SKIP_TYPES = new Set(['hidden', 'submit', 'button', 'reset', 'image', 'search', 'password']);

const clean = (s: string | null | undefined) =>
  dedupe(
    (s ?? '')
      .replace(/\s+/g, ' ')
      .replace(/\b(required|obligatorio|opcional|optional)\b/gi, '')
      .replace(/[*✱]/g, '')
      .trim(),
  );

/** LinkedIn duplica el texto (span visible + span para lectores de pantalla): "XX" → "X". */
export function dedupe(t: string): string {
  const n = t.length;
  for (let cut = Math.floor(n / 2) - 2; cut <= Math.ceil(n / 2) + 2; cut++) {
    if (cut <= 0 || cut >= n) continue;
    const a = t.slice(0, cut).trim();
    const b = t.slice(cut).trim();
    if (a && a === b) return a;
  }
  return t.trim();
}

function textOf(el: Element | null): string {
  if (!el) return '';
  return clean((el as HTMLElement).innerText || el.textContent);
}

function byIds(from: Node, ids: string | null): string {
  if (!ids) return '';
  const r = rootOf(from);
  return ids
    .split(/\s+/)
    .map((id) => textOf(r.getElementById(id)))
    .filter(Boolean)
    .join(' ');
}

export function labelOf(el: HTMLElement): string {
  const labelled = byIds(el, el.getAttribute('aria-labelledby'));
  if (labelled) return labelled;
  if (el.id) {
    const l = rootOf(el).querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (l && textOf(l)) return textOf(l);
  }
  const wrap = el.closest('label');
  if (wrap && textOf(wrap)) return textOf(wrap);
  const aria = clean(el.getAttribute('aria-label'));
  if (aria) return aria;
  const ph = clean(el.getAttribute('placeholder'));
  if (ph) return ph;
  return clean(el.getAttribute('name')?.replace(/[_\-[\]]+/g, ' '));
}

/** Etiqueta de un grupo de radios/checkboxes: legend, o el label del radiogroup. */
function groupLabel(first: HTMLElement): { label: string; anchor: HTMLElement } {
  const fs = first.closest('fieldset');
  if (fs) {
    const legend = fs.querySelector('legend');
    if (legend && textOf(legend)) return { label: textOf(legend), anchor: fs as HTMLElement };
  }
  const rg = first.closest('[role="radiogroup"], [role="group"]') as HTMLElement | null;
  if (rg) {
    const l = byIds(rg, rg.getAttribute('aria-labelledby')) || clean(rg.getAttribute('aria-label'));
    if (l) return { label: l, anchor: rg };
  }
  const anchor = (fs as HTMLElement | null) ?? first.parentElement?.parentElement ?? first;
  // Último recurso: el texto previo más cercano dentro del contenedor.
  const prev = anchor.previousElementSibling;
  return { label: textOf(prev), anchor };
}

function isVisible(el: HTMLElement): boolean {
  if (el instanceof HTMLInputElement && el.type === 'file') return true; // suelen estar ocultos tras un botón
  if (el instanceof HTMLInputElement && (el.type === 'radio' || el.type === 'checkbox')) {
    // muchos diseños ocultan el input nativo y muestran el label
    const lbl = el.id ? rootOf(el).querySelector(`label[for="${CSS.escape(el.id)}"]`) : el.closest('label');
    return !!(lbl ?? el).getClientRects().length;
  }
  return el.getClientRects().length > 0;
}

function kindOf(el: HTMLElement): FieldKind | null {
  if (el instanceof HTMLTextAreaElement) return 'textarea';
  if (el instanceof HTMLSelectElement) return 'select';
  if (!(el instanceof HTMLInputElement)) return null;
  const t = el.type.toLowerCase();
  if (SKIP_TYPES.has(t)) return null;
  if (t === 'radio') return 'radio';
  if (t === 'checkbox') return 'checkbox';
  if (t === 'file') return 'file';
  if (t === 'email' || t === 'tel' || t === 'url' || t === 'number' || t === 'date') return t;
  if (el.getAttribute('role') === 'combobox' || el.getAttribute('aria-autocomplete') === 'list') return 'combobox';
  return 'text';
}

const keys = new WeakMap<HTMLElement, string>();
let seq = 0;
function keyOf(el: HTMLElement): string {
  let k = keys.get(el);
  if (!k) {
    k = `f${++seq}`;
    keys.set(el, k);
  }
  return k;
}

function optionLabel(input: HTMLElement): string {
  return labelOf(input) || clean((input as HTMLInputElement).value);
}

export function scanFields(root: HTMLElement): FieldHandle[] {
  const out: FieldHandle[] = [];
  const grouped = new Set<HTMLElement>();
  const els = Array.from(root.querySelectorAll<HTMLElement>('input, textarea, select'));

  for (const el of els) {
    if (grouped.has(el)) continue;
    const kind = kindOf(el);
    if (!kind) continue;
    if ((el as HTMLInputElement).disabled || (el as HTMLInputElement).readOnly) continue;
    if (!isVisible(el)) continue;

    if (kind === 'radio' || kind === 'checkbox') {
      const input = el as HTMLInputElement;
      const scope = (input.closest('fieldset') as HTMLElement | null) ?? root;
      const group =
        kind === 'radio' && input.name
          ? Array.from(scope.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${CSS.escape(input.name)}"]`))
          : kind === 'checkbox' && input.closest('fieldset')
            ? Array.from(scope.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'))
            : [input];
      group.forEach((g) => grouped.add(g));

      if (kind === 'checkbox' && group.length === 1) {
        const label = labelOf(input);
        out.push({
          primary: input,
          inputs: [input],
          anchor: (input.closest('label') as HTMLElement | null) ?? input.parentElement ?? input,
          info: base(input, 'checkbox', label, undefined, input.checked),
        });
        continue;
      }
      const { label, anchor } = groupLabel(group[0]);
      out.push({
        primary: group[0],
        inputs: group,
        anchor,
        info: base(
          group[0],
          kind === 'radio' ? 'radio' : 'checkboxGroup',
          label,
          group.map(optionLabel),
          group.some((g) => g.checked),
          group.some((g) => g.required) || anchor.getAttribute('aria-required') === 'true',
        ),
      });
      continue;
    }

    const label = labelOf(el);
    let options: string[] | undefined;
    let hasValue: boolean;
    if (el instanceof HTMLSelectElement) {
      options = Array.from(el.options).map((o) => o.text.trim());
      const sel = el.selectedIndex >= 0 ? el.options[el.selectedIndex] : null;
      hasValue = !!sel && sel.value !== '' && !isPlaceholder(sel.text);
    } else if (el instanceof HTMLInputElement && el.type === 'file') {
      hasValue = !!el.files?.length;
    } else {
      hasValue = !!(el as HTMLInputElement).value?.trim();
    }
    out.push({
      primary: el,
      inputs: [el],
      anchor: kind === 'file' ? (el.parentElement ?? el) : el,
      info: base(el, kind, label, options, hasValue),
    });
  }
  return out;
}

function base(
  el: HTMLElement,
  kind: FieldKind,
  label: string,
  options: string[] | undefined,
  hasValue: boolean,
  required?: boolean,
): FieldInfo {
  return {
    key: keyOf(el),
    kind,
    label,
    options,
    hasValue,
    required: required ?? ((el as HTMLInputElement).required || el.getAttribute('aria-required') === 'true'),
    lang: detectLang(label),
  };
}

/** Lo que el usuario dejó en el campo, en forma "guardable" en el banco. */
export function readAnswer(h: FieldHandle): string | string[] | null {
  const el = h.primary;
  switch (h.info.kind) {
    case 'radio': {
      const i = (h.inputs as HTMLInputElement[]).findIndex((x) => x.checked);
      return i >= 0 ? h.info.options?.[i] ?? null : null;
    }
    case 'checkboxGroup': {
      const sel = (h.inputs as HTMLInputElement[])
        .map((x, i) => (x.checked ? h.info.options?.[i] : null))
        .filter((x): x is string => !!x);
      return sel.length ? sel : null;
    }
    case 'checkbox':
      return (el as HTMLInputElement).checked ? 'true' : 'false';
    case 'select': {
      const s = el as HTMLSelectElement;
      const o = s.options[s.selectedIndex];
      return o && !isPlaceholder(o.text) ? o.text.trim() : null;
    }
    case 'file':
      return null;
    default: {
      const v = (el as HTMLInputElement).value?.trim();
      return v || null;
    }
  }
}
