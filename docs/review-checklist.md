# Review checklist

Things only the user can check, by milestone.

## M0

### Phone and live checks

- [x] Open the Pages URL on a phone: D1 shows, with the honest note and the three choices.
- [x] Staff, Client admin and Provider each open with their navigation; the tabs and More work with a thumb.
- [x] Long-press the Demo badge: the presenter panel opens; Fast-forward and Reset demo work; the Demo menu shows the version and build date.
- [x] Dark mode and large text on the phone look right.
- [ ] `?reset=1` on the URL resets the demo, before the hash and at the end of the address (re-check after F1 fix).
- [x] On GitHub: the `checks` job passes, the deploy workflow publishes after a merge to main, and Pages is set to deploy from GitHub Actions.

### Awaiting review

- [x] Draft nursery content: the renewal periods (safeguarding 24 months, paediatric first aid 36, food hygiene 36) are placeholders marked VERIFY in the nursery pack.
- [x] Action versions in `.github/workflows/deploy.yml` (configure-pages v6, upload-pages-artifact v5, deploy-pages v5) could not be checked against the releases pages from here; confirm they exist (logged in docs/decisions.md).
- [x] Free GitHub Pages usually needs a public repository (build pack 11.3, VERIFY).

## M1

### Awaiting content review

- [ ] Safeguarding and whistleblowing module (nursery, Draft content): four lessons, 12 questions and 7 scenarios drafted from EYFS section 3 (September 2026 PDF). Check wording, the list in `packages/content/src/packs/nursery/modules/safeguarding/module.json` under `verify`, and the Open Government Licence line.
- [ ] Paediatric first aid and accidents module (nursery, Draft content): two lessons, 8 questions and 2 scenarios drafted from EYFS 3.37 to 3.40, 3.78 and 3.79. Check wording, the `verify` list in `packages/content/src/packs/nursery/modules/paediatric-first-aid/module.json`, the HSE link and the Open Government Licence line.
- [ ] Safer eating, allergies and choking module (nursery, Draft content, optional, no requirement link): three lessons, 11 questions and 2 scenarios drafted from EYFS 3.64 to 3.73. Check wording, the `verify` list in `packages/content/src/packs/nursery/modules/safer-eating/module.json`, the GOV.UK food safety link (from memory) and the Open Government Licence line.
- [ ] Safer sleep module (nursery, Draft content, optional, no requirement link): two lessons, 9 questions and 2 scenarios drafted from EYFS 3.86. Check wording, the `verify` list in `packages/content/src/packs/nursery/modules/safer-sleep/module.json`, the page number (3.86 runs over pages 40 and 41), whether to add NHS or Lullaby Trust links, and the Open Government Licence line.
- [ ] What changed in September 2026 module (nursery, Draft content, requirement contentId(604)): two lessons, 9 questions and 2 scenarios drafted from EYFS 3.15, 3.17, 3.82, 3.86 and 3.94 and footnote 20. Check wording, the `verify` list in `packages/content/src/packs/nursery/modules/what-changed-2026/module.json`, the GOV.UK banned dogs link (from memory), the missing screen use guidance link, whether these are the right headline changes, and the trip helper exception.
- [ ] Open the NSPCC whistleblowing advice line link used in the question bank; it could not be fetched from the build environment.
- [ ] Lesson 2 "Noticing" is general guidance rather than EYFS text; confirm it suits you.

### Phone and live checks

- [ ] On your phone, sign in as Jade (PIN 1234) and do the Safeguarding refresher end to end: Home shows Next up and Coming up, lessons read well, the quiz works with a thumb, scenarios branch, and Home then says "You're compliant".
- [ ] Answer one question wrongly: the Learn more links open in a new tab, say what they are and where they go, and "From your organisation" shows the Little Acorns Safeguarding policy, which opens on its own page.
- [ ] With the client dashboard open on a laptop and Jade finishing on your phone (same browser profile only; two devices do not share data), C1 updates without a reload.
- [ ] As Priya, open Reports, Training matrix and use Print or Save as PDF: A4 landscape, every person and column present, no navigation or Demo badge.
- [ ] Dark mode and 200% text on the staff Home, quiz, matrix and C1.

### Awaiting review (M1)

- [ ] Safeguarding and whistleblowing module still carries the Draft content label until you have reviewed it (see Awaiting content review above).
- [ ] NSPCC whistleblowing advice line link: VERIFY (not fetchable from the build environment).
- [ ] VERIFY: NEW_STARTER_DAYS (14). New starters are not flagged as "not started" for this many days after their start date. Confirm the length with the first client.
- [ ] Production: staff can read answer keys in the static app (modules ship with their answers). Serve questions without answer keys in production, and mark answers on the server.
- [ ] .github/workflows/ci.yml now has an apt-get step that installs poppler-utils (needed by the matrix PDF e2e tests). Review the .github change before it reaches GitHub.

### M2 phone checks

- [ ] As Jade: add a note in a lesson, take the quiz with notes hidden, see the celebration, XP breakdown, badge and "You're 2nd of 13", then open My notes and tap the course chip.
- [ ] As Maureen (PIN 1234): Simple view and large text look right; Read this aloud works on a lesson with a local voice (VERIFY on a real phone; some devices have no local voice).
- [ ] On Display settings (S12), try every setting, including 200 per cent text, display zoom, high contrast, dark mode and the dyslexia-friendly font; reload and check they stay. Check the dyslexia font licence note.
- [ ] As Priya: create a competition with Suggest a prize, publish it, and check Jade's banner (prize, days left) and details sheet; record winners on an ended one.
- [ ] Hide Jade from leaderboards and confirm she disappears from colleagues' views.
- [ ] Review the XP numbers, level thresholds, badge rules and the 20 prize suggestions (placeholders).

### Awaiting review (M2)

- [ ] Draft modules awaiting your review: Paediatric first aid and accidents, Safer eating, allergies and choking, Safer sleep, and What changed in September 2026 (details above under Awaiting content review).

## M3

### Awaiting review

- [ ] M3 content (Draft): the Fire evacuation at Little Acorns module (`packages/content/src/packs/nursery/modules/fire-evacuation/`, fictional site details, no EYFS reference), the staff and client FAQs and the three release notes in `lang/en-GB.json`, the accepted providers (generic names) and approver checklists for Paediatric first aid, Safeguarding and Food hygiene in `packs/nursery.ts` (VERIFY), the default auto-assign rule due dates, and the theme preset colours.

### M3 phone checks

- [ ] As Mark: upload a photo of a certificate with the phone camera (also try a HEIC photo from an iPhone), then as Priya approve it and print the first aiders list.
- [ ] As Jade: raise a ticket with two screenshots, blur one, and check the context list; add a calendar item and the .ics file to the phone calendar (iPhone and Android); give module feedback at the end of a module.
- [ ] As Priya: paste a procedure into the Module Builder and check the phone preview; change the organisation name and check the staff app; try a theme that fails contrast; switch on the Christmas schedule with Fast-forward.
- [ ] As Daniel: see the 2FA prompt, request the AI Assistant; as Priya approve it and check Explain this in simpler words (Demo AI).
- [ ] Simulate failed payment and Fast-forward through the states; check each banner and the staff message; Pay now. Seeded billing amounts are fake.
- [ ] As Fiona (Oak Tree): site switcher, grouped people, site comparison, Sites board regions.
- [ ] Export all data and open the ZIP on a computer.
- [ ] Live site only (not checkable here): the app opens at the base path /staff-training-app/, hash routes survive a reload and a shared link, the ZIP downloads on a phone and on a desktop, the .ics opens in a calendar app, and file upload (camera and file picker) works on a real phone.
- [ ] Review placeholders, accepted provider names (VERIFY, generic), the Fire evacuation module text and reminder templates.

### Awaiting review (M3, Draft content)

- [ ] Fire evacuation at Little Acorns (new, `packages/content/src/packs/nursery/modules/fire-evacuation/`): three lessons, questions, fictional site details, no EYFS reference.
- [ ] Staff and client FAQs and the three release notes in `packages/content/src/lang/en-GB.json`.
- [ ] Nursery pack additions in `packs/nursery.ts`: accepted providers and approver checklists (Paediatric first aid, Safeguarding, Food hygiene), default auto-assign rule due dates, theme preset colours.
- [ ] New starter induction (new, `packages/content/src/packs/nursery/modules/new-starter-induction/`): two lessons and six questions, written for the demo with no source citations. Draft content label stays on. Replace with real induction content.
- [ ] No other module text was changed in M3.

