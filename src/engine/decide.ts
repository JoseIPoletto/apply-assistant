import { normalize } from '../shared/normalize';
import { questionSimilarity } from '../shared/similarity';
import type { BankEntry, Decision, FieldInfo, FillValue, Profile } from '../shared/types';
import { matchBoolean, matchNumber, matchText } from './options';
import { findRule, yesNoText, type Answer } from './rules';

/** Por encima: se reutiliza la respuesta del banco (amarillo salvo pregunta idéntica). */
export const BANK_THRESHOLD = 0.55;
/** Por encima: se le pasa a Claude como pista. */
export const HINT_THRESHOLD = 0.25;

export interface EngineCtx {
  profile: Profile;
  bank: BankEntry[];
  claudeEnabled: boolean;
  hasCv: boolean;
}

interface Adapted {
  fill: FillValue;
  exact: boolean;
}

const YESNO_RE = /^(yes|si|no|true|false)$/;

function boolFromText(s: string): boolean | null {
  const n = normalize(s);
  if (!YESNO_RE.test(n)) return null;
  return n === 'yes' || n === 'si' || n === 'true';
}

/** Convierte una respuesta abstracta (número, booleano, texto…) al formato concreto del campo. */
export function adapt(f: FieldInfo, answer: Answer, ctx: Pick<EngineCtx, 'hasCv'>, synonyms: string[] = []): Adapted | null {
  if (typeof answer === 'object' && !Array.isArray(answer)) {
    return f.kind === 'file' && ctx.hasCv ? { fill: { type: 'file' }, exact: true } : null;
  }
  if (f.kind === 'file') return null;

  const opts = f.options ?? [];
  switch (f.kind) {
    case 'select':
    case 'radio': {
      if (typeof answer === 'boolean') {
        const m = matchBoolean(opts, answer);
        return m && { fill: { type: 'option', index: m.index }, exact: m.exact };
      }
      if (typeof answer === 'number') {
        const m = matchNumber(opts, answer) ?? matchText(opts, String(answer));
        return m && { fill: { type: 'option', index: m.index }, exact: m.exact };
      }
      const text = Array.isArray(answer) ? answer[0] ?? '' : answer;
      const m = matchText(opts, text, synonyms);
      if (m) return { fill: { type: 'option', index: m.index }, exact: m.exact };
      const b = boolFromText(text);
      if (b !== null) {
        const mb = matchBoolean(opts, b);
        if (mb) return { fill: { type: 'option', index: mb.index }, exact: mb.exact };
      }
      const num = Number(text);
      if (text.trim() && !Number.isNaN(num)) {
        const mn = matchNumber(opts, num);
        if (mn) return { fill: { type: 'option', index: mn.index }, exact: false };
      }
      return null;
    }
    case 'checkboxGroup': {
      const wanted = Array.isArray(answer) ? answer : [String(answer)];
      const hits = wanted.map((w) => matchText(opts, w, synonyms));
      if (!hits.length || hits.some((h) => !h)) return null;
      return {
        fill: { type: 'options', indexes: hits.map((h) => h!.index) },
        exact: hits.every((h) => h!.exact),
      };
    }
    case 'checkbox': {
      const b = typeof answer === 'boolean' ? answer : boolFromText(String(answer));
      return b === null ? null : { fill: { type: 'check', checked: b }, exact: true };
    }
    case 'number': {
      if (typeof answer === 'boolean') return null;
      const n = typeof answer === 'number' ? answer : Number(String(answer).replace(',', '.'));
      return Number.isNaN(n) ? null : { fill: { type: 'text', text: String(n) }, exact: true };
    }
    default: {
      // text, textarea, email, tel, url, date, combobox
      const text =
        typeof answer === 'boolean' ? yesNoText(answer, f)
        : Array.isArray(answer) ? answer.join(', ')
        : String(answer);
      if (!text.trim()) return null;
      return { fill: { type: 'text', text }, exact: f.kind !== 'combobox' && f.kind !== 'date' };
    }
  }
}

export interface BankHit {
  entry: BankEntry;
  score: number;
  same: boolean;
}

export function searchBank(f: FieldInfo, bank: BankEntry[]): BankHit[] {
  const n = normalize(f.label);
  return bank
    .map((entry) => {
      const same = normalize(entry.question) === n;
      return { entry, same, score: same ? 1 : questionSimilarity(f.label, entry.question) };
    })
    .filter((h) => h.score >= HINT_THRESHOLD)
    .sort((a, b) => b.score - a.score || b.entry.uses - a.entry.uses);
}

function fromBank(f: FieldInfo, hits: BankHit[], ctx: EngineCtx): Decision | null {
  for (const h of hits) {
    if (h.score < BANK_THRESHOLD) break;
    if (h.entry.reuse !== 'direct') continue;
    const a = adapt(f, h.entry.answer, ctx);
    if (!a) continue;
    const exact = h.same && a.exact;
    return {
      status: exact ? 'exact' : 'inferred',
      fill: a.fill,
      source: 'bank',
      bankId: h.entry.id,
      note: exact
        ? 'Respuesta guardada (misma pregunta).'
        : `Del banco, pregunta parecida (${Math.round(h.score * 100)}%): "${h.entry.question}"`,
    };
  }
  return null;
}

const isOpenQuestion = (f: FieldInfo) =>
  f.kind === 'textarea' || (f.kind === 'text' && normalize(f.label).split(' ').length > 8);

/**
 * Orden: reglas de perfil → banco (exacto/aproximado) → Claude (si está activo) → vacío.
 * Nunca inventa: si una regla reconoce la pregunta pero falta el dato, queda vacío y marcado.
 */
export function decide(f: FieldInfo, ctx: EngineCtx): Decision {
  const hits = searchBank(f, ctx.bank);
  const ruleHit = findRule(f);

  if (ruleHit) {
    const r = ruleHit.rule.resolve(f, ctx.profile, ruleHit.n);
    if (r.kind === 'skip') return { status: 'skip', source: 'none', note: r.note, ruleId: ruleHit.rule.id };
    if (r.kind === 'value') {
      const a = adapt(f, r.value, ctx, r.synonyms);
      if (a) {
        const exact = r.exact && a.exact;
        // Si el perfil solo permite interpretar, pero ya respondiste ESTA misma pregunta, gana tu respuesta.
        if (!exact) {
          const b = fromBank(f, hits.filter((h) => h.same), ctx);
          if (b) return b;
        }
        return {
          status: r.exact && a.exact ? 'exact' : 'inferred',
          fill: a.fill,
          source: 'profile',
          ruleId: ruleHit.rule.id,
          note: r.note,
        };
      }
    }
    // La regla reconoció la pregunta pero no hay dato (o no encaja con las opciones):
    // si la respondiste antes, usamos el banco; si no, vacío. No va a Claude: es un dato duro.
    const b = fromBank(f, hits, ctx);
    if (b) return b;
    const note =
      r.kind === 'missing' ? r.note
      : ruleHit.rule.id === 'cv' && !ctx.hasCv ? 'No cargaste el CV en PDF.'
      : `Tengo el dato (${r.note}) pero no encaja con las opciones.`;
    return { status: 'missing', source: 'none', ruleId: ruleHit.rule.id, note };
  }

  const b = fromBank(f, hits, ctx);
  if (b) return b;

  if (ctx.claudeEnabled) {
    return {
      status: 'needs-ai',
      source: 'none',
      note: isOpenQuestion(f) ? 'Pregunta abierta: la redacta Claude.' : 'Ambigua: la interpreta Claude.',
      hints: hits.slice(0, 3).map((h) => h.entry),
    };
  }
  return { status: 'missing', source: 'none', note: 'Sin dato en el perfil ni en el banco.' };
}
