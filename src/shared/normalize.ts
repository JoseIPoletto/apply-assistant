/** minúsculas, sin tildes, sin puntuación (conserva + y # para "C++", "C#", "+54"). */
export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9+#]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

const STOPWORDS = new Set(
  (
    // es
    'el la los las un una unos unas de del al a en y o u que con por para su sus tu tus te ' +
    'se es son esta este estas estos lo le les mi mis nos usted ustedes vos tenes tienes tiene ' +
    'cual cuales como cuanto cuantos cuantas cuanta sos eres estas hay ha has ' +
    // en
    'the a an of to in on at for with and or is are do does did you your yours have has had ' +
    'be been being this that these those it its as by from we our us any if can will would ' +
    'please how what which who'
  ).split(' '),
);

// Equivalencias ES→EN para que "años de experiencia" y "years of experience"
// se parezcan sin llamar a Claude. Es deliberadamente chico: lo raro va a Claude.
const CANON: Record<string, string> = {
  ano: 'year', anos: 'year', years: 'year', yrs: 'year', yr: 'year',
  experiencia: 'experience', experienced: 'experience',
  trabajar: 'work', trabajo: 'work', trabajando: 'work', working: 'work', laboral: 'work',
  remoto: 'remote', remota: 'remote', remotely: 'remote',
  hibrido: 'hybrid', hibrida: 'hybrid',
  presencial: 'onsite', oficina: 'office', offices: 'office',
  salario: 'salary', sueldo: 'salary', remuneracion: 'salary', pretension: 'salary', compensation: 'salary',
  ingles: 'english', nivel: 'level', idioma: 'language',
  disponibilidad: 'availability', available: 'availability', disponible: 'availability',
  empezar: 'start', comenzar: 'start', inicio: 'start', incorporarte: 'start',
  reubicarte: 'relocate', reubicacion: 'relocate', mudarte: 'relocate', relocation: 'relocate', relocating: 'relocate',
  visa: 'sponsorship', patrocinio: 'sponsorship', sponsor: 'sponsorship',
  autorizado: 'authorized', authorised: 'authorized', legalmente: 'legally',
  titulo: 'degree', licenciatura: 'degree', bachelor: 'degree', bachelors: 'degree', universitario: 'degree',
  comodo: 'comfortable', comoda: 'comfortable',
  si: 'yes',
};

export function tokens(s: string): string[] {
  return normalize(s)
    .split(' ')
    .filter((t) => t && !STOPWORDS.has(t))
    .map((t) => CANON[t] ?? t);
}

/** Heurística simple de idioma de la etiqueta. */
export function detectLang(label: string): 'es' | 'en' {
  const n = ` ${normalize(label)} `;
  const en = (n.match(/ (you|your|do|are|have|how|what|the|of|years|with|which|is) /g) ?? []).length;
  const es = (n.match(/ (tenes|tienes|cuantos|cual|de|con|el|la|los|anos|estas|sos|eres|que) /g) ?? []).length;
  return en > es ? 'en' : 'es';
}
