// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import { decide } from '../src/engine/decide';
import { DEFAULT_PROFILE } from '../src/shared/defaults';
import { scanFields, readAnswer } from '../src/content/dom-fields';
import { applyFill } from '../src/content/fill';

beforeAll(() => {
  (globalThis as any).CSS ??= { escape: (s: string) => s.replace(/["\\]/g, '\\$&') };
  // jsdom no hace layout: simulamos que todo es visible
  Element.prototype.getClientRects = function () { return [{}] as unknown as DOMRectList; };
});

const HTML = `
<div role="dialog">
  <label for="fn"><span>First name</span><span class="sr">First name</span></label>
  <input id="fn" type="text" required>
  <label for="yrs">How many years of work experience do you have with React?How many years of work experience do you have with React?</label>
  <input id="yrs" type="text">
  <label for="eng">What is your level of proficiency in English?</label>
  <select id="eng"><option value="">Select an option</option><option value="a">Conversational</option><option value="b">Professional</option></select>
  <fieldset><legend><span>Are you willing to relocate?</span></legend>
    <input type="radio" name="rel" id="r1" value="Yes"><label for="r1">Yes</label>
    <input type="radio" name="rel" id="r2" value="No"><label for="r2">No</label>
  </fieldset>
  <button>Next</button>
</div>`;

describe('DOM: lectura y escritura', () => {
  it('lee etiquetas (deduplicadas), completa y relee', async () => {
    document.body.innerHTML = HTML;
    const root = document.querySelector<HTMLElement>('[role=dialog]')!;
    const handles = scanFields(root);
    expect(handles.map((h) => [h.info.kind, h.info.label])).toEqual([
      ['text', 'First name'],
      ['text', 'How many years of work experience do you have with React?'],
      ['select', 'What is your level of proficiency in English?'],
      ['radio', 'Are you willing to relocate?'],
    ]);
    const profile = { ...DEFAULT_PROFILE, firstName: 'José', englishLevel: 'advanced' as const, techYears: { React: 4 }, willingToRelocate: false };
    const ctx = { profile, bank: [], claudeEnabled: false, hasCv: false };
    for (const h of handles) {
      const d = decide(h.info, ctx);
      if (d.fill) await applyFill(h, d.fill, async () => null);
    }
    expect((document.getElementById('fn') as HTMLInputElement).value).toBe('José');
    expect((document.getElementById('yrs') as HTMLInputElement).value).toBe('4');
    expect(readAnswer(handles[2])).toBe('Professional');
    expect(readAnswer(handles[3])).toBe('No');
  });
});

describe('DOM dentro de shadow root', () => {
  it('encuentra el modal y lee etiquetas dentro del shadow DOM', async () => {
    document.body.innerHTML = '<div id="interop-outlet"></div>';
    const host = document.getElementById('interop-outlet')!;
    const sr = host.attachShadow({ mode: 'open' });
    sr.innerHTML = `<div role="dialog"><label for="hl">Headline</label><input id="hl" type="text">
      <label for="sm">Summary</label><textarea id="sm"></textarea><button aria-label="Continuar al siguiente paso">Siguiente</button></div>`;
    const { deepQueryAll } = await import('../src/content/deep');
    const dialogs = deepQueryAll<HTMLElement>('[role="dialog"]');
    expect(dialogs).toHaveLength(1);
    const hs = scanFields(dialogs[0]);
    expect(hs.map((h) => h.info.label)).toEqual(['Headline', 'Summary']);
    const profile = { ...DEFAULT_PROFILE, currentTitle: 'Arquitecto de Software Junior' };
    const d = decide(hs[0].info, { profile, bank: [], claudeEnabled: false, hasCv: false });
    await applyFill(hs[0], d.fill!, async () => null);
    expect((sr.getElementById('hl') as HTMLInputElement).value).toBe('Arquitecto de Software Junior');
  });
});
