// LinkedIn renderiza partes de la UI (incluido el modal de Easy Apply) dentro de
// shadow DOM. document.querySelectorAll no entra ahí, así que recorremos las raíces.

type Root = Document | ShadowRoot;

function shadowOf(el: Element): ShadowRoot | null {
  if (el.shadowRoot) return el.shadowRoot;
  // En content scripts, chrome.dom permite abrir también shadow roots "closed".
  const dom = (typeof chrome !== 'undefined' ? (chrome as unknown as { dom?: { openOrClosedShadowRoot?: (e: Element) => ShadowRoot | null } }).dom : undefined);
  try {
    return dom?.openOrClosedShadowRoot?.(el) ?? null;
  } catch {
    return null;
  }
}

/** Todas las shadow roots bajo `root`, recursivamente. */
export function shadowRoots(root: Root = document): ShadowRoot[] {
  const out: ShadowRoot[] = [];
  const walk = (node: Root) => {
    for (const el of Array.from(node.querySelectorAll('*'))) {
      if ((el as HTMLElement).dataset?.aaToolbar) continue; // nuestra propia barrita
      const sr = shadowOf(el);
      if (sr) {
        out.push(sr);
        walk(sr);
      }
    }
  };
  walk(root);
  return out;
}

export function allRoots(): Root[] {
  return [document, ...shadowRoots()];
}

export function deepQueryAll<T extends Element>(selector: string): T[] {
  return allRoots().flatMap((r) => Array.from(r.querySelectorAll<T>(selector)));
}

/** Raíz (document o shadow root) donde vive un elemento. */
export function rootOf(el: Node): Root {
  const r = el.getRootNode();
  return r instanceof ShadowRoot ? r : (el.ownerDocument ?? document);
}
