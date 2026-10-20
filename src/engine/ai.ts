import type { BankEntry, FieldInfo, JobContext, Profile } from '../shared/types';

export interface AiField extends FieldInfo {
  hints: { question: string; answer: string | string[] }[];
}

export interface AiRequest {
  fields: AiField[];
  job: JobContext;
}

export interface AiAnswer {
  key: string;
  answer: string | string[] | null;
  reason: string;
}

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

function profileSummary(p: Profile): string {
  const lines = [
    `Nombre: ${p.firstName} ${p.lastName}`,
    `Ubicación: ${p.location || [p.city, p.country].filter(Boolean).join(', ')}`,
    `Puesto actual: ${p.currentTitle}`,
    `Resumen: ${p.summary || 'sin dato'}`,
    `Inglés: ${p.englishLevel || 'sin dato'}`,
    `Disponibilidad: ${p.noticePeriod || 'sin dato'}`,
    `Modalidades aceptadas: ${p.workModes.join(', ') || 'sin dato'}`,
    `Relocación: ${p.willingToRelocate == null ? 'sin dato' : p.willingToRelocate ? 'sí' : 'no'}`,
    `Necesita visa: ${p.requiresSponsorship == null ? 'sin dato' : p.requiresSponsorship ? 'sí' : 'no'}`,
    `Autorizado a trabajar en: ${p.authorizedCountries.join(', ') || 'sin dato'}`,
    `Años totales: ${p.totalYears ?? 'sin dato'}`,
    `Años por tecnología: ${Object.entries(p.techYears).map(([k, v]) => `${k} ${v}`).join(', ') || 'sin dato'}`,
    `Pretensión: ${p.salary.map((s) => `${s.currency} ${s.amount}/${s.period}`).join(' | ') || 'sin dato'}`,
  ];
  return lines.join('\n');
}

export const AI_SYSTEM = `Completás formularios de postulación laboral en nombre de un candidato.
Reglas innegociables:
- NUNCA inventes experiencia, títulos, empresas, números, fechas ni años. Si el dato no está en el perfil, el CV o las respuestas previas, devolvé answer: null.
- Preguntas fácticas (sí/no, cantidades, certificaciones, permisos): respondé solo si se deduce sin dudas del material. Ante la duda, null.
- Preguntas abiertas (por qué te interesa, contanos sobre vos, carta breve): redactá en primera persona, concreto, 60–120 palabras, en el idioma de la pregunta, apoyándote en la oferta y en hechos reales del CV. Sin frases de relleno ni elogios genéricos a la empresa.
- Si el campo tiene opciones, "answer" debe ser el texto EXACTO de una opción (o una lista de opciones para casillas múltiples).
- Respondé SOLO con JSON válido: {"answers":[{"key":"...","answer":"..." | ["..."] | null,"reason":"breve"}]}`;

export function buildAiUserPrompt(req: AiRequest, p: Profile, references: BankEntry[]): string {
  const refs = references
    .slice(0, 5)
    .map((r) => `P: ${r.question}\nR: ${cut(String(r.answer), 600)}`)
    .join('\n\n');
  const fields = req.fields.map((f) => ({
    key: f.key,
    pregunta: f.label,
    tipo: f.kind,
    obligatoria: f.required,
    opciones: f.options,
    respuestas_previas_parecidas: f.hints.length ? f.hints : undefined,
  }));
  return [
    `## Oferta\n${req.job.title} — ${req.job.company}\n${cut(req.job.description, 6000)}`,
    `## Perfil\n${profileSummary(p)}`,
    `## CV\n${cut(p.cvText || '(sin CV cargado)', 8000)}`,
    refs ? `## Respuestas abiertas anteriores (solo como referencia de tono)\n${refs}` : '',
    `## Campos a completar\n${JSON.stringify(fields, null, 2)}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function parseAiResponse(text: string): AiAnswer[] {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) return [];
  try {
    const data = JSON.parse(text.slice(start, end + 1)) as { answers?: AiAnswer[] };
    return (data.answers ?? []).filter((a) => a && typeof a.key === 'string');
  } catch {
    return [];
  }
}
