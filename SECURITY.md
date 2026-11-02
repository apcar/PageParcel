# Security policy

## Supported version

Security fixes target the latest version on the default branch while PageParcel is in pre-release development.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting for this repository when available. If private reporting is unavailable, contact the maintainer privately before opening a public issue.

Do not include captured pages, personal data, credentials, tokens, or proprietary content in a public report. A minimal reproduction using a public test page is preferred.

## Security boundary

PageParcel processes captures inside the extension and downloads results locally. It deliberately has no host permissions, analytics, upload service, hosted viewer, or sync storage. See [references/security-contract.md](references/security-contract.md) for the invariants enforced by the project audit.

The extension redacts secret-like form values (passwords, tokens, API keys, payment cards, one-time codes, SSNs and similar) from Markdown, and Page Text omits form fields entirely, but it cannot guarantee removal from screenshot pixels. Users should inspect a page before capture and handle output bundles according to the sensitivity of their contents.
