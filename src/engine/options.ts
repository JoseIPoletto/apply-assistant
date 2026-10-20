import { normalize } from '../shared/normalize';
import { dice } from '../shared/similarity';

export interface OptionMatch {
  index: number;
  exact: boolean;
}

const PLACEHOLDER = /^(select|selecciona|seleccionar|seleccione|elegi|elige|choose|please select|select an option|selecciona una opcion|none selected|--+)( .*)?$/;

export function isPlaceholder(option: string): boolean {
  const n = normalize(option);
  return n === '' || PLACEHOLDER.test(n);
}

const YES = new Set(['yes', 'si', 'true', 'y', 'yes i am', 'yes i do', 'si tengo', 'si estoy', 'afirmativo']);
const NO = new Set(['no', 'false', 'n', 'no i am not', 'no i do not', 'no tengo', 'no estoy', 'negativo']);

function isYes(n: string) {
  return YES.has(n) || /^(yes|si)\b/.test(n);
}
function isNo(n: string) {
  return NO.has(n) || /^no\b/.test(n);
}

export function matchBoolean(options: string[], wanted: boolean): OptionMatch | null {
  const hits = options
    .map((o, i) => ({ n: normalize(o), i }))
    .filter(({ n, i }) => !isPlaceholder(options[i]) && (wanted ? isYes(n) : isNo(n)));
  return hits.length === 1 ? { index: hits[0].i, exact: true } : null;
}

/** Interpreta opciones tipo "0-1", "1 a 3 años", "5+", "More than 5", "Menos de 1". */
export function parseRange(option: string): [number, number] | null {
  const n = normalize(option);
  const nums = (n.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
  if (!nums.length) return null;
  if (/(\+|more than|mas de|over|at least|al menos|or more|o mas)/.test(n) && nums.length === 1)
    return [nums[0], Infinity];
  if (/(less than|menos de|under|hasta|up to)/.test(n) && nums.length === 1) return [0, nums[0] - 1e-9];
  if (nums.length >= 2) return [Math.min(nums[0], nums[1]), Math.max(nums[0], nums[1])];
  return [nums[0], nums[0]];
}

export function matchNumber(options: string[], value: number): OptionMatch | null {
  const hits: number[] = [];
  options.forEach((o, i) => {
    if (isPlaceholder(o)) return;
    const r = parseRange(o);
    if (r && value >= r[0] && value <= r[1]) hits.push(i);
  });
  // Rangos solapados ("1-3" y "3-5" con valor 3): tomamos el primero pero lo marcamos para revisar.
  if (hits.length >= 1) return { index: hits[0], exact: hits.length === 1 };
  return null;
}

/**
 * Busca la opción que corresponde a `wanted`.
 * - igual (normalizado) → exacta
 * - una sola opción contiene la palabra completa (o viceversa) → exacta
 * - alguna de las `synonyms` coincide → interpretada
 * - parecido por trigramas ≥ 0.5 → interpretada
 */
export function matchText(options: string[], wanted: string, synonyms: string[] = []): OptionMatch | null {
  const w = normalize(wanted);
  if (!w) return null;
  const valid = options.map((o, i) => ({ n: normalize(o), i })).filter(({ i }) => !isPlaceholder(options[i]));

  const eq = valid.filter((o) => o.n === w);
  if (eq.length === 1) return { index: eq[0].i, exact: true };

  const wordRe = (s: string) => new RegExp(`(^| )${s.replace(/[+#]/g, '\\$&')}( |$)`);
  const contains = valid.filter((o) => wordRe(w).test(o.n) || wordRe(o.n).test(w));
  if (contains.length === 1) return { index: contains[0].i, exact: true };

  for (const syn of synonyms.map(normalize)) {
    const s = valid.filter((o) => o.n === syn || wordRe(syn).test(o.n));
    if (s.length === 1) return { index: s[0].i, exact: false };
  }

  let best = { i: -1, score: 0 };
  for (const o of valid) {
    const sc = dice(o.n, w);
    if (sc > best.score) best = { i: o.i, score: sc };
  }
  return best.score >= 0.5 ? { index: best.i, exact: false } : null;
}
