import type { AiAnswer, AiRequest } from '../engine/ai';

export type Msg =
  | { type: 'ai.resolve'; payload: AiRequest }
  | { type: 'fill' };

export type AiResponse = { ok: true; answers: AiAnswer[] } | { ok: false; error: string };
