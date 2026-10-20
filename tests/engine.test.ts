import { describe, expect, it } from 'vitest';
import { decide, type EngineCtx } from '../src/engine/decide';
import { parseRange } from '../src/engine/options';
import { DEFAULT_PROFILE } from '../src/shared/defaults';
import { detectLang } from '../src/shared/normalize';
import { questionSimilarity } from '../src/shared/similarity';
import type { BankEntry, FieldInfo, FieldKind } from '../src/shared/types';

const profile = {
  ...DEFAULT_PROFILE,
  firstName: 'José',
  lastName: 'Pérez',
  email: 'jose@example.com',
  phone: '1155551234',
  city: 'Buenos Aires',
  location: 'Buenos Aires, Argentina',
  englishLevel: 'advanced' as const,
  noticePeriod: '2 semanas',
  noticeDays: 15,
  salary: [{ currency: 'USD' as const, amount: 3000, period: 'month' as const }],
  workModes: ['remote' as const, 'hybrid' as const],
  willingToRelocate: false,
  requiresSponsorship: null,
  authorizedCountries: ['Argentina'],
  totalYears: 5,
  techYears: { React: 4, 'Node.js': 3, TypeScript: 3, 'React Native': 1 },
};

const bank: BankEntry[] = [
  {
    id: 'b1', question: 'Are you comfortable commuting to this job\'s location?', kind: 'radio',
    options: ['Yes', 'No'], answer: 'Yes', reuse: 'direct', createdAt: 0, updatedAt: 0, uses: 0,
  },
  {
    id: 'b2', question: "Have you completed the following level of education: Bachelor's Degree?", kind: 'radio',
    options: ['Yes', 'No'], answer: 'No', reuse: 'direct', createdAt: 0, updatedAt: 0, uses: 0,
  },
];

const ctx: EngineCtx = { profile, bank, claudeEnabled: true, hasCv: true };
const YN = ['Yes', 'No'];

function f(label: string, kind: FieldKind = 'text', options?: string[]): FieldInfo {
  return { key: 'k', kind, label, options, required: true, hasValue: false, lang: detectLang(label) };
}
const text = (d: ReturnType<typeof decide>) => (d.fill?.type === 'text' ? d.fill.text : d.fill);

describe('reglas de perfil', () => {
  it('nombre, apellido, email, teléfono (ES y EN)', () => {
    expect(text(decide(f('First name'), ctx))).toBe('José');
    expect(text(decide(f('Apellido(s)'), ctx))).toBe('Pérez');
    expect(text(decide(f('Dirección de correo electrónico', 'email'), ctx))).toBe('jose@example.com');
    expect(text(decide(f('Mobile phone number', 'tel'), ctx))).toBe('1155551234');
  });

  it('código de país en select', () => {
    const d = decide(f('Phone country code', 'select', ['Select an option', 'Argentina (+54)', 'Chile (+56)']), ctx);
    expect(d).toMatchObject({ status: 'exact', fill: { type: 'option', index: 1 } });
  });

  it('años por tecnología: exacto, más específico gana, desconocido queda vacío', () => {
    expect(decide(f('How many years of work experience do you have with React?'), ctx)).toMatchObject({ status: 'exact', fill: { text: '4' } });
    expect(decide(f('¿Cuántos años de experiencia tenés con Node.js?'), ctx)).toMatchObject({ status: 'exact', fill: { text: '3' } });
    expect(decide(f('How many years of experience do you have with React Native?'), ctx)).toMatchObject({ fill: { text: '1' } });
    expect(decide(f('How many years of work experience do you have with Kubernetes?'), ctx).status).toBe('missing');
    expect(decide(f('How many years of work experience do you have?'), ctx)).toMatchObject({ status: 'exact', fill: { text: '5' } });
  });

  it('años como sí/no con mínimo', () => {
    const d = decide(f('Do you have at least 3 years of experience with TypeScript?', 'radio', YN), ctx);
    expect(d).toMatchObject({ status: 'exact', fill: { index: 0 } });
    const d2 = decide(f('Do you have 5+ years of experience in Node.js?', 'radio', YN), ctx);
    expect(d2).toMatchObject({ status: 'exact', fill: { index: 1 } });
  });

  it('años como select de rangos', () => {
    const d = decide(f('Years of experience with React', 'select', ['Select', '0-1', '1-3', '4-6', '7+']), ctx);
    expect(d).toMatchObject({ status: 'exact', fill: { index: 3 } });
  });

  it('inglés en select con sinónimos → amarillo', () => {
    const d = decide(
      f('What is your level of proficiency in English?', 'select', ['Select an option', 'None', 'Conversational', 'Professional', 'Native or bilingual']),
      ctx,
    );
    expect(d).toMatchObject({ status: 'inferred', fill: { index: 3 } });
  });

  it('salario: moneda, conversión anual (amarillo) y moneda faltante', () => {
    expect(decide(f('Expected salary (USD)', 'number'), ctx)).toMatchObject({ status: 'exact', fill: { text: '3000' } });
    expect(decide(f('Pretensión salarial bruta anual en USD', 'number'), ctx)).toMatchObject({ status: 'inferred', fill: { text: '36000' } });
    expect(decide(f('Pretensión salarial en pesos', 'number'), ctx).status).toBe('missing');
  });

  it('relocación y sponsoreo (sin dato → vacío, nunca inventa)', () => {
    expect(decide(f('Are you willing to relocate?', 'radio', YN), ctx)).toMatchObject({ status: 'exact', fill: { index: 1 } });
    expect(decide(f('Will you now or in the future require visa sponsorship?', 'radio', YN), ctx).status).toBe('missing');
  });

  it('modalidad sí/no', () => {
    expect(decide(f('Are you comfortable working in a remote setting?', 'radio', YN), ctx)).toMatchObject({ status: 'exact', fill: { index: 0 } });
    expect(decide(f('Are you comfortable working in an onsite setting?', 'radio', YN), ctx)).toMatchObject({ status: 'exact', fill: { index: 1 } });
  });

  it('consentimientos se saltean; demográficas quedan vacías', () => {
    expect(decide(f('Follow Acme to stay up to date with their page.', 'checkbox'), ctx).status).toBe('skip');
    expect(decide(f('Gender', 'select', ['Select', 'Male', 'Female', 'Decline']), ctx).status).toBe('missing');
  });

  it('CV en input file', () => {
    expect(decide(f('Upload resume', 'file'), ctx)).toMatchObject({ status: 'exact', fill: { type: 'file' } });
    expect(decide(f('Upload resume', 'file'), { ...ctx, hasCv: false }).status).toBe('missing');
  });
});

describe('banco de respuestas', () => {
  it('misma pregunta → exacto; redacción parecida → amarillo', () => {
    // misma pregunta: tu respuesta guardada gana sobre la interpretación del perfil
    expect(decide(f("Are you comfortable commuting to this job's location?", 'radio', YN), ctx)).toMatchObject({ status: 'exact', source: 'bank' });
    const d = decide(f("Have you completed a Bachelor's Degree?", 'radio', ['Yes', 'No']), ctx);
    expect(d).toMatchObject({ source: 'bank', status: 'inferred', fill: { index: 1 } });
  });

  it('respuesta "Yes" guardada sirve en un radio en español', () => {
    const d = decide(f("Are you comfortable commuting to this job's location?", 'radio', ['Sí', 'No']), ctx);
    expect(d).toMatchObject({ fill: { index: 0 } });
  });

  it('sin regla ni banco → Claude (o vacío si está apagado)', () => {
    expect(decide(f('Why do you want to work at Acme?', 'textarea'), ctx).status).toBe('needs-ai');
    expect(decide(f('Why do you want to work at Acme?', 'textarea'), { ...ctx, claudeEnabled: false }).status).toBe('missing');
  });
});

describe('utilidades', () => {
  it('rangos', () => {
    expect(parseRange('5+ years')).toEqual([5, Infinity]);
    expect(parseRange('Menos de 1 año')![1]).toBeLessThan(1);
    expect(parseRange('1 a 3 años')).toEqual([1, 3]);
  });
  it('similitud: parecidas > distintas', () => {
    const a = questionSimilarity('Do you have a valid driver\'s license?', 'Do you have a valid work permit?');
    const b = questionSimilarity('Are you comfortable commuting to this job\'s location?', 'Are you comfortable commuting to our office?');
    expect(b).toBeGreaterThan(a);
  });
});

describe('perfil real', () => {
  it('celular argentino internacional lleva el 9; local no', () => {
    const p = { ...profile, phone: '1166906281' };
    const c = { ...ctx, profile: p };
    expect(text(decide(f('Phone number (international format)', 'tel'), c))).toBe('+54 91166906281');
    expect(text(decide(f('Mobile phone number', 'tel'), c))).toBe('1166906281');
  });
  it('SQL Server gana sobre SQL; React Router sobre React', () => {
    const p = { ...profile, techYears: { React: 3, 'React Router': 3, SQL: 3, 'SQL Server': 3, Podman: 1, Magento: 1 } };
    const c = { ...ctx, profile: p };
    expect(decide(f('How many years of experience do you have with SQL Server?'), c)).toMatchObject({ status: 'exact', fill: { text: '3' } });
    expect(decide(f('How many years of experience do you have with Podman?'), c)).toMatchObject({ status: 'exact', fill: { text: '1' } });
    expect(decide(f('Do you have at least 2 years of experience with Magento?', 'radio', YN), c)).toMatchObject({ fill: { index: 1 } });
  });
});

describe('textos del perfil', () => {
  const p = { ...profile, headline: 'Full Stack | React', summary: 'Resumen X', coverLetter: 'Carta X', githubUrl: 'https://github.com/x' };
  const c = { ...ctx, profile: p };
  it('headline, summary exactos; carta en amarillo', () => {
    expect(decide(f('Headline'), c)).toMatchObject({ status: 'exact', fill: { text: 'Full Stack | React' } });
    expect(decide(f('Summary', 'textarea'), c)).toMatchObject({ status: 'exact', fill: { text: 'Resumen X' } });
    expect(decide(f('Cover letter', 'textarea'), c)).toMatchObject({ status: 'inferred', fill: { text: 'Carta X' } });
  });
  it('headline cae al puesto actual; portfolio cae a GitHub en amarillo', () => {
    expect(decide(f('Headline'), { ...ctx, profile: { ...profile, currentTitle: 'Arquitecto' } })).toMatchObject({ fill: { text: 'Arquitecto' } });
    expect(decide(f('Please include your portfolio, if not then website(s) you have built', 'textarea'), c))
      .toMatchObject({ status: 'inferred', fill: { text: 'https://github.com/x' } });
  });
  it('preguntas de tests de la empresa quedan vacías (sin Claude)', () => {
    const d = decide(f('Have you completed the Culture Index survey? (link is in the job requirements above)', 'radio', ['Yes', 'No']), { ...c, claudeEnabled: false });
    expect(d.status).toBe('missing');
  });
});
