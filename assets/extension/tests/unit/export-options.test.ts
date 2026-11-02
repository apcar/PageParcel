import { expect, it } from 'vitest';
import { DOMParser } from 'linkedom';
import { pageTextView, setDuplicateOption } from '../../src/pack/view';

it('keeps duplicate recovery under collapsed Advanced and unavailable when no copies were removed', () => {
  const doc = new DOMParser().parseFromString(
    `<html><body>${pageTextView()}</body></html>`,
    'text/html',
  );
  setDuplicateOption(0, doc);
  const row = doc.querySelector('#duplicate-option')!;
  const box = doc.querySelector<HTMLInputElement>('#include-presentation-copies')!;
  expect(row.textContent).toContain('Keep duplicate page copies');
  expect(row.closest('details')?.querySelector('summary')?.textContent).toBe('Advanced');
  expect(row.closest('details')?.hasAttribute('open')).toBe(false);
  expect(row.hasAttribute('hidden')).toBe(true);
  expect(box.disabled).toBe(true);
});
it('offers recovery when copies were removed and leaves it usable while selected', () => {
  const doc = new DOMParser().parseFromString(
    `<html><body>${pageTextView()}</body></html>`,
    'text/html',
  );
  setDuplicateOption(3, doc);
  const box = doc.querySelector<HTMLInputElement>('#include-presentation-copies')!;
  expect(doc.querySelector('#duplicate-option')?.hasAttribute('hidden')).toBe(false);
  expect(box.disabled).toBe(false);
  box.checked = true;
  expect(box.closest('label')?.hasAttribute('hidden')).toBe(false);
});
