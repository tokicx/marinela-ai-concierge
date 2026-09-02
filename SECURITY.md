# Security policy

## Reporting a vulnerability

Please use the repository’s private security-advisory feature. Do not publish a vulnerability, credential, personal record, calendar identifier or exploit procedure in a public issue.

Include the affected route, expected and observed behavior, reproduction steps that do not use real client data, and the security impact. Reports involving active abuse or exposed credentials should be marked urgent.

## Safe testing boundaries

- Do not create test appointments on the production salon calendar.
- Do not send test e-mail to a third party or enumerate customer data.
- Do not attempt to access `/admin`, connected calendars or staff accounts.
- Do not bypass Turnstile, origin checks, rate limits or the human confirmation step.
- Do not upload or store health information, credentials or real client details.

The WebMCP surface is intentionally limited to public catalog data, availability checks and preparation of a visible booking review. It does not expose booking creation, cancellation, rescheduling, customer lookup or administration.
