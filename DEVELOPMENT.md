# Development timeline and WebMCP delta

This project extends a real salon business and an existing public web presence. The timeline below separates the conventional website and booking foundation from the WebMCP work submitted to the OpenAI WebMCP Challenge 2026.

## Before the challenge implementation

Before the WebMCP layer was added, Marinela Hair Design already operated under its established name, visual identity, services, public price information and appointment workflow at `marinelahairdesign.com`.

## Dated implementation record

| Date (2026) | Shipped work |
|---|---|
| August 25–31 | New production website foundation, protected two-stylist booking flow, dashboard-managed services and hours, public price list, Google Calendar connections, booking e-mail and reminder flow, legal pages, SEO and security controls. |
| September 2 | Booking and calendar hardening, canonical OAuth callback correction and direct price-list discovery from the homepage. |
| September 2–3 | Five native WebMCP tools, live concierge catalog endpoint, dedicated `/concierge` experience, agent-prepared booking review, explicit AI privacy boundary, security documentation and WebMCP regression tests. |
| September 3 | Release-candidate review, challenge submission copy, public-source sanitization, reproducibility audit and final 2:16 public demo preparation. |

The reviewed source snapshot is tied to commit `8fe00dcac2821a3e09630c8e3d0e29044576ddb8`; the final production deployment is Sites version 31. Its release suite contains 35 passing regression, security and WebMCP checks.

## Why this public repository has one commit

The operational production history contains staff login identities, deployment identifiers and private configuration context that do not belong in a public competition repository. The entrant therefore published a single reviewed source snapshot with reserved `example.com` staff/admin identities and no production Sites identifier or secret.

This file is the dated before/after record for judging. The complete WebMCP implementation is directly inspectable in `app/webmcp-site-tools.tsx`, `app/api/concierge/catalog/route.ts`, `app/concierge/`, the booking handoff and the release tests.
