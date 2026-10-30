import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveLocale, translate } from '../src/i18n/core.ts';

test('a supported browser language is picked, regional tags by their base', () => {
  assert.equal(resolveLocale('es'), 'es');
  assert.equal(resolveLocale('es-MX'), 'es');
  assert.equal(resolveLocale('en-GB'), 'en');
});

test('other languages of Spain fall back to Spanish', () => {
  for (const tag of ['ca', 'ca-ES', 'ca-ES-valencia', 'eu-ES', 'gl', 'ast', 'an', 'oc-ES']) assert.equal(resolveLocale(tag), 'es', tag);
  assert.equal(resolveLocale('oc-FR'), 'en');
});

test('unsupported languages fall back to English', () => {
  assert.equal(resolveLocale('de-DE'), 'en');
  assert.equal(resolveLocale(), 'en');
});

test('the first supported language in preference order wins', () => {
  assert.equal(resolveLocale('de-DE', 'es-ES', 'en'), 'es');
  assert.equal(resolveLocale('fr', 'en-US', 'ca'), 'en');
  assert.equal(resolveLocale('ca-ES', 'en'), 'es');
});

test('Spanish plurals and interpolation', () => {
  assert.equal(translate('es', 'importingFiles', { count: 1 }), 'Importando 1 archivo…');
  assert.equal(translate('es', 'importingFiles', { count: 3 }), 'Importando 3 archivos…');
  assert.equal(translate('es', 'convert', { value1: 'HEVC' }), 'Convertir HEVC');
});
