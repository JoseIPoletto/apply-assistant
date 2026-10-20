import type { Decision } from '../shared/types';
import type { FieldHandle } from './dom-fields';

// Semáforo: exacto = sin marca; interpretado = amarillo; faltante = rojo punteado.
const ATTR = 'data-aa-conf';

const CSS_TEXT = `
[${ATTR}="inferred"] { outline: 2px solid #e8b600 !important; outline-offset: 2px !important; background-color: #fff6d1 !important; }
[${ATTR}="missing"]  { outline: 2px dashed #d93a3a !important; outline-offset: 2px !important; }
`;

/** Los estilos del document no entran a un shadow DOM: se inyectan en cada raíz. */
export function injectStyles(root: Document | ShadowRoot = document) {
  if (root.querySelector('#aa-styles')) return;
  const s = document.createElement('style');
  s.id = 'aa-styles';
  s.textContent = CSS_TEXT;
  (root instanceof Document ? root.head : root).appendChild(s);
}

export function mark(h: FieldHandle, d: Decision) {
  const a = h.anchor;
  if (d.status === 'inferred' || d.status === 'missing') {
    a.setAttribute(ATTR, d.status);
    a.setAttribute('title', `Micro Gambit: ${d.note}`);
  } else {
    unmark(h);
  }
}

export function unmark(h: FieldHandle) {
  if (!h.anchor.hasAttribute(ATTR)) return;
  h.anchor.removeAttribute(ATTR);
  if (h.anchor.getAttribute('title')?.startsWith('Micro Gambit:')) h.anchor.removeAttribute('title');
}

export function clearAll(root: ParentNode = document) {
  root.querySelectorAll(`[${ATTR}]`).forEach((el) => {
    el.removeAttribute(ATTR);
    if (el.getAttribute('title')?.startsWith('Micro Gambit:')) el.removeAttribute('title');
  });
}
