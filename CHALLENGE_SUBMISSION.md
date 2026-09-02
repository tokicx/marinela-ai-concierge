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

The WebMCP layer exposes exactly five narrowly scoped tools: `get_salon_information` provides location, policies, and opening information; `find_bookable_services` discovers suitable bookable services with their duration; `search_price_list` returns current dashboard-managed price rows; `check_appointment_availability` returns only currently verified slots; and `prepare_booking_for_confirmation` opens the salon’s visible first-party booking form with the non-sensitive choices preselected.

The safety boundary is intentional. The first four tools are read-only. `prepare_booking_for_confirmation` does not create an appointment. The human must personally enter their name and contact details, acknowledge the privacy notice, complete Cloudflare Turnstile, review the complete summary, and click the final confirmation button. No WebMCP tool accepts personal information or can confirm, look up, cancel, or reschedule a reservation. When the human submits the booking form, the existing server independently revalidates service duration, working hours, local bookings, and connected calendar availability, preventing stale-slot and double-booking errors. If availability cannot be verified, the booking fails closed.

This is a strong WebMCP use case because it combines conversational discovery with live, structured business data while preserving human control over identity and consequential actions. Clients no longer need to understand salon terminology or manually correlate prices, durations, staff, and calendars. They receive grounded recommendations and available options, then cross a clear boundary into a familiar, accessible form for the private transaction. After a real client confirms, the existing system sends a branded e-mail, calendar attachment and reminder.

The salon brand, public website and appointment workflow existed before this WebMCP implementation. During the submission period, the new production experience was meaningfully extended with these five WebMCP tools, the dedicated Concierge experience, human-confirmation safety boundary, documentation, and tests. The dated before/after record in [DEVELOPMENT.md](DEVELOPMENT.md) distinguishes the WebMCP work while this public source snapshot remains safely squashed and anonymized. The pattern can be reused by salons and other appointment-based small businesses that want agent assistance without surrendering privacy or transaction control.

## Video storyboard — target 2:35

| Time | Screen | English narration |
|---|---|---|
| 0:00–0:14 | Homepage, then `/concierge` | “Salon clients often know the look they want, but not the exact service they should book. Marinela AI Concierge turns that uncertainty into grounded guidance and a safe booking handoff.” |
| 0:14–0:28 | Agent browser discovers five tools | “We extended a real salon website with exactly five narrowly scoped WebMCP tools. They expose useful business capabilities without exposing private customer data.” |
| 0:28–0:55 | Ask for a subtle warm balayage up to €200; show information, service and price tools | “The client speaks naturally. The agent retrieves salon information, finds relevant bookable services, and checks the live price list. Recommendations remain grounded in current services and prices.” |
| 0:55–1:15 | Agent explains two suitable options | “Instead of forcing the client to understand salon terminology, the agent explains the relevant options using structured results from the website.” |
| 1:15–1:35 | Ask for Mia and a suitable date; show availability result | “The availability tool checks the salon’s real scheduling rules, existing appointments and connected calendars. A failed verification is never mislabeled as a fully booked day.” |
| 1:35–1:53 | Call `prepare_booking_for_confirmation`; visible form opens | “The agent rechecks the selected slot and opens the first-party form with only service, stylist, date, and time prepared.” |
| 1:53–2:18 | Show empty PII fields, unchecked privacy-notice acknowledgement, Turnstile and final button; do not submit | “The agent stops here. Personal information, acknowledgement of the privacy notice, the anti-bot check and the final confirmation remain human actions. This demo deliberately creates no real appointment.” |
| 2:18–2:35 | Show architecture and safety summary | “Marinela AI Concierge demonstrates a reusable path from ambiguous human intent to verified business data and a safe transaction boundary.” |

Recording rules:

- Use 1080p, clear English narration and subtitles; remain below three minutes.
- Use no real client contact data and create no production appointment.
- Hide dashboard data, bookmarks, notifications, OAuth identifiers and all credentials.
- Show only capabilities that are actually shipped.

## Suggested judge prompt

> I want a subtle warm balayage with a budget up to €200. I prefer Mia. Check the next three open working days, help me choose the right service, and prepare one verified time for my confirmation.
