/** Remove only verified off-canvas export/share copies; never deduplicate ordinary prose. */
export function removePresentationCopies(doc: Document): number {
  const selector = '[data-pageparcel-presentation-copy="true"]';
  const normalize = (text: string) => text.replace(/\s+/g, ' ').trim();
  const textOf = (node: Node, excludeCopies: boolean): string => {
    if (node.nodeType === 3) return node.textContent || '';
    if (node.nodeType !== 1) return '';
    const el = node as Element;
    if (el.matches('button, img') || (excludeCopies && el.matches(selector))) return '';
    return Array.from(el.childNodes)
      .map((child) => textOf(child, excludeCopies))
      .join(' ');
  };
  let removed = 0;
  for (const copy of Array.from(doc.querySelectorAll(selector))) {
    if (!doc.body?.contains(copy)) continue;
    // Complex structured content is retained rather than flattened for comparison.
    if (
      copy.matches(
        'table, pre, code, math, canvas, iframe, input, textarea, select, video, audio',
      ) ||
      copy.querySelector(
        'table, pre, code, math, canvas, iframe, input, textarea, select, video, audio',
      )
    )
      continue;
    const scope =
      copy.parentElement?.closest('section, article, [role="region"]') || copy.parentElement;
    if (!scope) continue;
    const text = normalize(textOf(copy, false));
    if (text.length < 24 || !normalize(textOf(scope, true)).includes(text)) continue;
    const outside = Array.from(scope.querySelectorAll('*')).filter((el) => !el.closest(selector));
    const reference = (el: Element): string =>
      JSON.stringify([
        el.tagName,
        el.getAttribute('href'),
        el.getAttribute('title'),
        el.getAttribute('alt'),
        el.getAttribute('aria-label'),
        normalize(textOf(el, false)),
      ]);
    // Distinct links, named images, controls, headings, or captions block removal.
    const significant = Array.from(
      copy.querySelectorAll(
        'a, button, img[alt], img[aria-label], h1, h2, h3, h4, h5, h6, figcaption',
      ),
    );
    if (copy.matches('a, button, img[alt], img[aria-label], h1, h2, h3, h4, h5, h6, figcaption'))
      significant.unshift(copy);
    if (
      significant.some((el) => {
        if (el.tagName === 'IMG' && !el.getAttribute('alt') && !el.getAttribute('aria-label'))
          return false;
        return !outside.some((other) => reference(other) === reference(el));
      })
    )
      continue;
    copy.remove();
    removed++;
  }
  return removed;
}
