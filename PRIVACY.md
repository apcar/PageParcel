# Privacy

PageParcel is designed to make web capture understandable and local by default.

## What PageParcel processes

PageParcel processes information only after you invoke it on the active browser tab. Depending on the selected capture mode, that may include:

- pixels visible in the active tab;
- page text and useful document structure;
- the page URL, title, language, description, capture time, and dimensions;
- form labels and values that are safe to preserve; and
- PageParcel preferences such as theme, export format, and filename pattern.

Password fields and values whose descriptors resemble secrets, tokens, authorization credentials, API keys, or payment cards are redacted from generated Markdown. PageParcel cannot reliably remove sensitive information that is already visible in screenshot pixels.

## Where data goes

PageParcel does not send capture data anywhere. It has no analytics, telemetry, advertising SDK, upload service, remote logging, hosted viewer, or account system.

Capture processing occurs inside the Chrome extension. Trace Bundles, screenshots, and exports are written through Chrome's local download mechanism. Temporary capture state is stored in local extension storage and removed after the output is constructed. User preferences remain in local extension storage until the extension is removed or its data is cleared.

The web page itself may communicate with its own servers while it is open in Chrome. PageParcel does not add network requests to that page activity.

## Permissions

PageParcel uses Chrome's `activeTab` permission, which grants temporary access only after a user invokes the extension. It does not request persistent access to every website and declares no host permissions.

The complete permission and networking invariants are documented in the [security contract](references/security-contract.md) and enforced by the repository's security audit.

## Your responsibility

Review a page before capturing it. Treat downloaded output according to the sensitivity of the source content, and do not publish or share a Trace Bundle without checking both its Markdown and screenshot files.

## Changes and questions

Material privacy changes will be documented in the changelog and reviewed as security-sensitive changes. Questions may be opened as a GitHub issue. Potential vulnerabilities should be submitted through GitHub's private vulnerability reporting rather than a public issue.

## Optional local OCR

Page Text OCR is off by default and is not a saved preference. It reads each eligible image or canvas’s own pixels without taking a screenshot or fetching its URL. Cross-origin-tainted graphics are skipped. Recognition uses bundled English language data and a local worker, with no remote OCR service. OCR drafts use browser session memory, are removed before recognition, and disappear on browser shutdown; the next OCR capture also prunes abandoned drafts older than five minutes. Recognized text is included in the downloaded Markdown as literal source text, and temporary image buffers are discarded when recognition finishes or fails. The image itself can contain private information, and OCR results can be inaccurate.
