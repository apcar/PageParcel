async function main(): Promise<void> {
  if (location.hash.startsWith('#text=')) {
    document.title = 'PageParcel Page Text';
    const { pageTextView } = await import('../pack/view');
    document.body.innerHTML = pageTextView();
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
