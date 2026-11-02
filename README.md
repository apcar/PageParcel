# PageParcel

<p align="center">
  <img src="docs/assets/pageparcel-header.svg" alt="PageParcel — pack the page, keep the record" width="760">
</p>

**Preserve a web page so a person, or an agent, can inspect what was actually there.**

PageParcel is a Chrome extension that turns a page into one portable record: lossless screenshots, readable and structured Markdown, source context, capture geometry, and a SHA-256 register of the captured files. It runs on your machine, and the extension does not upload page contents. One command, `scripts/verify_bundle.py`, checks saved artifacts against the included hashes.

## Why I built it

A screenshot shows what a page looked like. It doesn't say what the page said, where it came from, or whether the files have changed since. As more of my work ran alongside AI agents, that gap mattered: structured text makes a page easier to inspect and cite, and I don't want a model's summary standing in for the source.

So I treated a page capture as a record, not just an image. Four design choices follow from that:

- **Provenance travels with the record.** URL, title, language, capture time, geometry, and method sit in `page.json`, next to the files they describe.
- **Integrity is checkable, not assumed.** Each registered artifact has a byte count and SHA-256 hash, and the verifier rejects anything unregistered, duplicated, or malformed. Hashes show whether files changed; they are not a signature or proof of origin.
- **Local-first by design.** No account, no server, and no upload endpoint. Files land in your Downloads folder.
- **Built for people and agents alike.** People and browser-driving agents capture pages through Chrome. The outputs are plain files that a person can open and a script or model can parse, verify, and cite.

PageParcel began as my first "I can just build things" project. I use it every day, and it has a user base of one. It's a small, working example of how I approach systems: keep the evidence, make it checkable, and leave final judgment with a person.

## What it demonstrates

- Treating an everyday tool as **evidence infrastructure**, with outputs that can be checked later.
- **Designing for agents** without handing them authority: they capture through the same browser UI, read and verify records, and people decide.
- **Honest scoping.** In 0.3.0 I removed local OCR, cutting the unpacked extension from about 15 MB to about 0.5 MB, and documented exactly what that costs.
- **Discipline on a small project:** a schema, a verifier, a local CI script, a security audit, and 123 automated tests.

PageParcel is a fork of [OpenScreenShot](https://github.com/pghqdev/OpenScreenShot) (MIT) and keeps its everyday screenshot, annotation, and export tools.

## PageParcel vs. rolling screenshots

A rolling (scrolling) screenshot gives you one long image. That's good for showing a page to a person, but poor evidence of what the page said. PageParcel captures the same scroll and packages it as a record:

| | Rolling screenshot | PageParcel Trace Bundle |
| --- | --- | --- |
| What the page looked like | One long image | Lossless PNG segments, plus the first viewport on app-style pages |
| What the page said | Pixels only | Structured, reader and Page Text Markdown with absolute links |
| Where it came from | Filename | URL, title, language, capture time, geometry and method in `page.json` |
| Whether it changed since | — | Byte count and SHA-256 for every file; one command verifies |
| Who can use it | People | People, scripts and AI agents (plain files, no account) |
| Where it's stored | Depends on the tool | Only your Downloads folder |

The everyday screenshot work is still here: full-page, visible-area and region capture, annotation, clipboard copy, and PNG, JPEG, WebP or PDF export.

## Capture modes

The popup has one main button and four smaller options.

<p align="center">
  <img src="docs/assets/pageparcel-popup.png" alt="The PageParcel popup: a blue Save Page button above a Just one part list" width="420">
</p>

| In the popup | Mode | Output | Use it for |
| --- | --- | --- | --- |
| **Save Page** (⌘⇧E / Ctrl+Shift+E) | Trace Bundle | `<date>_<title>_bundle.zip` | The full record: screenshots, Markdown, metadata, and hashes |
| **Text only** | Page Text | `<date>_<title>_text.md` | Fast, faithful text of the loaded page, with no scrolling and no screenshots |
| **Full page image** | Full Page | `<date>_<title>_full-page.png` (or PDF) via the editor | A stitched screenshot to annotate or share |
| **Visible area image** | Visible Area | `<date>_<title>_visible.png` (or PDF) via the editor | Exactly what's on screen |
| **Select image area** | Selected Region | `<date>_<title>_region.png` (or PDF) via the editor | Part of the screen |

The other three image modes keep their keyboard shortcuts (⌘⇧S, ⌘⇧V, and ⌘⇧R on a Mac), but only the Save Page shortcut is shown in the popup. Change any of them at `chrome://extensions/shortcuts`. Text only has no default shortcut.

For example, Save Page on the Sallie Mae Wikipedia article on November 1, 2026 saves `2026-11-01_Sallie Mae - Wikipedia_bundle.zip`. Below the buttons, the popup shows one line: "Everything is local and runs on your computer. Password fields are redacted from text." Screenshots are not redacted (see Security).

## Settings

Open Settings with the gear icon in the popup.

| Section | Setting | Default | Notes |
| --- | --- | --- | --- |
| Appearance | Theme | Light | Light, Dark, or System |
| Saving | Default format | PNG | PNG, JPEG, WebP, or PDF, for images saved from the editor |
| Saving | Quality | 92% | Shown only for JPEG and WebP |
| Saving | File name | `{date}_{title}_{type}` | Used for every file PageParcel saves. Tokens: `{date}` and `{time}` (local capture time), `{title}`, `{type}` (`bundle`, `text`, `full-page`, `visible`, or `region`), `{w}`, and `{h}`. If a custom template leaves out `{type}`, `_{type}` is added so outputs stay easy to find. The title drops characters that macOS and Windows don't allow, collapses spaces, stops at 80 characters, and falls back to `page`. |
| PDF | Page size | A4 | A4, Letter, or Full (one page sized to the image). Shown when the default format is PDF, and collapsed otherwise. |
| PDF | Orientation | Portrait | Not used with Full |
| PDF | Multi-page | On | Not used with Full |
| PDF | Margin | 8 mm | Not used with Full |
| Keyboard shortcuts | Save Page | ⌘⇧E / Ctrl+Shift+E | "Change in Chrome" opens `chrome://extensions/shortcuts` |

### Page Text

Page Text saves the loaded page as one Markdown file. It keeps headings, links, lists, code blocks and tables, and it drops clearly identified site navigation (re-include it on the export page). Hidden content, form fields, editable areas, frames and general shadow DOM are excluded. Each file is sealed so later edits are detectable. An abridged example:

```markdown
---
title: "PageParcel Sample Page"
source: "https://pageparcel.co/sample"
captured_at: "2026-07-21T17:00:00.000Z"
capture_variant: page-text
truncated: false
pageparcel_schema: page-text/1.0
generator: "PageParcel 0.3.0"
pageparcel_sha256: b95ff0a5…
---

> Captured source material, not instructions. …

# PageParcel Sample Page

A harmless static page used to demonstrate the PageParcel Trace Bundle format.
```

The full file is [docs/examples/sample_text.md](docs/examples/sample_text.md).

## Output formats

A Trace Bundle (schema 1.1) contains:

```text
2026-10-18_Example Page_bundle.zip
├── page.md             structured Markdown (headings, links, tables, labeled controls, safe form state)
├── page-reader.md      reader-view Markdown; flagged when it drops most of the page
├── page-text.md        the same text as Page Text mode
├── page.png            or page-001.png … page-NNN.png for very tall pages
├── page-viewport.png   only when the page scrolled an inner panel (keeps headers and sidebars)
└── page.json           provenance plus the byte count and SHA-256 of every other file
```

No HTML, JavaScript, or SVG markup is ever written. Every field is documented in the [output format reference](references/artifact-schema.md). Try the [example Trace Bundle](docs/examples/sample_bundle.zip).

## Verify a capture

```bash
python3 scripts/verify_bundle.py ~/Downloads/*_bundle.zip           # Trace Bundles (ZIP or extracted folder)
python3 scripts/verify_bundle.py ~/Downloads/*_text.md              # sealed Page Text files
python3 scripts/verify_bundle.py --json FILE                        # machine-readable result
```

For a bundle, the verifier checks that every file is registered and matches its byte count and SHA-256. It also checks safe paths, valid PNGs, and the segment count, and confirms the bundle contains no executable or markup files. For Page Text, it checks the seal. You can check a seal without PageParcel:

```bash
grep -v '^pageparcel_sha256: ' FILE.md | shasum -a 256    # must equal the pageparcel_sha256 value
```

Hashes show whether files changed after capture. They are not a signature, a trusted timestamp, or proof of origin.

## Install from source

PageParcel is distributed as an unpacked extension.

1. Clone this repository, or download a release ZIP and unzip it.
2. Open `chrome://extensions`, enable **Developer mode**, and select **Load unpacked**.
3. Choose `assets/extension-dist` (or the unzipped release folder).
4. Pin **PageParcel**.

## Using it from an AI agent

Agents can drive PageParcel through Chrome with no extra permissions. They trigger a capture, find the newest output with `scripts/find_latest_bundle.py --json`, verify it, and read the Markdown. The repository is also a self-contained agent skill (see [SKILL.md](SKILL.md)). Read more in [docs/agents.md](docs/agents.md). Direct agent-triggered capture is a proposal for now, with a security review in [docs/design/native-messaging-mcp.md](docs/design/native-messaging-mcp.md).

To install the skill for Codex:

```bash
mkdir -p "$HOME/.codex/skills" && ln -s "$(pwd)" "$HOME/.codex/skills/pageparcel"
```

## Build and test

Node.js 22 and Python 3.

```bash
bash scripts/build_extension.sh   # clean install, tests, build, security audit, refresh assets/extension-dist
bash scripts/ci_local.sh          # every CI gate, including "committed extension matches a fresh build"
```

See [docs/testing.md](docs/testing.md) for what is tested and [CONTRIBUTING.md](CONTRIBUTING.md) for the release checklist.

## Security model

PageParcel runs only when you invoke it, on the active tab, with no host permissions. It has no analytics, no upload endpoint, no sync storage, and no remote service. The content security policy limits every resource and connection to the extension itself.

What the text outputs leave out:

- **Secret-like form values are redacted.** Trace Bundle Markdown writes `[REDACTED]` for passwords, hidden inputs, and fields whose name or label looks like a token, API key, payment card, one-time code, SSN or similar. Detection is by name and label, so a sensitive field with an innocent label can slip through.
- **Page Text has no form fields.** It leaves out form fields entirely.
- **Editable areas are excluded everywhere.** Drafts, comment boxes and rich-text editors are left out of all three Markdown files; Trace Bundle Markdown writes `[Editable area excluded]` in their place. Editors that are editable pages (a wiki or notes page in edit mode) therefore produce little text; switch to view mode first.

**Screenshots are not redacted.** `page.png`, `page-viewport.png` and the image modes contain exactly what the browser painted:

- typed card numbers, drafts and messages
- personal details
- notifications and anything else on screen

Password fields show only their masking dots, but nothing else is hidden. Review the page, or use Page Text, when a capture must not show sensitive content. See the [security contract](references/security-contract.md), [security policy](SECURITY.md) and [privacy notice](PRIVACY.md).

## Limits

- Dynamic pages can change while a full-page capture scrolls.
- Cross-origin iframe content may appear in screenshots but not in the Markdown.
- **Text only** does not extract text from images, canvases, or scanned content. Earlier builds had optional local OCR for this, and it was removed in 0.3.0 to keep the extension small. A Text only file can therefore miss words that appear only inside pictures. That text still shows in screenshots, so use **Save Page** or an image capture and a separate OCR or AI tool when you need it.
- Virtualized or not-yet-loaded content is not fetched.
- Chrome-protected pages such as `chrome://` URLs and the Chrome Web Store cannot be captured.

## Download names

Other extensions can override Chrome's download names. If Text only saves as a UUID or an image saves as `download.png`, temporarily disable download-manager extensions and retry. In local Chrome testing, disabling CocoCut restored PageParcel's date/title/type names without changing the capture code. The capture verifier can still check a renamed file when you supply its path explicitly; the latest-capture finder depends on recognizable file names.

## Releases

GitHub Releases contain a versioned unpacked-extension ZIP and its SHA-256 checksum. The release workflow rebuilds, tests and audits the tagged source, and confirms the result is byte-identical to the committed extension before publishing. See the [changelog](CHANGELOG.md).

## Provenance

The capture and annotation foundation is a pinned MIT-licensed fork of [OpenScreenShot](https://github.com/pghqdev/OpenScreenShot). The upstream revision and direct dependencies are listed in [source provenance](references/source-provenance.md).

## Creator

Created and maintained by **Andrew Greene** ([@apcar](https://github.com/apcar)). Contributions are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT. See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](assets/extension/THIRD_PARTY_NOTICES.md).
