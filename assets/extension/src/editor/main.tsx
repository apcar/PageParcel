async function main(): Promise<void> {
  if (location.hash.startsWith('#text=')) {
    document.title = 'PageParcel Page Text';
    document.body.innerHTML = `
      <main>
        <p class="eyebrow">PAGEPARCEL</p>
        <h1>Page Text</h1>
        <label><input id="include-navigation" type="checkbox"> Include site navigation</label>
        <label><input id="include-presentation-copies" type="checkbox"> Include presentation copies</label>
        <p id="details" class="details"></p>
        <p id="status" role="status">Preparing Markdown…</p>
        <button id="download" type="button" disabled>Download Markdown</button>
        <p class="privacy">Loaded page text only. No scrolling. Optional OCR reads visible image regions locally; OCR may be inaccurate. Hidden content, form fields, editable areas, and embedded content are excluded. Nothing is uploaded.</p>
      </main>`;
    await import('../pack/text');
    return;
  }
  if (location.hash === '#pack') {
    document.title = 'PageParcel Trace Bundle';
    document.body.innerHTML = `
      <main>
        <p class="eyebrow">PAGEPARCEL</p>
        <h1>Your page is being packed.</h1>
        <p id="details" class="details"></p>
        <p id="status" role="status">Loading capture…</p>
        <button id="download" type="button" disabled>Download again</button>
        <p class="privacy">The screenshot, page text, metadata, hashes, and ZIP are created on this Mac. No capture content is sent to a server.</p>
      </main>`;
    await import('../pack/main');
    return;
  }
  const [{ render }, { App }] = await Promise.all([import('preact'), import('./App')]);
  await import('./editor.css');
  render(<App />, document.getElementById('app')!);
}

void main();
