# Security Policy

## Supported Versions

Only the latest release of FlipOff receives security fixes.

| Version | Supported |
| ------- | --------- |
| Latest  | ✓         |
| Older   | ✗         |

## Reporting a Vulnerability

If you discover a security vulnerability, please **do not open a public GitHub issue**. Instead, report it privately so it can be addressed before public disclosure.

Please include:

- A description of the vulnerability and its potential impact
- Steps to reproduce or a proof-of-concept
- Any suggested remediation, if you have one

You can expect an acknowledgement within **48 hours** and a status update within **7 days**.

## Scope

FlipOff is a self-hosted application. The security model assumes you are running it on a trusted private network or behind appropriate access controls (reverse proxy, VPN, firewall, etc.). As a result:

- Vulnerabilities that require physical or administrative access to the host are out of scope.
- Vulnerabilities in your deployment infrastructure (e.g. an exposed Docker socket) are out of scope.
- In-scope issues include: path traversal, XSS, CSRF, admin session handling, and insecure defaults that could affect a standard deployment.

The display itself is intentionally unauthenticated — anyone who can reach the server can watch a board. Only the admin dashboard (`/admin`) and the write side of the API are password-protected.

## Disclosure Policy

Once a fix is available and released, the vulnerability will be disclosed publicly with appropriate credit to the reporter (unless anonymity is requested).
