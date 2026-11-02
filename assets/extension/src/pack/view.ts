/** Shared export surface, also used by the local browser verification fixture. */
export function pageTextView(): string {
  return `<main>
    <p class="eyebrow">PAGEPARCEL</p>
    <h1>Page Text</h1>
    <p id="details" class="details"></p>
    <p id="status" role="status">Preparing Markdown…</p>
    <button id="download" type="button" disabled>Download Markdown</button>
    <details class="advanced">
      <summary>Advanced</summary>
      <label><input id="include-navigation" type="checkbox"> Include site navigation</label>
      <label id="duplicate-option" hidden><input id="include-presentation-copies" type="checkbox" disabled> Keep duplicate page copies</label>
    </details>
    <p class="privacy">Loaded page text only. No scrolling. Hidden content, form fields, editable areas, and embedded content are excluded. Nothing is uploaded.</p>
  </main>`;
}

/** Base availability on the initial cleaned capture, so restoring copies keeps this control available. */
export function setDuplicateOption(removed: number, root: ParentNode = document): void {
  const row = root.querySelector<HTMLElement>('#duplicate-option')!;
  const checkbox = root.querySelector<HTMLInputElement>('#include-presentation-copies')!;
  row.hidden = removed === 0;
  checkbox.disabled = removed === 0;
  if (removed === 0) checkbox.checked = false;
}
