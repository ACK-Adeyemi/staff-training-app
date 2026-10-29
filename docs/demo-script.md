# Demo script

## Track A

Client tour, about 10 minutes (build pack 8.1). Before every live demo: open the presenter panel and press Reset demo. Status column: "M1" or "M2" runs today and is proven by `e2e/track-a.spec.ts` (steps 1 to 9 except 10) or the other M1 specs; "Later" comes with the named milestone.

| Step | What you show | Status |
| --- | --- | --- |
| 1. Dashboard as Priya (1 min) | The compliance ring ("11 of 14"), the needs-attention list in order (Mark's first aid overdue, Lucy, Hannah, Chris, Maureen, Amira), Jade's open assignment. | M1, except the onboarding checklist card and the Little Acorns theme (M3, M5). |
| 2. Calendar and one-tap assign (45 s) | Priya opens Calendar, sees "3 Safeguarding expiries" for the week of 2 November, presses Assign refresher for a week, checks Hannah, Chris and Lucy and presses Assign ("Assigned to 3 people."). Then Auto-assign rules: the off Safeguarding refresher rule reads "60 days before Safeguarding expires, assign Safeguarding and whistleblowing". | M3, automated. |
| 3. Staff phone as Jade (2.5 min) | Home shows Next up and Coming up; search Learn for Safeguarding; open a lesson; start the quiz; answer a branching scenario; get one question wrong to show the explanation with "Learn more: ... (GOV.UK)" and "From your organisation: Little Acorns Safeguarding policy"; finish with a pass; the ring shows "You're compliant". | M2, automated. Includes Add note, the quiz with notes hidden, the celebration, "You're 2nd of 13" and the My notes course chip. |
| 4. Staff phone as Maureen (30 s) | Simple view, large text, Read this aloud on a lesson (Stop reading ends it). | M2, automated (PIN 1234). |
| 5. Back to Priya (1 min) | Status is green. Jump to Mark (Presenter panel, Jump to persona): My compliance, Upload certificate on Paediatric first aid, photo, provider and dates, Send for checking (Waiting for a check). Jump to Priya: Evidence to check, open Mark Taylor, compare the photo with the details, Approve. Mark turns Current and the first aiders list for parents (print view) now includes him. Print the inspector-ready training matrix (Reports, Training matrix, Print). | Matrix print: M1. Upload and approval: M3, automated. |
| 6. Module Builder (1.5 min) | Training, New module. Paste a three-heading fire procedure, Turn into lessons (three lessons), add three questions, look at the phone preview, Publish, then Assign to everyone. Open the Fire evacuation results: the funnel (Lessons), Hardest questions and Feedback with the Unclear tag on lesson 2. Reply to one item, set it to Actioned, then Edit this module opens the builder at lesson 2. | M3, automated. |
| 7. Competition (1.5 min) | Create Mastery Month, press Suggest a prize, edit it, set dates, switch the live leaderboard on, publish; Jade sees the banner (prize, days left) and opens the details sheet. | M2, automated. |
| 8. Multi-site (1 min) | Jump to Fiona (Oak Tree Nurseries). People are grouped by site; the Dashboard shows Site comparison; Open Meadow and the site switcher shows Meadow; Leaderboard settings, Full ranking on Participation puts Riverside first and the Scope list offers All sites, South East and South West. | M3, automated. |
| 9. AI Assistant (optional) | Jump to Daniel: preview a lesson (C6), tap the locked AI Assistant card, Send request. Jump to Priya: Add-ons, Requests, Approve. Jump to Daniel: Explain this in simpler words shows text labelled Demo AI. | M3, automated. |
| 10. Battle Room (optional) | Host a Safeguarding battle in Accuracy mode. | Later (M7). |

Close: "Everything you have seen runs on your team's own phones. Behind it, our team runs and supports every client. Let me show you."

Steps 2, 5 (upload), 6, 8 and 9 start from the landing page and move between people with the Presenter panel (Shift+Alt+P), as a presenter would.

Running the automated version: `pnpm build && pnpm exec playwright test e2e/track-a.spec.ts`. It pins the clock to 19 October 2026, 09:00 UTC. If it fails its precondition (the quiz drew no question with a Little Acorns link), change the pinned instant, because content or the quiz draw changed.

## Track B

The provider tour, about 6 minutes (build pack 8.2). Open the landing page, choose Nursery, and use the Presenter panel (Shift+Alt+P) to become the provider owner. A second phone-sized window plays Willow Lane's client and staff views. Everything on the provider side is labelled Simulated data where the numbers are made up.

1. Overview and clients (1 minute). Open Overview: client counts by account state, people and sites, and "Needs attention" with the reasons. Open Clients: filter by account state. Willow Lane shows Past due. On Profile changes, show that an organisation name change can be reviewed, and that Keep billing name leaves the invoice name alone.
2. One client (1 minute). Open Little Acorns. Usage shows uses by feature and active people. Errors and logs shows grouped errors with how many times and how many people, each with a status. Audit lists what people did for this client (for example Priya turning ticket raising off on the client Settings page), newest first. Open Content: module feedback is shown without names, question reports come first, and Check links finds the broken link (simulated).
3. Support (1 minute). Open Ticket inbox, choose Willow Lane Nursery, and open the progress bar ticket: the thread, the ticket details and the customer's screenshot. Reply with a saved reply, set In progress, add an internal note (only the provider team sees it). In Other entries, re-tag the five "Certificate won't download" tickets into one issue type.
4. Guardrails (1 minute). Dunning lists Willow Lane as Past due with the amount outstanding. As Gemma on the phone, the banner says Fix this now. Use Simulate failed payment on any client, then Fast-forward 7 days: the client banner, the Dunning page and the provider Clients list all say Limited, staff keep training, and exports stay open. Pay now on the mock page and everything returns.
5. Control (45 seconds). Open Team and roles: the permission matrix, then New role (Account manager north), where picking Write for tickets also adds Read. Compare it with the seeded Account manager. Invite someone by email with the role preset and Selected clients only (Harbour Cafe Group and Summit Builders). The member shows "Selected clients only: 2" and the invitation is in the Outbox (Presenter panel, Outbox).
6. Pricing (45 seconds). Price changes, New change: Several clients, Harbour Cafe Group and Summit Builders, Type Discount, Applies to Plan, value 15, reason Retention, notice days 0, end date 19 January 2027. Preview shows the new prices and revenue effect. Save, submit, and confirm with the demo authenticator code (step-up). Open Harbour Cafe Group, Billing tab: the -15% line, its status and "Ends 19 January 2027".
7. Close (15 seconds). Open Security: the "Our security and data commitments" list (two-step sign-in, the audit log, staged account states, exports never held back, the retention schedule) and the honest note that this demo simulates authentication, payments and messaging. The Audit log link opens the full log.

Limit to say out loud: in this demo an invitation's client scope is stored and shown, but the provider screens do not yet hide other clients from that person (docs/decisions.md, M4 chunk 18b).

Running the automated version: `pnpm build && pnpm exec playwright test e2e/track-b.spec.ts` (desktop viewport; the second page is sized 390 by 844). It pins the clock to 19 October 2026, 09:00 UTC. Each step is its own test.

## Track C

To be written from build pack section 8 in M1, M4 and M6.
