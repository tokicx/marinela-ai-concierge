# OpenAI WebMCP Challenge submission packet

## Identity

- Entrant: **Ivan Tokić**
- Entry type: **Individual**
- Project: **Marinela AI Concierge**
- Live URL: <https://www.marinelahairdesign.com/concierge>
- Tagline: **Natural-language salon guidance with live availability and a human-confirmed booking handoff.**

## Description

Choosing a salon service is often the hardest part of booking. Clients know the result they want, but may not know whether to choose balayage, highlights, toning, a treatment, or a combination. They then move between a price list, messages, phone calls, and a booking calendar before securing an appointment.

Marinela AI Concierge makes the website of an independent salon in Solin, Croatia, safely understandable and actionable for AI agents. A client can describe their goal, budget, preferred stylist, and timing in natural language. The agent retrieves factual information from the salon’s live systems instead of guessing from page text or manipulating the visual interface.

The WebMCP layer exposes exactly five narrowly scoped tools: `get_salon_information` provides location, policies, and opening information; `find_bookable_services` discovers suitable bookable services with their duration; `search_price_list` returns current public price rows; `check_appointment_availability` returns only currently verified slots; and `prepare_booking_for_confirmation` opens the salon’s visible first-party booking form with the non-sensitive choices preselected.

The safety boundary is intentional. The first four tools are read-only. `prepare_booking_for_confirmation` does not create an appointment and its schema requests only service, stylist, date, and time. The human must personally enter their name and contact details, acknowledge the privacy notice, complete Cloudflare Turnstile, review the complete summary, and click the final confirmation button. No WebMCP tool can confirm, look up, cancel, or reschedule a reservation. When the human submits the booking form, the existing server independently revalidates service duration, working hours, local bookings, and connected calendar availability, preventing stale-slot and double-booking errors. If availability cannot be verified, the booking fails closed.

This is a strong WebMCP use case because it combines conversational discovery with live, structured business data while preserving human control over identity and consequential actions. Clients no longer need to understand salon terminology or manually correlate prices, durations, staff, and calendars. They receive grounded recommendations and available options, then cross a clear boundary into a familiar, accessible form for the private transaction. After a real client confirms, the existing system sends a branded e-mail, calendar attachment and reminder.

The salon brand, public website and appointment workflow existed before this WebMCP implementation. During the submission period, the new production experience was meaningfully extended with these five WebMCP tools, the dedicated Concierge experience, human-confirmation safety boundary, documentation, and tests. The dated before/after record in [DEVELOPMENT.md](DEVELOPMENT.md) distinguishes the WebMCP work while this public source snapshot remains safely squashed and anonymized. The pattern can be reused by salons and other appointment-based small businesses that want agent assistance without surrendering privacy or transaction control.

## Final public demo — 2:16

| Approx. time | Screen | English narration focus |
|---|---|---|
| 0:00–0:12 | Homepage, then `/concierge` | The client knows the desired result but not necessarily the correct service; the concierge converts natural-language intent into grounded guidance. |
| 0:12–0:26 | Agent browser discovers five tools | The real salon website exposes exactly five narrowly scoped WebMCP tools without exposing private customer data. |
| 0:26–0:48 | Natural balayage request; live service and price results | The agent finds the bookable service and reads the current public price information from separate structured sources rather than guessing. |
| 0:48–1:03 | Bookable service and related informational price rows | Service identity and price information remain distinct, preventing invented bookable IDs or unsupported total-price guarantees. |
| 1:03–1:21 | Mia availability lookup | The availability tool checks actual scheduling rules, existing appointments and connected calendars, and fails closed when a slot cannot be verified. |
| 1:21–1:38 | `prepare_booking_for_confirmation` and visible review | The selected slot is rechecked and only the non-sensitive choices are prepared; the result explicitly keeps `bookingCreated: false`. |
| 1:38–2:03 | Empty personal-data fields, privacy acknowledgement, Turnstile and final button | The agent stops before the consequential action. The human enters personal information, accepts the privacy notice, completes the anti-bot check and confirms personally. |
| 2:03–2:16 | Architecture and safety summary | The project demonstrates a reusable path from ambiguous intent to verified business data and a human-controlled transaction boundary. |

Recording rules:

- Use 1080p, clear English narration and subtitles; remain below three minutes.
- Use no real client contact data and create no production appointment.
- Hide dashboard data, bookmarks, notifications, OAuth identifiers and all credentials.
- Show only capabilities that are actually shipped.

Demo evidence was captured on 2 September 2026 from the production WebMCP tools. The recording invokes service discovery, price search, live availability, and the preparation handoff. The final human confirmation is deliberately not submitted, and no appointment or customer record is created.

## Suggested judge prompts

First turn:

> I want a soft, natural-looking balayage and can spend up to €200. I prefer Mia. Please check the salon’s current service and price information, then show verified times for the next three open working days. Do not prepare or book anything yet.

After the agent returns actual availability, select one of those exact slots:

> Prepare that verified Mia time for my confirmation. Do not create the appointment.
