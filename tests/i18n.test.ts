import { describe, expect, it } from 'vitest';
import { translations } from '../i18n';

describe('translations', () => {
  const ref = Object.keys(translations.en).sort();
  for (const [code, t] of Object.entries(translations)) {
    it(`${code} has every key the English UI has`, () => {
      const missing = ref.filter((k) => !(k in t));
      expect(missing).toEqual([]);
    });
  }
});
