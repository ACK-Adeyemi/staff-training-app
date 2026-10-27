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

To be written from build pack section 8 in M1, M4 and M6.

## Track C

To be written from build pack section 8 in M1, M4 and M6.
