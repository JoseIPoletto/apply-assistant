import { normalize } from '../shared/normalize';
import type { JobContext } from '../shared/types';
import { deepQueryAll } from './deep';

export interface SiteAdapter {
  id: 'linkedin' | 'greenhouse' | 'lever';
  /** Contenedores con el formulario activo (ej. el modal de Easy Apply). */
  findRoots(): HTMLElement[];
  jobContext(): JobContext;
  uploadCv: (s: { uploadCvOnLinkedIn: boolean; uploadCvExternal: boolean }) => boolean;
}

const txt = (el: Element | null | undefined) => ((el as HTMLElement | null)?.innerText ?? el?.textContent ?? '').trim();

/** Sección cuyo encabezado coincide con alguno de los textos (ej. "About the job"). */
function sectionByHeading(headings: string[]): string {
  const wanted = headings.map(normalize);
  for (const h of Array.from(document.querySelectorAll('h1, h2, h3, [role="heading"]'))) {
    if (wanted.includes(normalize(txt(h)))) {
      const container = h.closest('section, article') ?? h.parentElement;
      return txt(container);
    }
  }
  return '';
}

/** Botones del flujo de postulación (los usamos solo para reconocer el modal). */
const FLOW_BUTTON = /(^| )(siguiente|next|revisar|review|continuar|continue|enviar solicitud|submit application)( |$)/;

const NAV_BUTTON =/^(next|siguiente|continue|continuar|review|revisar|submit application|enviar solicitud|enviar)$/;

const linkedin: SiteAdapter = {
  id: 'linkedin',
  findRoots() {
    // El modal puede estar en el document o dentro de un shadow DOM.
    return deepQueryAll<HTMLElement>('[role="dialog"], [role="alertdialog"], dialog').filter((d, i, all) => {
      if (all.some((x, j) => j !== i && x.contains(d))) return false; // sin modales anidados duplicados
      if (!d.querySelector('input, select, textarea')) return false;
      return Array.from(d.querySelectorAll('button')).some((b) =>
        FLOW_BUTTON.test(normalize(`${b.getAttribute('aria-label') ?? ''} ${txt(b)}`)),
      );
    });
  },
  jobContext() {
    const description =
      sectionByHeading(['About the job', 'Acerca del empleo', 'Acerca del trabajo']) ||
      txt(document.getElementById('job-details'));
    const company = txt(document.querySelector('a[href*="/company/"]:not([href*="/company/setup"])'));
    return { title: txt(document.querySelector('h1')), company, description, url: location.href };
  },
  uploadCv: (s) => s.uploadCvOnLinkedIn,
};

const greenhouse: SiteAdapter = {
  id: 'greenhouse',
  findRoots() {
    const f =
      document.querySelector<HTMLElement>('form#application-form, form#application_form') ??
      Array.from(document.querySelectorAll<HTMLElement>('form')).find((x) => x.querySelector('input[type="file"], input[name*="first_name"]'));
    return f ? [f] : [];
  },
  jobContext() {
    return {
      title: txt(document.querySelector('h1')),
      company: document.title.split(/ at | - /i).pop()?.trim() ?? '',
      description: txt(document.querySelector('#content, [class*="job__description"], main')) || txt(document.body).slice(0, 8000),
      url: location.href,
    };
  },
  uploadCv: (s) => s.uploadCvExternal,
};

const lever: SiteAdapter = {
  id: 'lever',
  findRoots() {
    const f = Array.from(document.querySelectorAll<HTMLElement>('form')).find((x) => x.querySelector('input[name="name"], input[name="email"]'));
    return f ? [f] : [];
  },
  jobContext() {
    return {
      title: txt(document.querySelector('h2, h1')),
      company: document.title.split(' - ')[0]?.trim() ?? '',
      description: txt(document.querySelector('[data-qa="job-description"], .content, main')) || txt(document.body).slice(0, 8000),
      url: location.href,
    };
  },
  uploadCv: (s) => s.uploadCvExternal,
};

export function pickAdapter(host = location.hostname): SiteAdapter | null {
  if (host.endsWith('linkedin.com')) return linkedin;
  if (host.includes('greenhouse.io')) return greenhouse;
  if (host === 'jobs.lever.co') return lever;
  return null;
}

/** ¿El clic fue en un botón de avance del formulario? (solo lo observamos, nunca lo apretamos). */
export function isNavButton(el: Element | null): boolean {
  const b = el?.closest?.('button');
  if (!b) return false;
  const t = normalize(`${b.getAttribute('aria-label') ?? ''} ${txt(b)}`);
  return NAV_BUTTON.test(t) || FLOW_BUTTON.test(t);
}
