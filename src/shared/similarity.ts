import { tokens } from './normalize';

function trigrams(s: string): Map<string, number> {
  const padded = `  ${s} `;
  const m = new Map<string, number>();
  for (let i = 0; i < padded.length - 2; i++) {
    const g = padded.slice(i, i + 3);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

/** Coeficiente de Dice sobre trigramas de caracteres (tolera variaciones de palabras). */
export function dice(a: string, b: string): number {
  if (!a || !b) return 0;
  const ta = trigrams(a);
  const tb = trigrams(b);
  let inter = 0;
  let total = 0;
  for (const [g, c] of ta) {
    inter += Math.min(c, tb.get(g) ?? 0);
    total += c;
  }
  for (const c of tb.values()) total += c;
  return (2 * inter) / total;
}

export function jaccard(a: string[], b: string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

/**
 * Similitud entre dos preguntas en [0,1]: mitad palabras compartidas
 * (sin stopwords, con equivalencias ES/EN), mitad trigramas.
 */
export function questionSimilarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.length || !tb.length) return 0;
  return 0.5 * jaccard(ta, tb) + 0.5 * dice(ta.join(' '), tb.join(' '));
}
