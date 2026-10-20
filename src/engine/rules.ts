import { normalize } from '../shared/normalize';
import type { Currency, EnglishLevel, FieldInfo, Period, Profile, WorkMode } from '../shared/types';
import { matchBoolean } from './options';

export type Answer = string | number | boolean | string[] | { file: true };

export type RuleResult =
  | { kind: 'value'; value: Answer; exact: boolean; note: string; synonyms?: string[] }
  | { kind: 'missing'; note: string }
  | { kind: 'skip'; note: string };

export interface Rule {
  id: string;
  test: (n: string, f: FieldInfo) => boolean;
  resolve: (f: FieldInfo, p: Profile, n: string) => RuleResult;
}

const val = (value: Answer, note: string, exact = true, synonyms?: string[]): RuleResult => ({
  kind: 'value', value, exact, note, synonyms,
});
const need = (note: string): RuleResult => ({ kind: 'missing', note });
const str = (v: string, note: string, exact = true) => (v.trim() ? val(v.trim(), note, exact) : need(`Falta en el perfil: ${note}`));

export function isYesNoField(f: FieldInfo): boolean {
  if (f.kind === 'checkbox') return true;
  if (!f.options || (f.kind !== 'radio' && f.kind !== 'select')) return false;
  return !!matchBoolean(f.options, true) && !!matchBoolean(f.options, false);
}

const isTextual = (f: FieldInfo) => ['text', 'combobox', 'select', 'email', 'tel', 'url'].includes(f.kind);

// ───────────────────── inglés ─────────────────────

const ENGLISH_ORDER: EnglishLevel[] = ['basic', 'intermediate', 'advanced', 'fluent', 'native'];
/** [en, es] son los nombres "propios" (coincidencia exacta); el resto, sinónimos (amarillo). */
export const ENGLISH_LABELS: Record<Exclude<EnglishLevel, ''>, string[]> = {
  basic: ['Basic', 'Básico', 'elementary', 'elemental', 'beginner', 'principiante', 'a1', 'a2', 'elementary proficiency'],
  intermediate: ['Intermediate', 'Intermedio', 'conversational', 'conversacional', 'b1', 'b2', 'limited working proficiency'],
  advanced: ['Advanced', 'Avanzado', 'professional working proficiency', 'professional', 'profesional', 'c1', 'upper intermediate'],
  fluent: ['Fluent', 'Fluido', 'full professional proficiency', 'c2', 'proficient'],
  native: ['Native', 'Nativo', 'native or bilingual proficiency', 'native or bilingual', 'bilingual', 'bilingüe'],
};

// ───────────────────── años de experiencia ─────────────────────

const TECH_ALIASES: Record<string, string[]> = {
  typescript: ['ts'],
  javascript: ['js', 'ecmascript'],
  kubernetes: ['k8s'],
  postgresql: ['postgres'],
  'node js': ['node', 'nodejs'],
  'react js': ['react', 'reactjs'],
  'next js': ['next', 'nextjs'],
  'vue js': ['vue', 'vuejs'],
  'amazon web services': ['aws'],
};

function techVariants(key: string): string[] {
  const base = normalize(key);
  const v = new Set<string>([base, base.replace(/ /g, '')]);
  if (base.endsWith(' js')) v.add(base.slice(0, -3));
  else v.add(`${base} js`);
  for (const [canon, aliases] of Object.entries(TECH_ALIASES)) {
    const group = [canon, ...aliases];
    if (group.some((g) => v.has(g))) group.forEach((g) => v.add(g));
  }
  return [...v].filter(Boolean);
}

const wordIn = (needle: string, hay: string) =>
  new RegExp(`(^| )${needle.replace(/[+#.]/g, '\\$&')}( |$)`).test(hay);

/** Devuelve las tecnologías del perfil mencionadas en la etiqueta (la más específica gana: "React Native" > "React"). */
export function findTechs(n: string, techYears: Record<string, number>): { key: string; hit: string }[] {
  const found: { key: string; hit: string }[] = [];
  for (const key of Object.keys(techYears)) {
    const hit = techVariants(key)
      .filter((v) => wordIn(v, n))
      .sort((a, b) => b.length - a.length)[0];
    if (hit) found.push({ key, hit });
  }
  return found.filter((a) => !found.some((b) => b !== a && b.hit.length > a.hit.length && wordIn(a.hit, b.hit)));
}

const GENERIC_EXP = new Set(
  ('year years ano anos experience experiencia work working trabajo laboral professional profesional total overall ' +
    'much many tenes tienes have do you how cuantos cuantas de of with con en in the la el your tu tus sus ' +
    'en total do you have tiene posee cuenta at least al menos minimum minimo').split(' '),
);
const RELATED_EXP = new Set(
  ('software development desarrollo developer desarrollador programming programacion engineering ingenieria ' +
    'it tech tecnologia industry industria field rubro relevant relevante similar role rol position puesto sector web full stack fullstack').split(' '),
);

// ───────────────────── salario ─────────────────────

function currencyIn(n: string): Currency | null {
  if (/(usd|us\$|u\$s|dolar|dolares|dollar|dollars)/.test(n)) return 'USD';
  if (/(ars|pesos|peso argentino)/.test(n)) return 'ARS';
  if (/(eur|euro|euros)/.test(n)) return 'EUR';
  return null;
}
function periodIn(n: string): Period | null {
  if (/(annual|anual|yearly|per year|por ano|al ano|a year|per annum|bruto anual)/.test(n)) return 'year';
  if (/(monthly|mensual|per month|por mes|al mes|a month)/.test(n)) return 'month';
  if (/(hourly|per hour|por hora|hour rate)/.test(n)) return 'hour';
  return null;
}

// ───────────────────── modalidad ─────────────────────

function modeIn(n: string): WorkMode | null {
  if (/(hybrid|hibrid)/.test(n)) return 'hybrid';
  if (/(remote|remoto|remota|home office|desde (tu )?casa)/.test(n)) return 'remote';
  if (/(on ?site|presencial|in office|in person|en la oficina|commut|a la oficina|from (the|our) office)/.test(n)) return 'onsite';
  return null;
}
const MODE_LABELS: Record<WorkMode, string[]> = {
  remote: ['Remote', 'Remoto', 'remota', 'home office', 'fully remote', '100% remoto'],
  hybrid: ['Hybrid', 'Híbrido', 'hibrida', 'mixto'],
  onsite: ['On-site', 'Presencial', 'onsite', 'in office', 'en oficina'],
};

/** Formato internacional. Celulares argentinos llevan un 9 después del +54: +54 9 11 6690-6281. */
export function internationalPhone(p: Profile): string {
  const cc = p.phoneCountryCode.trim();
  let num = p.phone.replace(/\D/g, '');
  if (cc === '+54' && !num.startsWith('9')) num = `9${num}`;
  return `${cc} ${num}`;
}

const yesNoText =(b: boolean, f: FieldInfo) => (f.lang === 'en' ? (b ? 'Yes' : 'No') : b ? 'Sí' : 'No');

// ───────────────────── reglas (el orden importa) ─────────────────────

export const RULES: Rule[] = [
  {
    id: 'consent',
    test: (n, f) =>
      /(i agree|acepto (los|las|el|la)|privacy policy|politica de privacidad|terms (and|&) conditions|terminos y condiciones)/.test(n) ||
      ((f.kind === 'checkbox' || f.kind === 'checkboxGroup') &&
        /(acepto|terminos|terms|privacy|privacidad|consent|consentimiento|follow .*(compan|page)|stay up to date|seguir a|keep me (updated|informed)|mantenerme informad|newsletter|marketing|job alert)/.test(n)),
    resolve: () => ({ kind: 'skip', note: 'Consentimientos y suscripciones los decidís vos.' }),
  },
  {
    id: 'eeo',
    test: (n) =>
      /(gender|genero|race|raza|ethnic|etnia|veteran|veterano|disabilit|discapacidad|pronoun|pronombre|sexual orientation|orientacion sexual|hispanic|latino)/.test(n),
    resolve: () => need('Pregunta demográfica/voluntaria: la respondés vos.'),
  },
  {
    id: 'headline',
    test: (n, f) => f.kind !== 'file' && /^(headline|titular|titular profesional|professional headline)$/.test(n),
    resolve: (_f, p) => str(p.headline || p.currentTitle, 'titular (headline)'),
  },
  {
    id: 'summary',
    test: (n, f) =>
      (f.kind === 'textarea' || f.kind === 'text') &&
      /^(summary|professional summary|resumen|resumen profesional|about( me| you)?|acerca de( mi| ti)?|sobre mi|perfil profesional|extracto)$/.test(n),
    resolve: (_f, p) => (p.summary.trim() ? val(p.summary.trim(), 'Resumen del perfil') : need('Falta el resumen en el perfil.')),
  },
  {
    id: 'coverLetter',
    test: (n, f) => f.kind !== 'file' && /(cover letter|carta de presentacion|motivation letter|carta de motivacion)/.test(n),
    resolve: (_f, p) =>
      p.coverLetter.trim()
        ? val(p.coverLetter.trim(), 'Carta genérica: adaptala a esta oferta', false)
        : need('Falta la carta de presentación en el perfil.'),
  },
  {
    id: 'cv',
    test: (n, f) => f.kind === 'file',
    resolve: (_f, _p, n) =>
      /(cover|carta|motivation|portfolio|portafolio|transcript)/.test(n)
        ? { kind: 'skip', note: 'Adjunto que no es el CV.' }
        : val({ file: true }, 'CV del perfil'),
  },
  {
    id: 'fullName',
    test: (n) => /^(full name|nombre completo|name|nombre y apellidos?|your name|legal name|full legal name)$/.test(n),
    resolve: (_f, p) => str(`${p.firstName} ${p.lastName}`, 'nombre completo'),
  },
  {
    id: 'firstName',
    test: (n) => /(first name|given name|primer nombre|legal first name)/.test(n) || /^nombres?( s)?$/.test(n),
    resolve: (_f, p) => str(p.firstName, 'nombre'),
  },
  {
    id: 'lastName',
    test: (n) => /(last name|surname|family name|apellido)/.test(n),
    resolve: (_f, p) => str(p.lastName, 'apellido'),
  },
  {
    id: 'email',
    test: (n) => /(^| )(e ?mail|correo)( |$)/.test(n),
    resolve: (_f, p) => str(p.email, 'email'),
  },
  {
    id: 'phoneCountry',
    test: (n) => /(country code|codigo (de|del) pais|prefijo|phone country)/.test(n),
    resolve: (f, p) =>
      f.options
        ? p.country ? val(p.country, 'País del teléfono', true, [p.phoneCountryCode]) : need('Falta el país')
        : str(p.phoneCountryCode, 'código de país'),
  },
  {
    id: 'phone',
    test: (n) => /(phone|telefono|celular|movil|mobile|whatsapp)/.test(n),
    resolve: (_f, p, n) =>
      /(international|internacional|incl.* country|con codigo)/.test(n)
        ? str(p.phone ? internationalPhone(p) : '', 'teléfono')
        : str(p.phone, 'teléfono'),
  },
  { id: 'linkedin', test: (n) => /linkedin/.test(n), resolve: (_f, p) => str(p.linkedinUrl, 'URL de LinkedIn') },
  { id: 'github', test: (n) => /github/.test(n), resolve: (_f, p) => str(p.githubUrl, 'URL de GitHub') },
  {
    id: 'portfolio',
    test: (n) => /(portfolio|portafolio|website|sitio web|pagina web|personal site|web personal|blog)/.test(n),
    resolve: (_f, p) =>
      p.portfolioUrl.trim()
        ? val(p.portfolioUrl.trim(), 'Portfolio')
        : p.githubUrl.trim()
          ? val(p.githubUrl.trim(), 'No tenés portfolio cargado: puse tu GitHub', false)
          : need('Falta portfolio / web en el perfil.'),
  },
  {
    id: 'salary',
    test: (n) =>
      /(salary|salario|sueldo|remuneracion|pretension|compensation|expectativa salarial|expected pay|pay expectation|hourly rate|tarifa|honorarios|expected (monthly|annual)? ?(income|rate))/.test(n),
    resolve: (f, p, n) => {
      if (!p.salary.length) return need('Falta la pretensión salarial en el perfil.');
      const cur = currencyIn(n);
      const candidates = cur ? p.salary.filter((s) => s.currency === cur) : p.salary;
      if (!candidates.length) return need(`No tenés pretensión cargada en ${cur}.`);
      const s = candidates[0];
      let exact = !!cur || p.salary.length === 1;
      let amount = s.amount;
      const per = periodIn(n);
      let note = `${s.currency} ${s.amount}/${s.period}`;
      if (per && per !== s.period) {
        if (per === 'year' && s.period === 'month') amount = s.amount * 12;
        else if (per === 'month' && s.period === 'year') amount = Math.round(s.amount / 12);
        else return need(`Piden el monto por ${per} y lo tenés por ${s.period}.`);
        exact = false;
        note += ` → convertido a ${per} (${amount})`;
      }
      return f.kind === 'number' || f.options ? val(amount, note, exact) : val(String(amount), note, exact);
    },
  },
  {
    id: 'english',
    test: (n) => /(english|ingles)/.test(n),
    resolve: (f, p) => {
      if (!p.englishLevel) return need('Falta el nivel de inglés.');
      const idx = ENGLISH_ORDER.indexOf(p.englishLevel);
      if (isYesNoField(f)) {
        if (idx >= 2) return val(true, `Inglés ${p.englishLevel}`, false);
        if (idx === 0) return val(false, `Inglés ${p.englishLevel}`, false);
        return need('Pregunta de sí/no sobre inglés con nivel intermedio: decidí vos.');
      }
      const labels = ENGLISH_LABELS[p.englishLevel];
      const main = f.lang === 'en' ? labels[0] : labels[1];
      return val(main, `Inglés ${p.englishLevel}`, true, labels);
    },
  },
  {
    id: 'yearsExperience',
    test: (n) =>
      !/(18|mayor de edad|\bage\b|edad)/.test(n) &&
      (/(how many years|cuantos anos|cuantos anios)/.test(n) ||
        (/(year|anos|ano)/.test(n) && /(experience|experiencia)/.test(n))),
    resolve: (f, p, n) => {
      const techs = findTechs(n, p.techYears);
      let years: number | null = null;
      let exact = true;
      let note = '';
      if (techs.length) {
        years = Math.min(...techs.map((t) => p.techYears[t.key]));
        exact = techs.length === 1;
        note = techs.map((t) => `${t.key}: ${p.techYears[t.key]}`).join(', ');
      } else {
        const rest = normalize(n).split(' ').filter((w) => w && !GENERIC_EXP.has(w) && !/^\d+\+?$/.test(w));
        const unknown = rest.filter((w) => !RELATED_EXP.has(w));
        if (unknown.length) return need(`No tenés años cargados para: "${unknown.join(' ')}". Agregalo en Tecnologías.`);
        if (p.totalYears == null) return need('Falta años totales de experiencia.');
        years = p.totalYears;
        exact = rest.length === 0;
        note = `Experiencia total: ${years}`;
      }
      if (isYesNoField(f)) {
        const m = n.match(/(\d+)\s*\+?\s*(years?|anos?)/) ?? n.match(/(?:at least|al menos|minimo|minimum|mas de|more than)\s*(\d+)/);
        if (!m) return need('Pregunta sí/no de experiencia sin cantidad clara.');
        const req = Number(m[1]);
        return val(years >= req, `${note} (piden ${req})`, exact);
      }
      return val(years, note, exact);
    },
  },
  {
    id: 'relocation',
    test: (n) => /(relocat|reubic|mudar|mudarte|traslad)/.test(n),
    resolve: (_f, p) =>
      p.willingToRelocate == null ? need('Falta si aceptás relocación.') : val(p.willingToRelocate, 'Relocación'),
  },
  {
    id: 'sponsorship',
    test: (n) => /(sponsor|visa|patrocinio)/.test(n),
    resolve: (_f, p) =>
      p.requiresSponsorship == null ? need('Falta si necesitás sponsoreo de visa.') : val(p.requiresSponsorship, 'Sponsoreo de visa'),
  },
  {
    id: 'workAuth',
    test: (n) =>
      /(authori[sz]ed to work|autorizad[oa] .*trabajar|legally (able|eligible|authori)|eligible to work|permiso de trabajo|right to work|derecho a trabajar|work permit)/.test(n),
    resolve: (_f, p, n) => {
      const hit = p.authorizedCountries.find((c) => wordIn(normalize(c), n));
      return hit ? val(true, `Autorizado en ${hit}`) : need('No sé si estás autorizado para trabajar en ese país.');
    },
  },
  {
    id: 'workModeChoice',
    test: (n, f) =>
      !isYesNoField(f) && /(modalidad|work arrangement|work model|workplace type|work setting|preferred (work )?(mode|location type))/.test(n),
    resolve: (f, p) => {
      if (!p.workModes.length) return need('Faltan las modalidades aceptadas.');
      const m = p.workModes[0];
      const labels = MODE_LABELS[m];
      return val(f.lang === 'en' ? labels[0] : labels[1], `Modalidad preferida: ${m}`, true, labels);
    },
  },
  {
    id: 'workModeYesNo',
    test: (n, f) => isYesNoField(f) && !!modeIn(n),
    resolve: (_f, p, n) => {
      if (!p.workModes.length) return need('Faltan las modalidades aceptadas.');
      const mode = modeIn(n)!;
      const commute = /commut|viajar|traslad/.test(n);
      const ok = commute ? p.workModes.includes('onsite') || p.workModes.includes('hybrid') : p.workModes.includes(mode);
      return val(ok, `Modalidades: ${p.workModes.join(', ')}`, !commute);
    },
  },
  {
    id: 'notice',
    test: (n) =>
      !/(horari|timezone|time zone|zona horaria|viajar|travel|guardia|on call|weekend|fin de semana|turno|shift|overtime)/.test(n) &&
      /(notice period|preaviso|disponibilidad|availability|when can you start|cuando (podes|podrias|puedes) (empezar|comenzar|incorporarte)|start date|fecha de (inicio|incorporacion)|incorporacion|earliest start)/.test(n),
    resolve: (f, p, n) => {
      if (f.kind === 'date') return need('Piden una fecha concreta de inicio.');
      if (f.kind === 'number') {
        if (p.noticeDays == null) return need('Falta el preaviso en días.');
        if (/(week|semana)/.test(n)) return val(Math.ceil(p.noticeDays / 7), `${p.noticeDays} días → semanas`, false);
        return val(p.noticeDays, `Preaviso ${p.noticeDays} días`);
      }
      if (!p.noticePeriod) return need('Falta la disponibilidad / preaviso.');
      return val(p.noticePeriod, 'Disponibilidad', !f.options);
    },
  },
  {
    id: 'country',
    test: (n, f) => isTextual(f) && /^(country|pais|country of residence|pais de residencia|country region)$/.test(n),
    resolve: (_f, p) => str(p.country, 'país'),
  },
  {
    id: 'city',
    test: (n, f) => isTextual(f) && /(^| )(city|ciudad|localidad)( |$)/.test(n),
    resolve: (f, p) => (f.kind === 'combobox' ? str(p.city, 'ciudad (elegí de la lista)', false) : str(p.city, 'ciudad')),
  },
  {
    id: 'location',
    test: (n, f) => isTextual(f) && /(location|ubicacion|where are you (based|located)|donde (vivis|vives|resid)|lugar de residencia|current residence)/.test(n),
    resolve: (f, p) => str(p.location || [p.city, p.country].filter(Boolean).join(', '), 'ubicación', f.kind !== 'combobox'),
  },
  {
    id: 'currentTitle',
    test: (n) => /(current (job )?title|cargo actual|puesto actual|titulo actual|current role|current position)/.test(n),
    resolve: (_f, p) => str(p.currentTitle, 'puesto actual'),
  },
];

export function findRule(f: FieldInfo): { rule: Rule; n: string } | null {
  const n = normalize(f.label);
  if (!n) return null;
  const rule = RULES.find((r) => r.test(n, f));
  return rule ? { rule, n } : null;
}

export { yesNoText };
