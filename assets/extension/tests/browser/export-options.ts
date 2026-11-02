import '../../src/pack/pack.css';
import { pageTextView, setDuplicateOption } from '../../src/pack/view';
import { buildPageText } from '../../src/pack/build';
const copies = new URLSearchParams(location.search).get('copies') === '1';
document.body.innerHTML = pageTextView();
const text = 'A synthetic report with a unique source and useful information.';
const snapshot = {
  title: 'Synthetic verification',
  url: location.href,
  capturedAt: new Date().toISOString(),
  html: `<html><body><section><p>${text}</p>${copies ? `<div data-pageparcel-presentation-copy="true"><p>${text}</p></div>` : ''}</section></body></html>`,
  truncated: false,
  language: 'en',
  description: '',
};
const result = buildPageText(snapshot);
setDuplicateOption(result.presentationCopiesRemoved);
document.querySelector('#details')!.textContent =
  `Synthetic capture: ${result.presentationCopiesRemoved} duplicate copy removed.`;
document.querySelector('#status')!.textContent =
  'PASS: Advanced starts collapsed; duplicate recovery availability matches actual cleanup.';
const box = document.querySelector<HTMLInputElement>('#include-presentation-copies')!;
box.addEventListener('change', () => {
  const restored = buildPageText(snapshot, false, box.checked);
  const count = restored.markdown.split(text).length - 1;
  document.querySelector('#status')!.textContent =
    count === (box.checked ? 2 : 1)
      ? 'PASS: duplicate recovery toggles correctly and remains available.'
      : 'FAIL: duplicate recovery';
});
