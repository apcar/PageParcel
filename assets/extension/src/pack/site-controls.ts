/** Known MediaWiki UI chrome; leave article navigation and licensing/attribution intact. */
export function removeKnownSiteControls(doc: Document): number {
  const controls = doc.querySelectorAll(
    '#p-associated-pages.mw-portlet-associated-pages, #p-views.mw-portlet-views, nav.vector-appearance-landmark[aria-label="Appearance"], footer.mw-footer #footer-places, footer.mw-footer #footer-icons',
  );
  let count = 0;
  for (const control of Array.from(controls)) {
    if (!doc.body?.contains(control)) continue;
    control.remove();
    count++;
  }
  return count;
}
