import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = name => fs.readFileSync(fileURLToPath(new URL('../src/' + name, import.meta.url)), 'utf8');
const load = () => {
  const store = {};
  const I18n = new Function('module', 'localStorage', 'navigator', 'location', 'document', src('i18n.js') + ';return I18n')(undefined, { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; } }, { language: 'en-US' }, { search: '' }, { documentElement: {}, body: null });
  return I18n;
};

test('Spanish is the source language: text comes back unchanged', () => {
  const I18n = load();
  I18n.add('en', { 'Guardar copia': 'Save copy' });
  assert.equal(I18n.t('Guardar copia'), 'Guardar copia');
});

test('a dictionary translates exact text, fills placeholders and falls back to Spanish', () => {
  const en = load(); en.add('en', { 'Guardar copia': 'Save copy', 'Plano: {name}': 'Plan: {name}', '{n} niveles': '{n} levels' });
  en.init();
  assert.equal(en.lang, 'en');
  assert.equal(en.translate('Guardar copia'), 'Save copy');
  assert.equal(en.translate('Plano: Casa de un nivel'), 'Plan: Casa de un nivel');
  assert.equal(en.translate('2 niveles'), '2 levels');
  assert.equal(en.t('Plano: {name}', { name: 'X' }), 'Plan: X');
  assert.equal(en.translate('Algo sin traducir'), 'Algo sin traducir');
});

test('a Spanish browser keeps Spanish and the stored choice wins', () => {
  const store = { 'bs-lang': 'es' };
  const I18n = new Function('module', 'localStorage', 'navigator', 'location', 'document', src('i18n.js') + ';return I18n')(undefined, { getItem: k => store[k] ?? null, setItem() {} }, { language: 'en-US' }, { search: '' }, { documentElement: {}, body: null });
  I18n.add('en', { 'Guardar': 'Save' });
  I18n.init();
  assert.equal(I18n.lang, 'es');
  assert.equal(I18n.translate('Guardar'), 'Guardar');
});

const english = () => {
  const I18n = new Function('module', 'localStorage', 'navigator', 'location', 'document', src('i18n.js') + ';return I18n')(undefined, { getItem: () => 'en', setItem() {} }, { language: 'en' }, { search: '' }, { documentElement: {}, body: null });
  new Function('I18n', src('lang-en.js'))(I18n);
  I18n.init();
  return I18n;
};
const SAME_IN_BOTH = new Set(['Loft', 'Hotel', 'Queen', 'King', 'Lobby', 'Altar', 'Total', 'Subtotal', 'PDF', 'Visible', 'Color']);
const isNumeric = text => !/[A-Za-zÁÉÍÓÚáéíóúñÑ]{3,}/.test(text.replace(/\b[mu]\b/g, ''));

test('every catalogue, finish, style, size and template name has an English translation', async () => {
  const I18n = english();
  const Catalog = new Function('module', src('catalog.js') + ';return Catalog')(undefined);
  const { Templates } = await import('../mcp/modules.mjs').then(m => ({ Templates: m.Templates }));
  const names = new Set();
  for (const piece of Object.values(Catalog.LIB)) names.add(piece.n);
  for (const [group] of Catalog.LIBGROUPS) names.add(group);
  for (const standard of Object.values(Catalog.STD)) for (const size of standard.sizes || []) names.add(size[0]);
  for (const floor of Catalog.FLOORS) names.add(floor[1]);
  for (const style of Catalog.STYLES) names.add(style[1] || style.n);
  for (const t of Templates.CATALOG) { names.add(t.name); names.add(t.description); names.add(t.category); }
  const missing = [...names].filter(n => typeof n === 'string' && !SAME_IN_BOTH.has(n) && !isNumeric(n) && I18n.translate(n) === n);
  assert.deepEqual(missing, []);
});

test('room names written by the templates have an English translation', async () => {
  const I18n = english();
  const { Agent } = await import('../mcp/modules.mjs');
  const names = new Set();
  for (const t of Agent.call({ state: Agent.blank() }, 'list_templates', {}).result.templates) {
    const env = { state: Agent.blank() };
    Agent.call(env, 'apply_template', { key: t.key, confirm_replace: true });
    for (const level of [env.state, ...(env.state.levels || [])]) {
      for (const floor of (level.layout && level.layout.floors) || []) if (floor.name) names.add(floor.name);
      if (level.name) names.add(level.name);
    }
  }
  const missing = [...names].filter(n => !SAME_IN_BOTH.has(n) && I18n.translate(n) === n);
  assert.deepEqual(missing, []);
});

test('the English dictionary keeps every placeholder of its Spanish key', () => {
  const entries = {};
  new Function('I18n', src('lang-en.js'))({ add: (code, e) => Object.assign(entries, e) });
  const names = text => [...text.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join();
  const broken = Object.entries(entries).filter(([k, v]) => !v.trim() || names(k) !== names(v));
  assert.deepEqual(broken.map(([k]) => k), []);
});
