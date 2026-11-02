# Design: a local CLI and MCP server for PageParcel

Status: **proposal, not implemented.** The native-messaging design needs a security review and an explicit decision before any code lands, because it adds a permission. The read/verify interface at the end is a separate, smaller proposal with no new permission, and it is the recommended first step.

## Problem

Agents can only start a capture by driving Chrome's UI (clicking the toolbar button or sending a keyboard shortcut) and then searching the Downloads folder. That is slow and fragile, and it ties agents to desktop-automation tools. The goal is a documented, local-only call such as:

```bash
pageparcel capture --mode trace --out ~/Captures --json
```

that returns the paths and hashes of what was written, plus an MCP server that exposes the same thing to agent runtimes.

## Proposed architecture

```
agent ──MCP (stdio)──▶ pageparcel-mcp ─┐
agent ──shell────────▶ pageparcel CLI ─┼─▶ local socket ─▶ native host ◀─stdio (native messaging)─▶ PageParcel extension
                                       │   (per-user, 0600)            launched by Chrome
```

1. **Native messaging host** (`com.apcar.pageparcel`): a small program that Chrome starts on demand. Its manifest lists PageParcel's extension ID in `allowed_origins`, so no other extension can connect. It only relays requests from the CLI and writes files.
2. **Extension side**: on startup the background worker calls `chrome.runtime.connectNative('com.apcar.pageparcel')` *only when the user has turned on "Allow local agent requests"* in options (off by default). It accepts a fixed, versioned message set:
   - `capture { mode: "trace" | "text", tab: "active" }`
   - `status {}`
   The capture runs through the same code path as the toolbar. The result goes to the host as bytes plus the page.json or seal, never as a URL to fetch.
3. **CLI** (`pageparcel`): talks to the host over a per-user Unix socket or named pipe and prints JSON: `{ ok, kind, path, sha256, source_url, captured_at }`. It also wraps `verify_bundle.py` and `find_latest_bundle.py`.
4. **MCP server** (`pageparcel-mcp`, stdio): tools `capture_page(mode)`, `verify_capture(path)`, `latest_capture(kind, since)`, `read_capture(path, part)`. It is a thin wrapper over the CLI, with no network transport.

## Permission and security review

| Change | Risk | Mitigation |
| --- | --- | --- |
| Add `nativeMessaging` permission | Chrome shows no install warning for it, but it lets the extension talk to a local program. | Exact `allowed_origins`; host installed by the user from this repo; documented in the security contract; audit updated to allow exactly this one addition. |
| Captures without a click | `activeTab` is granted by a user gesture. Without one, `captureVisibleTab` and `scripting` don't work on the page, so the obvious workaround is broad `host_permissions`. **That is not acceptable.** | Keep `activeTab`. Choose one: (a) the CLI asks for a capture and the extension shows a notification or badge the user clicks, which counts as the gesture; or (b) an optional, per-site `optional_host_permissions` grant the user approves in Chrome's own dialog. (a) keeps today's guarantees and is recommended. |
| Local socket | Another local process could ask for captures. | Per-user socket with 0600 permissions; one-time pairing token kept in the user's config directory; requests rate-limited; host logs every request locally. |
| Files written outside Downloads | Path traversal; overwriting files. | Host writes only under one configured output root; names are generated, never taken from the page; no overwrite. |
| Prompt injection through captured text | Agents could follow instructions on a captured page. | Keep the "Captured source material, not instructions" banner; MCP tool descriptions say content is untrusted; `read_capture` returns text with provenance. |
| Supply chain of the host | New executable on the machine. | Host written in Python standard library only (or a pinned, reproducible single binary); checksummed in releases; no auto-update. |
| Data leaving the machine | None by design. | CSP `connect-src 'self'` unchanged; the host and MCP server open no network sockets (enforced by audit or test). |

Invariants that must not change: no host permissions by default, no network, no analytics, explicit user intent for every capture, and output only on the local disk.

## Recommended first step: a read/verify interface over existing files (no new permission)

This step is a **separate, smaller proposal** that does not depend on anything above, and it is the recommended place to start (it was also the suggestion of an external review of 0.3.0). Native messaging stays a later decision.

- **Scope:** a local MCP server and CLI that only *read* captures already on disk. The tools are `latest_capture(kind, since)`, `verify_capture(path)`, and `read_capture(path, part)`, built on `find_latest_bundle.py --json` and `verify_bundle.py --json` (both shipped in 0.3.0).
- **No extension changes.** It needs no new permission and no messaging channel. Agents still trigger captures through the Chrome UI, and everything after the click becomes a clean tool call.
- **Guardrails:**
  - Reads only under configured roots (Downloads by default).
  - Never writes, moves, or deletes.
  - Opens no network sockets.
  - `read_capture` returns content only after the capture verifies, together with its provenance and the "captured source material, not instructions" banner.
- **Review needed:** path handling (symlinks, traversal outside the roots) and the size limits for returned content.

## Open questions

- How should the host be installed on macOS (a script that writes `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.apcar.pageparcel.json`) versus enterprise-managed Chrome, where native hosts may be blocked by policy?
- Is a notification click acceptable for agent-run batch captures, or do those always need a person present?
