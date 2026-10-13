# Security Policy

## Supported versions

Falco is pre-1.0. Security fixes land on the latest release and on `master`.

| Version | Supported |
|---------|-----------|
| 0.1.x   | Yes       |

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

Report them privately through GitHub Security Advisories:
[Report a vulnerability](https://github.com/Salto-Angel-Tech/Falco-Swift/security/advisories/new)
(repository **Security** tab → **Report a vulnerability**).

Include what you found, how to reproduce it, and its impact. We aim to acknowledge reports
within 5 business days and will keep you updated until a fix is released. With your
permission, we will credit you in the advisory.

## Scope notes

The Falco HTTP service has **no authentication** and is meant to run on a trusted network or
behind your own gateway. Request size limits (`FALCO_MAX_*`) reduce, but do not remove, the
risk of resource exhaustion. Exposing the service directly to the internet is out of scope.
