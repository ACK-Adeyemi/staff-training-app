# Demo script

## Track A

Client tour, about 10 minutes (build pack 8.1). Before every live demo: open the presenter panel and press Reset demo. Status column: "M1" runs today and is proven by `e2e/track-a.spec.ts` (steps 1, 3 and the matrix part of 5) or the other M1 specs; "Later" comes with the named milestone.

| Step | What you show | Status |
| --- | --- | --- |
| 1. Dashboard as Priya (1 min) | The compliance ring ("11 of 14"), the needs-attention list in order (Mark's first aid overdue, Lucy, Hannah, Chris, Maureen, Amira), Jade's open assignment. | M1, except the onboarding checklist card and the Little Acorns theme (M3, M5). |
| 2. Calendar and one-tap assign (45 s) | Team calendar, the cluster of safeguarding expiries, assign to all three, the auto-assign rule sentence. | Later (M3). In M1, say it with Assign training (C4): pick the module, the people and a due date. |
| 3. Staff phone as Jade (2.5 min) | Home shows Next up and Coming up; search Learn for Safeguarding; open a lesson; start the quiz; answer a branching scenario; get one question wrong to show the explanation with "Learn more: ... (GOV.UK)" and "From your organisation: Little Acorns Safeguarding policy"; finish with a pass; the ring shows "You're compliant". | M1, except Add note and My notes, the notes-hidden bonus XP label, the celebration, "You're 2nd of 13" and the leaderboard (M2). |
| 4. Staff phone as Maureen (30 s) | Simple view, large text, read-aloud on a lesson. | Later (M2/M5). |
| 5. Back to Priya (1 min) | Status is green. Mark uploads a certificate photo; Priya approves it in Evidence to check; the first aiders list updates. Print the inspector-ready training matrix (Reports, Training matrix, Print). | Matrix print: M1. Evidence upload and approval: Later (M3). |
| 6. Module Builder (1.5 min) | Paste a fire evacuation procedure, split, add questions, preview, publish, assign. Stats of Fire evacuation, feedback, reply, Actioned. | Later (M3). In M1 the module stats page (C8) shows the basic funnel. |
| 7. Competition (1.5 min) | Create Mastery Month, suggest a prize, publish; Jade sees the banner. | Later (M2/M3). |
| 8. Multi-site (1 min) | Oak Tree Nurseries, site comparison, Sites board. | Later (M3/M5). |
| 9. AI Assistant (optional) | Locked add-on request, approval, Explain this. | Later (M4/M5). |
| 10. Battle Room (optional) | Host a Safeguarding battle in Accuracy mode. | Later (M7). |

Close: "Everything you have seen runs on your team's own phones. Behind it, our team runs and supports every client. Let me show you."

Running the automated version: `pnpm build && pnpm exec playwright test e2e/track-a.spec.ts`. It pins the clock to 19 October 2026, 09:00 UTC. If it fails its precondition (the quiz drew no question with a Little Acorns link), change the pinned instant, because content or the quiz draw changed.

## Track B

To be written from build pack section 8 in M1, M4 and M6.

## Track C

To be written from build pack section 8 in M1, M4 and M6.
