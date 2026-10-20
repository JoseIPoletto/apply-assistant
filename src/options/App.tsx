import { useEffect, useState, type ReactNode } from 'react';
import { DEFAULT_PROFILE, DEFAULT_SETTINGS } from '../shared/defaults';
import {
  exportAll, importAll, loadBank, loadCv, loadProfile, loadSettings,
  saveBank, saveCv, saveProfile, saveSettings,
} from '../shared/storage';
import type { BankEntry, CvFile, Currency, EnglishLevel, Period, Profile, Settings, WorkMode } from '../shared/types';

type Tab = 'perfil' | 'tecnologias' | 'cv' | 'banco' | 'ajustes';

const triState = (v: boolean | null) => (v == null ? '' : v ? 'yes' : 'no');
const fromTri = (s: string) => (s === '' ? null : s === 'yes');

export function App() {
  const [tab, setTab] = useState<Tab>('perfil');
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [bank, setBank] = useState<BankEntry[]>([]);
  const [cv, setCv] = useState<CvFile | null>(null);
  const [flash, setFlash] = useState('');

  useEffect(() => {
    void Promise.all([loadProfile(), loadSettings(), loadBank(), loadCv()]).then(([p, s, b, c]) => {
      setProfile(p);
      setSettings(s);
      setBank(b);
      setCv(c);
    });
  }, []);

  const ok = (m: string) => {
    setFlash(m);
    setTimeout(() => setFlash(''), 2000);
  };
  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => setProfile((p) => ({ ...p, [k]: v }));

  return (
    <main>
      <header>
        <h1>Apply Assistant</h1>
        <p className="muted">Todo se guarda en este navegador. La extensión completa, nunca envía.</p>
        <nav>
          {(['perfil', 'tecnologias', 'cv', 'banco', 'ajustes'] as Tab[]).map((t) => (
            <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
              {t === 'tecnologias' ? 'Tecnologías' : t === 'cv' ? 'CV' : t[0].toUpperCase() + t.slice(1)}
              {t === 'banco' ? ` (${bank.length})` : ''}
            </button>
          ))}
        </nav>
      </header>

      {tab === 'perfil' && (
        <section>
          <Grid>
            <Text label="Nombre" v={profile.firstName} on={(v) => set('firstName', v)} />
            <Text label="Apellido" v={profile.lastName} on={(v) => set('lastName', v)} />
            <Text label="Email" v={profile.email} on={(v) => set('email', v)} />
            <Text label="Código de país" v={profile.phoneCountryCode} on={(v) => set('phoneCountryCode', v)} />
            <Text label="Teléfono (sin código)" v={profile.phone} on={(v) => set('phone', v)} />
            <Text label="Ciudad" v={profile.city} on={(v) => set('city', v)} />
            <Text label="País" v={profile.country} on={(v) => set('country', v)} />
            <Text label="Ubicación (como querés que figure)" v={profile.location} on={(v) => set('location', v)} />
            <Text label="LinkedIn" v={profile.linkedinUrl} on={(v) => set('linkedinUrl', v)} />
            <Text label="GitHub" v={profile.githubUrl} on={(v) => set('githubUrl', v)} />
            <Text label="Portfolio / web" v={profile.portfolioUrl} on={(v) => set('portfolioUrl', v)} />
            <Text label="Puesto actual" v={profile.currentTitle} on={(v) => set('currentTitle', v)} />
            <Text label="Titular / Headline (máx. 127)" v={profile.headline} on={(v) => set('headline', v.slice(0, 127))} />
            <Field label="Nivel de inglés">
              <select value={profile.englishLevel} onChange={(e) => set('englishLevel', e.target.value as EnglishLevel)}>
                <option value="">— sin dato —</option>
                <option value="basic">Básico</option>
                <option value="intermediate">Intermedio</option>
                <option value="advanced">Avanzado</option>
                <option value="fluent">Fluido</option>
                <option value="native">Nativo / bilingüe</option>
              </select>
            </Field>
            <Text label="Disponibilidad (texto)" v={profile.noticePeriod} on={(v) => set('noticePeriod', v)} placeholder="Inmediata / 2 semanas" />
            <NumberInput label="Preaviso en días" v={profile.noticeDays} on={(v) => set('noticeDays', v)} />
            <NumberInput label="Años totales de experiencia" v={profile.totalYears} on={(v) => set('totalYears', v)} />
            <Field label="Relocación">
              <TriSelect v={profile.willingToRelocate} on={(v) => set('willingToRelocate', v)} />
            </Field>
            <Field label="¿Necesitás sponsoreo de visa?">
              <TriSelect v={profile.requiresSponsorship} on={(v) => set('requiresSponsorship', v)} />
            </Field>
            <Text
              label="Autorizado a trabajar en (coma)"
              v={profile.authorizedCountries.join(', ')}
              on={(v) => set('authorizedCountries', v.split(',').map((s) => s.trim()).filter(Boolean))}
            />
            <Field label="Modalidades aceptadas (la 1ª es la preferida)">
              <div className="row">
                {(['remote', 'hybrid', 'onsite'] as WorkMode[]).map((m) => (
                  <label key={m} className="check">
                    <input
                      type="checkbox"
                      checked={profile.workModes.includes(m)}
                      onChange={(e) =>
                        set('workModes', e.target.checked ? [...profile.workModes, m] : profile.workModes.filter((x) => x !== m))
                      }
                    />
                    {m === 'remote' ? 'Remoto' : m === 'hybrid' ? 'Híbrido' : 'Presencial'}
                  </label>
                ))}
              </div>
            </Field>
          </Grid>

          <h3>Pretensión salarial</h3>
          <p className="muted">La primera es la default cuando la pregunta no dice moneda.</p>
          {profile.salary.map((s, i) => (
            <div className="row" key={i}>
              <select value={s.currency} onChange={(e) => set('salary', profile.salary.map((x, j) => (j === i ? { ...x, currency: e.target.value as Currency } : x)))}>
                <option>USD</option><option>ARS</option><option>EUR</option>
              </select>
              <input type="number" value={s.amount} onChange={(e) => set('salary', profile.salary.map((x, j) => (j === i ? { ...x, amount: Number(e.target.value) } : x)))} />
              <select value={s.period} onChange={(e) => set('salary', profile.salary.map((x, j) => (j === i ? { ...x, period: e.target.value as Period } : x)))}>
                <option value="month">por mes</option><option value="year">por año</option><option value="hour">por hora</option>
              </select>
              <button className="ghost" onClick={() => set('salary', profile.salary.filter((_, j) => j !== i))}>Quitar</button>
            </div>
          ))}
          <button className="ghost" onClick={() => set('salary', [...profile.salary, { currency: 'USD', amount: 0, period: 'month' }])}>+ Agregar</button>

          <h3>Textos</h3>
          <Field label="Resumen profesional (Summary / Acerca de)">
            <textarea rows={6} value={profile.summary} onChange={(e) => set('summary', e.target.value)} />
          </Field>
          <Field label="Carta de presentación genérica (siempre queda en amarillo para que la adaptes)">
            <textarea rows={10} value={profile.coverLetter} onChange={(e) => set('coverLetter', e.target.value)} />
          </Field>

          <SaveBar onSave={async () => { await saveProfile(profile); ok('Perfil guardado'); }} flash={flash} />
        </section>
      )}

      {tab === 'tecnologias' && (
        <section>
          <p className="muted">Años por tecnología. Se reconocen variantes: "Node.js" = node / nodejs; "React" = reactjs.</p>
          <TechTable value={profile.techYears} onChange={(v) => set('techYears', v)} />
          <SaveBar onSave={async () => { await saveProfile(profile); ok('Tecnologías guardadas'); }} flash={flash} />
        </section>
      )}

      {tab === 'cv' && (
        <section>
          <Field label="CV en PDF (para subir en los formularios)">
            <input
              type="file"
              accept="application/pdf"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                if (f.size > 5_000_000) return ok('El PDF supera 5 MB');
                const base64 = await new Promise<string>((res) => {
                  const r = new FileReader();
                  r.onload = () => res(String(r.result).split(',')[1] ?? '');
                  r.readAsDataURL(f);
                });
                const file = { name: f.name, type: f.type, base64 };
                await saveCv(file);
                setCv(file);
                ok('CV guardado');
              }}
            />
          </Field>
          <p>{cv ? `Cargado: ${cv.name}` : 'Sin CV cargado.'} {cv && <button className="ghost" onClick={async () => { await saveCv(null); setCv(null); }}>Quitar</button>}</p>
          <Field label="Texto del CV (solo lo usa Claude para redactar; pegalo en texto plano)">
            <textarea rows={16} value={profile.cvText} onChange={(e) => set('cvText', e.target.value)} />
          </Field>
          <SaveBar onSave={async () => { await saveProfile(profile); ok('Texto del CV guardado'); }} flash={flash} />
        </section>
      )}

      {tab === 'banco' && (
        <section>
          <p className="muted">Lo que respondés en los formularios se guarda acá. Las respuestas largas quedan como "referencia": Claude las usa para tu tono, pero no se pegan solas.</p>
          {bank.length === 0 && <p>Todavía vacío.</p>}
          {bank
            .slice()
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .map((e) => (
              <div className="card" key={e.id}>
                <div className="q">{e.question}</div>
                <div className="row">
                  <input
                    className="grow"
                    value={Array.isArray(e.answer) ? e.answer.join(' | ') : e.answer}
                    onChange={(ev) =>
                      setBank((b) => b.map((x) => (x.id === e.id ? { ...x, answer: Array.isArray(x.answer) ? ev.target.value.split(' | ') : ev.target.value } : x)))
                    }
                  />
                  <select value={e.reuse} onChange={(ev) => setBank((b) => b.map((x) => (x.id === e.id ? { ...x, reuse: ev.target.value as BankEntry['reuse'] } : x)))}>
                    <option value="direct">reutilizar</option>
                    <option value="reference">solo referencia</option>
                  </select>
                  <button className="ghost" onClick={() => setBank((b) => b.filter((x) => x.id !== e.id))}>Borrar</button>
                </div>
                <div className="muted small">{e.kind}{e.options ? ` · opciones: ${e.options.filter(Boolean).slice(0, 6).join(' / ')}` : ''} · usada {e.uses}×</div>
              </div>
            ))}
          <SaveBar onSave={async () => { await saveBank(bank); ok('Banco guardado'); }} flash={flash} />
        </section>
      )}

      {tab === 'ajustes' && (
        <section>
          <label className="check">
            <input type="checkbox" checked={settings.claudeEnabled} onChange={(e) => setSettings({ ...settings, claudeEnabled: e.target.checked })} />
            Usar Claude para preguntas ambiguas y abiertas (única salida de red)
          </label>
          <Grid>
            <Field label="API key de Anthropic">
              <input type="password" value={settings.apiKey} onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })} />
            </Field>
            <Text label="Modelo" v={settings.model} on={(v) => setSettings({ ...settings, model: v })} />
          </Grid>
          <label className="check">
            <input type="checkbox" checked={settings.autoFill} onChange={(e) => setSettings({ ...settings, autoFill: e.target.checked })} />
            Completar automáticamente al abrir cada paso (si no, botón o Alt+Shift+F)
          </label>
          <label className="check">
            <input type="checkbox" checked={settings.uploadCvOnLinkedIn} onChange={(e) => setSettings({ ...settings, uploadCvOnLinkedIn: e.target.checked })} />
            Subir el CV en LinkedIn (normalmente ya recuerda los tuyos)
          </label>
          <label className="check">
            <input type="checkbox" checked={settings.uploadCvExternal} onChange={(e) => setSettings({ ...settings, uploadCvExternal: e.target.checked })} />
            Subir el CV en Greenhouse / Lever
          </label>
          <label className="check">
            <input type="checkbox" checked={settings.overwriteExisting} onChange={(e) => setSettings({ ...settings, overwriteExisting: e.target.checked })} />
            Pisar campos que ya vienen completos
          </label>
          <SaveBar onSave={async () => { await saveSettings(settings); ok('Ajustes guardados'); }} flash={flash} />

          <h3>Respaldo</h3>
          <div className="row">
            <button
              className="ghost"
              onClick={async () => {
                const blob = new Blob([await exportAll()], { type: 'application/json' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = 'apply-assistant-backup.json';
                a.click();
              }}
            >
              Exportar perfil + banco
            </button>
            <label className="ghost filebtn">
              Importar
              <input
                type="file"
                accept="application/json"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  await importAll(await f.text());
                  location.reload();
                }}
              />
            </label>
          </div>
        </section>
      )}
    </main>
  );
}

function Grid({ children }: { children: ReactNode }) {
  return <div className="grid">{children}</div>;
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function Text({ label, v, on, placeholder }: { label: string; v: string; on: (v: string) => void; placeholder?: string }) {
  return (
    <Field label={label}>
      <input value={v} placeholder={placeholder} onChange={(e) => on(e.target.value)} />
    </Field>
  );
}
function NumberInput({ label, v, on }: { label: string; v: number | null; on: (v: number | null) => void }) {
  return (
    <Field label={label}>
      <input type="number" value={v ?? ''} onChange={(e) => on(e.target.value === '' ? null : Number(e.target.value))} />
    </Field>
  );
}
function TriSelect({ v, on }: { v: boolean | null; on: (v: boolean | null) => void }) {
  return (
    <select value={triState(v)} onChange={(e) => on(fromTri(e.target.value))}>
      <option value="">— sin dato (no responder) —</option>
      <option value="yes">Sí</option>
      <option value="no">No</option>
    </select>
  );
}
function TechTable({ value, onChange }: { value: Record<string, number>; onChange: (v: Record<string, number>) => void }) {
  const rows = Object.entries(value);
  const [name, setName] = useState('');
  const [years, setYears] = useState('');
  return (
    <div>
      {rows.map(([k, y]) => (
        <div className="row" key={k}>
          <span className="grow">{k}</span>
          <input type="number" step="0.5" value={y} onChange={(e) => onChange({ ...value, [k]: Number(e.target.value) })} />
          <button className="ghost" onClick={() => { const { [k]: _, ...rest } = value; onChange(rest); }}>Quitar</button>
        </div>
      ))}
      <div className="row">
        <input className="grow" placeholder="Tecnología (ej. TypeScript)" value={name} onChange={(e) => setName(e.target.value)} />
        <input type="number" step="0.5" placeholder="Años" value={years} onChange={(e) => setYears(e.target.value)} />
        <button
          onClick={() => {
            if (!name.trim() || years === '') return;
            onChange({ ...value, [name.trim()]: Number(years) });
            setName('');
            setYears('');
          }}
        >
          Agregar
        </button>
      </div>
    </div>
  );
}
function SaveBar({ onSave, flash }: { onSave: () => void | Promise<void>; flash: string }) {
  return (
    <div className="savebar">
      <button onClick={() => void onSave()}>Guardar</button>
      <span className="muted">{flash}</span>
    </div>
  );
}
