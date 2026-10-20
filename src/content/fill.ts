import type { CvFile, FillValue } from '../shared/types';
import type { FieldHandle } from './dom-fields';
import { rootOf } from './deep';

// Escritura compatible con frameworks (React/Ember): setter nativo + eventos.
// Los eventos que disparamos tienen isTrusted=false; así distinguimos
// nuestros cambios de los tuyos para aprender solo de los tuyos.

function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const proto =
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
    : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype
    : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new Event('blur', { bubbles: true }));
}

function clickInput(input: HTMLInputElement) {
  // Clic en el input (o su label si el input está oculto): dispara los handlers del sitio.
  const label = input.id ? rootOf(input).querySelector<HTMLElement>(`label[for="${CSS.escape(input.id)}"]`) : null;
  (input.getClientRects().length ? input : label ?? input).click();
}

function fileFromCv(cv: CvFile): File {
  const bin = atob(cv.base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], cv.name, { type: cv.type || 'application/pdf' });
}

export async function applyFill(h: FieldHandle, fill: FillValue, getCv: () => Promise<CvFile | null>): Promise<boolean> {
  const el = h.primary;
  switch (fill.type) {
    case 'text':
      setNativeValue(el as HTMLInputElement, fill.text);
      return true;
    case 'option': {
      if (el instanceof HTMLSelectElement) {
        const opt = el.options[fill.index];
        if (!opt) return false;
        setNativeValue(el, opt.value);
        return true;
      }
      const input = h.inputs[fill.index] as HTMLInputElement | undefined;
      if (!input) return false;
      if (!input.checked) clickInput(input);
      return true;
    }
    case 'options': {
      (h.inputs as HTMLInputElement[]).forEach((input, i) => {
        if (fill.indexes.includes(i) !== input.checked) clickInput(input);
      });
      return true;
    }
    case 'check': {
      const input = el as HTMLInputElement;
      if (input.checked !== fill.checked) clickInput(input);
      return true;
    }
    case 'file': {
      const cv = await getCv();
      if (!cv) return false;
      const dt = new DataTransfer();
      dt.items.add(fileFromCv(cv));
      const input = el as HTMLInputElement;
      input.files = dt.files;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
  }
}
