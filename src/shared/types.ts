// ───────────────────────── Perfil (se carga una vez) ─────────────────────────

export type EnglishLevel = '' | 'basic' | 'intermediate' | 'advanced' | 'fluent' | 'native';
export type WorkMode = 'remote' | 'hybrid' | 'onsite';
export type Currency = 'USD' | 'ARS' | 'EUR';
export type Period = 'month' | 'year' | 'hour';

export interface SalaryExpectation {
  currency: Currency;
  amount: number;
  period: Period;
}

export interface Profile {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;            // sin código de país, ej "1155551234"
  phoneCountryCode: string; // ej "+54"
  city: string;             // ej "Buenos Aires"
  country: string;          // ej "Argentina"
  location: string;         // como querés que aparezca: "Buenos Aires, Argentina"
  linkedinUrl: string;
  githubUrl: string;
  portfolioUrl: string;
  currentTitle: string;
  headline: string;         // titular corto (LinkedIn "Headline", máx. 127)
  summary: string;          // resumen profesional ("Summary", "Acerca de")
  coverLetter: string;      // carta genérica: siempre queda en amarillo
  englishLevel: EnglishLevel;
  noticePeriod: string;     // texto libre: "Inmediata", "2 semanas"
  noticeDays: number | null;
  salary: SalaryExpectation[];       // el primero es el default
  workModes: WorkMode[];             // modalidades que aceptás
  willingToRelocate: boolean | null; // null = no lo cargaste → no se responde
  requiresSponsorship: boolean | null;
  authorizedCountries: string[];     // países donde podés trabajar sin visa
  totalYears: number | null;
  techYears: Record<string, number>; // { "React": 4, "Node.js": 3 }
  cvText: string;                    // texto plano del CV, solo para Claude
}

export interface CvFile {
  name: string;
  type: string;
  base64: string;
}

// ───────────────────────── Banco de respuestas ─────────────────────────

export type FieldKind =
  | 'text' | 'textarea' | 'number' | 'email' | 'tel' | 'url' | 'date'
  | 'select' | 'radio' | 'checkbox' | 'checkboxGroup' | 'combobox' | 'file';

export interface BankEntry {
  id: string;
  question: string;            // etiqueta tal cual la viste
  kind: FieldKind;
  options?: string[];          // opciones que tenía la pregunta (si aplica)
  answer: string | string[];   // texto de la opción elegida o lo que escribiste
  // direct: se reutiliza tal cual. reference: respuesta larga/abierta,
  // solo se le pasa a Claude como ejemplo de tono, nunca se pega sola.
  reuse: 'direct' | 'reference';
  createdAt: number;
  updatedAt: number;
  uses: number;
}

// ───────────────────────── Ajustes ─────────────────────────

export interface Settings {
  claudeEnabled: boolean;
  apiKey: string;
  model: string;
  autoFill: boolean;            // completar solo al abrir cada paso
  uploadCvOnLinkedIn: boolean;  // LinkedIn ya recuerda tus CVs; default off
  uploadCvExternal: boolean;    // Greenhouse/Lever
  overwriteExisting: boolean;   // pisar campos ya completos (default off)
}

// ───────────────────────── Motor ─────────────────────────

/** Descripción pura de un campo (sin DOM) para que el motor sea testeable. */
export interface FieldInfo {
  key: string;
  kind: FieldKind;
  label: string;
  options?: string[];
  required: boolean;
  hasValue: boolean;
  lang: 'es' | 'en';
}

export type Confidence = 'exact' | 'inferred' | 'missing';

export type FillValue =
  | { type: 'text'; text: string }
  | { type: 'option'; index: number }       // select / radio
  | { type: 'options'; indexes: number[] }  // grupo de checkboxes
  | { type: 'check'; checked: boolean }     // checkbox suelto
  | { type: 'file' };

export type DecisionSource = 'profile' | 'bank' | 'claude' | 'none';

export interface Decision {
  status: Confidence | 'needs-ai' | 'skip';
  fill?: FillValue;
  source: DecisionSource;
  note: string;
  ruleId?: string;
  bankId?: string;
  /** Pistas del banco por debajo del umbral, útiles para Claude. */
  hints?: BankEntry[];
}

export interface JobContext {
  title: string;
  company: string;
  description: string;
  url: string;
}
