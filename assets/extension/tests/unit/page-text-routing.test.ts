import { afterEach, expect, it, vi } from 'vitest';
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});
it('captures text without screenshots or scrolling and opens its own export', async () => {
  let listener: (message: unknown) => void = () => {};
  const executeScript = vi
    .fn()
    .mockResolvedValue([{ result: { title: 'Fixture', html: '<html><body>Text</body></html>' } }]);
  const create = vi.fn().mockResolvedValue({});
  const set = vi.fn().mockResolvedValue(undefined);
  const screenshot = vi.fn();
  const sendMessage = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('chrome', {
    runtime: {
      getURL: (s: string) => `chrome-extension://fixture/${s}`,
      onInstalled: { addListener: vi.fn() },
      onMessage: {
        addListener: (fn: typeof listener) => {
          listener = fn;
        },
      },
      sendMessage,
    },
    commands: { onCommand: { addListener: vi.fn() } },
    tabs: {
      query: vi.fn().mockResolvedValue([{ id: 1, url: 'https://example.test' }]),
      create,
      captureVisibleTab: screenshot,
    },
    scripting: { executeScript },
    storage: { local: { set } },
  });
  await import('../../src/background/index');
  listener({ type: 'CAPTURE_REQUEST', mode: 'page-text' });
  await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledWith({ type: 'TEXT_COMPLETE' }));
  expect(executeScript).toHaveBeenCalledTimes(1);
  expect(executeScript.mock.calls[0][0].args).toEqual([true]);
  expect(screenshot).not.toHaveBeenCalled();
  const key = Object.keys(set.mock.calls[0][0])[0];
  expect(key).toMatch(/^pageparcel:text:/);
  expect(create).toHaveBeenCalledWith({
    url: `chrome-extension://fixture/src/editor/index.html#text=${encodeURIComponent(key)}`,
  });
});
