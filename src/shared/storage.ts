import { DEFAULT_PROFILE, DEFAULT_SETTINGS } from './defaults';
import type { BankEntry, CvFile, Profile, Settings } from './types';
import { normalize } from './normalize';

// Todo vive en chrome.storage.local. Nada sale del navegador salvo
// las llamadas a la API de Claude (desactivables).

const K = { profile: 'profile', bank: 'bank', settings: 'settings', cv: 'cvFile' } as const;

async function get<T>(key: string, fallback: T): Promise<T> {
  const r = await chrome.storage.local.get(key);
  return (r[key] as T | undefined) ?? fallback;
}

export async function loadProfile(): Promise<Profile> {
  return { ...DEFAULT_PROFILE, ...(await get<Partial<Profile>>(K.profile, {})) };
}
export const saveProfile = (p: Profile) => chrome.storage.local.set({ [K.profile]: p });

export async function loadSettings(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...(await get<Partial<Settings>>(K.settings, {})) };
}
export const saveSettings = (s: Settings) => chrome.storage.local.set({ [K.settings]: s });

export const loadBank = () => get<BankEntry[]>(K.bank, []);
export const saveBank = (b: BankEntry[]) => chrome.storage.local.set({ [K.bank]: b });

export const loadCv = () => get<CvFile | null>(K.cv, null);
export const saveCv = (cv: CvFile | null) => chrome.storage.local.set({ [K.cv]: cv });

/** Inserta o actualiza una respuesta del banco (misma pregunta normalizada + tipo). */
export async function upsertBankEntry(
  e: Pick<BankEntry, 'question' | 'kind' | 'options' | 'answer'>,
): Promise<void> {
  const bank = await loadBank();
  const n = normalize(e.question);
  const now = Date.now();
  const longText = typeof e.answer === 'string' && e.answer.length > 280;
  const reuse: BankEntry['reuse'] = e.kind === 'textarea' || longText ? 'reference' : 'direct';
  const existing = bank.find((b) => normalize(b.question) === n && b.kind === e.kind);
  if (existing) {
    existing.answer = e.answer;
    existing.options = e.options;
    existing.reuse = reuse;
    existing.updatedAt = now;
  } else {
    bank.push({ ...e, id: crypto.randomUUID(), reuse, createdAt: now, updatedAt: now, uses: 0 });
  }
  await saveBank(bank);
}

export async function bumpBankUse(id: string): Promise<void> {
  const bank = await loadBank();
  const e = bank.find((b) => b.id === id);
  if (e) {
    e.uses += 1;
    await saveBank(bank);
  }
}

export async function exportAll(): Promise<string> {
  const [profile, bank, settings] = await Promise.all([loadProfile(), loadBank(), loadSettings()]);
  // La API key no se exporta.
  return JSON.stringify({ profile, bank, settings: { ...settings, apiKey: '' } }, null, 2);
}

export async function importAll(json: string): Promise<void> {
  const data = JSON.parse(json) as { profile?: Profile; bank?: BankEntry[]; settings?: Settings };
  if (data.profile) await saveProfile({ ...DEFAULT_PROFILE, ...data.profile });
  if (data.bank) await saveBank(data.bank);
  if (data.settings) {
    const current = await loadSettings();
    await saveSettings({ ...current, ...data.settings, apiKey: current.apiKey });
  }
}
