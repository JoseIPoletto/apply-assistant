import { AI_SYSTEM, buildAiUserPrompt, parseAiResponse } from '../engine/ai';
import type { AiResponse, Msg } from '../shared/messages';
import { loadBank, loadProfile, loadSettings } from '../shared/storage';

// Única salida de red de la extensión: la API de Claude, con tu key, y solo si está activada.
async function callClaude(apiKey: string, model: string, system: string, user: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2000,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { content: { type: string; text?: string }[] };
  return data.content.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('');
}

chrome.runtime.onMessage.addListener((msg: Msg, _sender, sendResponse: (r: AiResponse) => void) => {
  if (msg.type !== 'ai.resolve') return false;
  (async () => {
    const settings = await loadSettings();
    if (!settings.claudeEnabled || !settings.apiKey) {
      sendResponse({ ok: false, error: 'Claude desactivado o sin API key.' });
      return;
    }
    const [profile, bank] = await Promise.all([loadProfile(), loadBank()]);
    const refs = bank.filter((b) => b.reuse === 'reference').sort((a, b) => b.updatedAt - a.updatedAt);
    const text = await callClaude(settings.apiKey, settings.model, AI_SYSTEM, buildAiUserPrompt(msg.payload, profile, refs));
    sendResponse({ ok: true, answers: parseAiResponse(text) });
  })().catch((e: unknown) => sendResponse({ ok: false, error: String(e) }));
  return true; // respuesta asíncrona
});

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'fill-form') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'fill' } satisfies Msg).catch(() => {});
});

// ───── auto-recarga ─────
// Una extensión "descomprimida" no se actualiza sola. Una tarea de Windows hace
// `git pull` en la carpeta; acá leemos el manifest.json del disco cada 5 min y,
// si la versión cambió, reiniciamos la extensión para tomar los archivos nuevos.
const SELF_UPDATE = 'aa-self-update';
chrome.alarms.create(SELF_UPDATE, { periodInMinutes: 5 });

async function reloadIfNewVersion(): Promise<void> {
  try {
    const res = await fetch(chrome.runtime.getURL('manifest.json'), { cache: 'no-store' });
    const onDisk = (await res.json()) as { version?: string };
    const running = chrome.runtime.getManifest().version;
    if (onDisk.version && onDisk.version !== running) {
      console.info(`[Micro Gambit] versión ${running} → ${onDisk.version}: recargando`);
      chrome.runtime.reload();
    }
  } catch {
    // manifest a medio escribir durante un git pull: se reintenta en la próxima alarma
  }
}

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === SELF_UPDATE) void reloadIfNewVersion();
});
chrome.runtime.onStartup.addListener(() => void reloadIfNewVersion());
