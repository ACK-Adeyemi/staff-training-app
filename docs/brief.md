# Staff Training App PoC Handoff

Last updated 22 October 2026. This is the product brief for a staff compliance training app: what to build and why. It was written from a planning conversation with Claude so that a new chat, another LLM or Claude Code can pick up where planning stopped. Status: planning complete and the open questions answered (22 October 2026); nothing built yet.

Companion document: the PoC Build Pack (Staff_Training_App_PoC_Build_Pack.md) turns this brief into a build plan for the demo: scope, screens, data model, seed data, demo scripts, acceptance criteria and repo setup. A production engineering spec will be written after prospective clients have given feedback on the PoC.

## 1. How to use this document

- "The user" means the product owner who commissioned this work. People who use the apps are called staff (learners), client admins (managers, supervisors and other client roles) and provider admins (the product owner's team).
- The decisions log (section 3) is settled unless the user changes it. Anything marked "assumed" or "confirmed default" was a default proposed by Claude; on 22 October 2026 the user accepted all of them, so treat them as decisions. Section 11 lists only what is still open. Values marked "placeholder" are starting numbers to tune.
- Items marked VERIFY come from vendor marketing, memory or a single source. Check them before showing them to a customer or relying on them in production.
- "PoC" means the free, static GitHub Pages demo. Production notes are flagged as such and are not built in the PoC.
- The user works in the Claude mobile app. Keep replies short, lead with the answer, and ask at most 1-3 questions at a time (tappable options work well).

Where to find things:

- Context and research: sections 2 to 4.
- Learning, content and assessment: sections 5, 7, 8, 16 (progress and game-like experience), 17 (organising and finding modules), 18 (notes and closed-book mode) and 27 (external certificates).
- Design and accessibility: sections 6, 16.4 and 19.3.
- Staff engagement: section 13 (competitions, prizes and leaderboards), section 16, and section 32 (Battle Room live quiz battles).
- Client admin features: sections 5.1 and 5.2 (Module Library, Module Builder, stats), 14 (multi-site), 19.4 (themes), 21.2 and 21.3 (auto-assign rules, reminders), 22.5 (client roles), 23 (billing and add-ons), 25 (support tickets), 27 (approving external certificates), 28.3 (team calendar), 30.2 (organisation profile), 31.3 (their own Learn more links and documents) and 32.10 (Battle Room settings).
- Provider admin features: sections 15 (operations dashboard), 19.1 (feedback inbox), 20 (packaging and add-ons), 22 (roles, permissions, ownership, 2FA), 24 (failed payments and retention), 23.11 (price overrides, discounts and increases), 25 (ticket inbox), 26 (provider support operations), 30.3 (Profile changes queue), 31.3 and 31.4 (Learn more link management and link checks) and 32.10 (battle usage).
- Luxury retail pack (second full demo): section 29.
- Organisation name and billing details: section 30.
- Learn more links on answers: section 31.
- Platform-wide: sections 9 (technical architecture), 12 (multi-industry engine and Industry Packs), 19.1 (app and module feedback), 19.2 (FAQs), 21.1 (easy login), 21.4 (multilingual and read-aloud) and 28 (calendars).
- Answers to the former open questions: section 3 (Decisions log, 22 October 2026). What is still open, and next steps: section 11. Sources: section 33.

## 2. Goal and context

The user wants a low-cost, high-fidelity proof of concept (PoC) of a training app that helps UK nurseries in England keep staff trained and Ofsted-ready, with a second fully built demo for luxury retail (section 29). It will be demoed to nursery managers, luxury retail prospects and other prospective clients, and must also show that the provider admin can fully run and support the staff and client apps. It must deploy free on GitHub Pages and keep data persistence minimal or device-local.

Three surfaces:

1. Staff learner app (mobile-first): modules, lessons, quizzes, progress, notes, competitions and help.
2. Client admin app for nursery managers and their supervisors: staff progress, expiries, assignments, exports, own modules, competitions, themes, roles, billing and support.
3. Provider admin app (internal): clients, packages and billing, content publishing, usage and errors, roles and security, feedback and support tickets.

Modules can be loaded by the provider (us) or by client admins.

Headline selling point: client admins can run staff competitions with custom prizes, backed by fair leaderboards that never reward speed (section 13).

Source content: the EYFS statutory framework for group and school-based providers, effective 1 September 2026 (dated 13 July 2026), 56 pages. The GOV.UK landing page also hosts the childminder version. The page states its content is under the Open Government Licence v3.0 unless otherwise stated, so reuse with attribution looks permitted (VERIFY before publishing).

- PDF: https://assets.publishing.service.gov.uk/media/6a5f8e4fb00f3323bf1a23a1/EYFS_group_and_school_based_from_September_2026.pdf
- Landing page: https://www.gov.uk/government/publications/early-years-foundation-stage-framework--2

## 3. Decisions log

Decided by the user, grouped by theme.

Demo and scope:

- The demo must impress on four areas: the compliance dashboard, the staff phone learning experience, inspector-ready exports, and the provider admin.
- Prospective clients will try the demo both ways: live with the user presenting, and alone via a shared link.
- Build as many modules as reasonable, prioritised by risk (section 7), and show how easy it is to add new content.
- Look and feel is delegated to Claude (section 6).
- The app should be flexible enough to serve multiple industries, not just nurseries: social care and care homes, hospitality and food, construction and trades, schools and education, and retail (section 12).
- Build a full luxury retail demo as a second complete pack alongside nurseries, with its own client, personas, modules and demo track (section 29).
- The first luxury prospect is a heritage, craftsmanship-led house, named privately by the user. Tailor the demo to that kind of house as closely as possible, using a fictional brand, and never name the prospect in repository documents (sections 29.10 and 29.11).

Staff app:

- Assessment uses a mix of scenario ("what would you do?") questions and multiple choice, configurable by admins: scenario-only, multiple-choice-only, a mix, or a random draw from a question bank (section 8).
- Answer explanations include a Learn more link to an official resource where one exists, and client admins can optionally add their own source material (section 31).
- Staff track their progress, completions, compliance requirements and renewal cadence, history and leaderboard position in a Duolingo-style, visual, game-like experience that suits younger phone users and is easy for older staff (section 16).
- Staff can search and filter modules (section 17).
- Battle Room: staff and client admins can host short live quiz battles (for example 10 questions) and invite colleagues from their own site or other sites, in two formats (Free for all, where individuals compete against each other, and Team v team), with Accuracy or Speed mode, an optional Raise the stakes setting that deducts points for wrong answers (minus 500) and for not answering (minus 250), small capped XP and badges, and simulated players in the PoC (section 32).
- Staff can take notes during each course, view them from a general notes button and inside each course, tap a note's course name to jump to that course, and show or hide notes during quizzes. Hiding earns more XP, and competitions can require notes to stay hidden, enforced by the system (section 18).
- Staff and client admins can give feedback on the app at any point, and it goes to the provider. Staff can also give feedback on modules, which goes to the relevant client admins to review and act on if they wish (section 19.1). Both apps have FAQs (19.2) and customisable accessibility settings such as text size and zoom (19.3).
- Easy login by QR code, invite link or PIN, reminders and nudges, and multilingual support with read-aloud (section 21).
- A calendar so staff see what is coming up (section 28).
- Staff can upload a photo, screenshot or PDF of a certificate earned elsewhere, such as the free DfE safeguarding course, and someone with permission approves it so it counts toward compliance (section 27).

Client admin app:

- Client admins create their own modules with the Module Builder, manage them in a Module Library (view, edit, duplicate, assign, archive) and see per-module stats with mobile-friendly summaries and graphs (sections 5.1, 5.2 and 8).
- Client admins can group and categorise modules (section 17).
- Leaderboards include a site leaderboard (people within a site) and site-versus-site leaderboards at national and global level across all of a client's sites (section 13.5).
- Competition campaigns with free-text prizes (no external integrations), a prize generator that cycles through a fixed list from the industry pack (20 general ideas for nurseries, a separate list for luxury retail), built-in competitions based on app metrics, custom competitions with only a name, dates and prize, optional live leaderboards for built-in competitions, banners for staff, and standing leaderboards that never reward speed (section 13).
- Clients with multiple sites see staff organised per site (section 14).
- A theme builder with prebuilt seasonal presets (Christmas, Halloween, Easter and more) and saved themes limited by package (section 19.4).
- Auto-assign rules (section 21.2).
- A team calendar of what is coming up, and module feedback from staff to review, reply to and act on (sections 28 and 19.1).
- An approval queue for certificates staff upload, available to anyone with the right permission, including supervisors (section 27).
- Managers can give supervisors relevant permissions through simpler, cleaner role customisation (section 22.5).
- Client admins can manage add-ons and see billing information when their permissions allow it (section 23).
- Client admins with permission can change the organisation name shown to admins and staff (section 30).
- Customers raise support tickets tagged by feature and issue type, with screenshots, and see responses, updates and statuses (section 25).

Provider admin app:

- The provider sees every organisation name change and decides whether the billing details should match, because clients may want a different display name (section 30).
- The provider sees number of sites, client staff, usage metrics per feature, API usage, errors, logging and more (section 15).
- All app feedback from staff and client admins goes to the provider, so the user can see what is and is not working. Feedback on provider modules also reaches the provider, with names removed (section 19.1).
- Roles so control can be handed to someone else while the user keeps ultimate control or hands that over too: a read and write checkbox screen for every permission, customisable saveable roles with full create, read, update and delete, roles preset when someone is invited by email, and 2FA via an authenticator app. Complexity is acceptable on the provider side (section 22).
- Strong guardrails for failed recurring payments: grace periods, what stays available, no permanent free tier, keeping provider server costs down, and data retention (section 24).
- A ticket inbox with responses and statuses, plus easy create, update and archive of feature names and issue types, and a review of Other answers to add new options or update wording (section 25).
- Provider support operations: client onboarding, announcements and release notes, client account recovery, data subject requests, and incident and maintenance messages (section 26).

Commercial:

- Both packaging options are written up (section 20). Option A is the launch structure (decided 22 October 2026, below). Price amounts are still placeholders.
- An AI assistant is offered as an add-on subscription (section 20.7).

Technical:

- The PoC is a free, static GitHub Pages app with device-local persistence (section 9).
- Build the PoC in TypeScript, with the domain logic in a shared package and all storage behind a data layer, so the logic can be reused in production (section 9).

Answered on 22 October 2026 (the former open questions in section 11):

Setup and content:

- Product name: a placeholder ("[Product name]") until the user chooses one. It is a single config value.
- Repository: public, on a free GitHub account, because free GitHub Pages publishes only from public repositories (GitHub documentation). Fictional data only, and the protected-names pre-commit hook stays on.
- Content: Claude drafts lessons and question banks from official sources, and the user reviews them before any demo. Draft labels stay on until then.
- Validation: build the PoC first, then show it to 5 to 10 nursery managers and record their feedback. The user has contacts in schools and in hospitality or retail for later interviews (section 12.5).

Commercial:

- Packaging: Option A (three tiers plus add-ons) is the launch structure. The demo keeps the Option A and Option B switch for comparison (section 20.5).
- Pricing is per site, banded by staff count. Price amounts are still placeholders.
- Provider price controls: the provider can override prices and apply percentage discounts or increases for one client or many, with a notice field that defaults to 30 days, and a provider admin with the right permission confirms each change before it applies (section 23.11).
- A 30-day free trial with sample data and no card.
- Lapsed clients keep the free read-only and export window, then can buy the Records Keeper archive plan. No permanent free tier. A freemium plan for very small settings may be tested later.
- The failed-payment timings in section 24.3 are accepted as placeholders, and staff keep doing mandatory training while an account is Limited.

Security and data:

- Production hosting in a UK or EU region (VERIFY the UK adequacy position for the chosen EU region before launch).
- Two-factor authentication is required for every client admin (section 22.5) and every provider team member (section 22.6). Staff learners use the easy login (section 21.1).

Engagement:

- Staff names show on leaderboards by default (first name and initial, or a nickname), with an easy opt-out.
- No extra limits for staff under 18 beyond the existing prize rules (no alcohol, tobacco or gambling).
- No cap on prize value. The client is responsible, and the app shows the disclaimer in section 13.7.
- Battle Room scoring and defaults in section 32 are accepted as written.

Luxury retail:

- The user will ask the first luxury prospect in writing, before the meeting, for permission to apply their name and branding live (section 29.11).
- Legal-topic retail modules (anti-money laundering, sanctions, retail crime) ship with a Draft label for each client's compliance team to review. A client can mark a module as reviewed for their organisation, adapt a copy, or write their own (section 29.9).

Everything else:

- The user accepted Claude's defaults for every other open question. Anything marked "assumed" in this brief is now a decision, and values marked "placeholder" remain starting numbers to tune.

Earlier defaults, confirmed on 22 October 2026:

- Scope is the group and school-based framework only. The childminder framework comes later.
- Nurseries are built fully first, then luxury retail. The other four industries (schools, social care, hospitality, construction) appear as clearly labelled stub packs (section 12.6).
- All data in the demo is fake. Never put real staff or child data in the PoC.

## 4. Research findings

### 4.1 What nurseries use today

Two separate product categories exist, and they rarely overlap.

- E-learning and CPD providers (the teaching): National Nursery Training (35+ Ofsted-aligned courses with a team portal), The Mandatory Training Group with ComplyPlus LMS, Early Years Alliance (live virtual classes), NDNA Development Zone, CareTutor, Hubba Training (Scotland). From memory, not checked in this research (VERIFY): Noodle Now, CPD Online College, Educare, High Speed Training, Virtual College.
- Nursery management software (the records): Famly, Blossom, Connect Childcare, Tapestry, Cheqdin, Nursery in a Box, OpenEduCat, eypeople (HR), Nursery Space, Otii. These track qualifications, DBS dates, first aid and safeguarding certificates, rotas and ratios, and produce Ofsted evidence packs. Most do not teach.

Ofsted does not approve or require any particular platform. Inspectors care that staff can demonstrate current knowledge and that records prove it.

The DfE, working with the NSPCC, offers free online safeguarding training for early years educators (linked from the GOV.UK page, added 17 July 2026). Do not compete with it. Staff can upload their certificate and a manager approves it, so it counts toward compliance (section 27).

### 4.2 Likely gaps (hypotheses)

Searches found little hard user-complaint data, because review sites had few or no reviews for the relevant tools. These gaps are inferred from market structure. Validate them with 5-10 nursery managers before building a real product.

1. Training and compliance records live in separate tools. Completion should update the staff compliance record automatically.
2. Expiry-driven retraining: safeguarding must be renewed every 2 years (EYFS 3.33) and paediatric first aid every 3 years (3.37). Auto-assign refreshers and alert admins ahead of expiry.
3. Role-based learning paths (DSL, manager, baby room staff, food handlers, apprentices and students). Generic libraries are one-size-fits-all.
4. Evidence of understanding, not just attendance: scenario and multiple-choice checks with pass marks and retakes logged.
5. Framework change management: the EYFS changes every September. Push short what-changed modules and track who has read them.
6. Short, mobile-first lessons (about 10 minutes or less) that fit shift patterns.
7. Inspector-ready exports: a one-click training matrix by person, with multi-site roll-ups for groups.
8. Client-uploaded policies that staff read and acknowledge alongside the national content.
9. A staff-leaver flow that archives a person but keeps their history. Nursery staff turnover is high, and one competitor advertises free replacement of leavers.

### 4.3 Pricing anchors (VERIFY all)

- Hubba Training: GBP 30 per month, unlimited team members, unlimited course access.
- NoodleNow: GBP 27.50 per user per year for the business tier (from a partner page that may be dated).
- CareTutor: unlimited subscriptions for 10 to 10,000+ users, with free replacement of leavers and a traffic-light training matrix.
- NDNA: per-course bundles from GBP 12 per course (25-course bundle) down to GBP 5.25 (500-course bundle).

A 15-person nursery is therefore used to paying about GBP 30-35 per month. Content volume cannot be the selling point. Compliance tracking and audit-readiness must carry the price.

### 4.4 Engagement and churn (vendor blogs, treat as directional)

- Frontline workers mostly use their own phones, and desktop-style LMS platforms reportedly see completion below 30-40% for shift workers.
- Lessons under about 10 minutes, relevant to the learner's role, are the most consistent recommendation. Track drop-off per lesson, not just overall completion.
- Mandatory training is often seen as paperwork. Light progress and streak mechanics help, but keep the tone adult and professional.
- For the paying customer, retention comes from audit-readiness: once compliance records live in the product, switching costs rise.

### 4.5 What Ofsted actually finds

Ofsted inadequate reports and complaint outcomes repeatedly cite the same areas: staff safeguarding knowledge and keeping it current, a current paediatric first aid holder being present at all times including outings, ratios, risk assessments, safer eating, and record keeping. One recent complaint outcome required a setting to display PFA certificates or a list of qualified staff to parents. This drives the module priority in section 7.

## 5. Product requirements (PoC)

Staff app:

- Mobile-first, installable, works offline once loaded.
- Home screen shows assigned modules, due dates, and what to do next.
- Lessons are short sections with a stepper, minutes remaining, save and resume.
- Quizzes per the engine in section 8, with feedback that cites the source paragraph and offers Learn more links to official resources and the organisation's own material (section 31).
- A completion certificate or record per module.
- Competition banners on the home screen, a competition details view, and a Compete tab with standing leaderboards and the Sites board (sections 13.5 and 13.6).
- Battle Room: host or join short live quiz battles with colleagues, in Free for all or Team v team format (section 32).
- Help and app feedback at any point, feedback on modules, a staff FAQ, display and accessibility settings, and read-aloud (sections 19 and 21.4).
- A calendar of what is coming up: due training, renewals, competitions and notices (section 28).
- Raise a support ticket with screenshots and follow its replies and status in My tickets, if the client allows staff tickets (section 25).
- A What's new page and occasional announcements or maintenance notices from the provider (section 26).
- Upload a certificate for training done elsewhere and follow its approval in My compliance (section 27).
- Easy login with QR, invite link or PIN, a notification centre for reminders, and a language switcher (section 21).
- Search and filter modules by category, group, status and more (section 17).
- Notes during courses, a My notes view that links back to each course, and show or hide notes during quizzes (section 18).
- Game-like progress experience: learning path, compliance checklist with renewal dates and cadence, completed items, history, XP, levels, badges, weekly goal and own leaderboard position, with a Simple view for people who prefer it (section 16).

Manager (client admin) dashboard:

- Needs-attention-first view: overdue, expiring soon, not started.
- Staff list with per-person compliance record: qualification level, DBS check date and reference, safeguarding training date, PFA expiry, food hygiene, induction done, last supervision date, policy acknowledgements.
- Assign modules by person or role, set due dates, send reminders (simulated).
- Per-module stats and an all-modules overview, with mobile-friendly summaries and graphs (section 5.2).
- Inspector-ready training matrix export (print-friendly page or PDF).
- Leaver flow: archive a staff member and keep history.
- Module Library and Module Builder: create, manage, edit and assign their own modules, and require acknowledgement of policies (section 5.1).
- Add their own Learn more links or documents to any module, including provider modules (section 31.3).
- Competitions: create and manage competition campaigns with custom prizes, a prize generator, live-leaderboard control, and standing leaderboards (section 13). Leaderboard settings choose which scopes staff see and the Sites board measures (section 13.5).
- Battle Room: host battles for their teams, and set who may host, cross-site battles, room size and the modes available (section 32.10).
- Multi-site clients: site switcher, staff organised per site, and per-site and group roll-ups (section 14).
- Module categories and groups: organise modules, assign a group as a bundle, and track progress per category and group (section 17).
- Theme builder with seasonal presets and a package-limited number of saved themes, an admin FAQ, and feedback at any point (section 19).
- Auto-assign rules, reminder policy and one-tap nudges, staff invites by QR or link, and a plan and usage view with limits (sections 20 and 21).
- Billing and add-ons: plan and usage overview, invoices, add-on cards with turn on and off, spending caps, a request flow for people without permission, plan changes, all gated by billing permissions and step-up 2FA (section 23).
- Account status banner and timeline, staged failed-payment states, and a Data and retention page with full export and scheduled deletion dates (section 24).
- Support tickets: raise tickets tagged by feature and issue type with screenshots, follow the conversation and status in My tickets, and (with permission) see the organisation's tickets (section 25).
- Organisation profile: change the display name staff see, with a live preview (section 30).
- Onboarding checklist, a What's new page with release notes and announcements, and tools to export or erase one person's data on request (section 26).
- Evidence to check: approve, reject or ask for a better copy of certificates staff upload, and print the list of current first aiders for parents (section 27).
- Team calendar of expiries, deadlines, competitions and more, with bulk refresher assignment by week (section 28).
- Module feedback from staff: review, reply, mark actioned, edit own modules or escalate provider modules (section 19.1).
- Team and permissions page: simple roles (Account Owner, Group Admin, Site Manager, Supervisor, Trainer, Viewer), plain-language permission levels, scope picker, invite by email, Preview as this role, activity log, and authenticator-app 2FA (section 22.5 and 22.6).
- Stretch: a room ratio check widget.

Provider admin (internal):

- Client operations dashboard: client list with sites, staff, plan, status and health score, plus per-client usage by feature, API usage, errors and logs, and an audit trail (section 15).
- Module library with versions, publish to all clients or selected clients.
- Billing mock: plans, invoices, MRR-style summary, using fake data and placeholder prices.
- Module Builder (section 8).
- A full role and permission manager with a read and write checkbox matrix, saveable custom roles, invite by email with roles preset, ownership transfer, audit log and authenticator-app 2FA (section 22).
- A Profile changes queue for organisation name changes and billing detail requests, with keep, match or ask options (section 30).
- Module feedback on provider modules, with names removed and grouped per module across clients (section 19.1).
- Learn more link management for provider modules, with link checks and open counts across clients (section 31).
- Client onboarding wizard and checklist, announcements and release notes, client account recovery with dual approval, a data request log, and incident and maintenance messages (section 26).
- A support ticket inbox with assignment, internal notes, saved replies, statuses and reports, plus a Support settings page to create, update, archive and merge feature names and issue types and review Other entries (section 25).
- A feedback inbox (section 19.1), package and add-on management with entitlements and limits (section 20), an AI Assistant add-on (section 20.7), and Battle Room usage per client (section 15.3).

### 5.1 Client Module Library and Module Builder (client admin)

Client admins create, manage and assign their own modules. They are not only consumers of the provider's content.

- Module Library: a searchable list of every module available to the client (cards on phone, table on desktop). Each entry shows title, source badge (Provider or Own), status (Draft, Published, Archived), version, last edited, the requirement it satisfies, assigned roles, and headline stats (people assigned, completion percentage, average staff rating).
- Filter by status, source, requirement, role, industry pack, category and group (section 17). Sort by last edited, completion rate or overdue count.
- Actions per module: preview as a learner, edit (own modules only), duplicate, assign (people or roles, with a due date), archive, and export as JSON. Deleting is allowed only when nobody has completed the module. Otherwise archive it, so history is preserved.
- Provider modules are read-only for clients. A client can duplicate one into their own library to customise it. The copy becomes theirs and stops receiving automatic updates, and the client is then responsible for its accuracy (show a short note saying so). When the provider updates an original, clients see a what-changed notice.
- Clients use the same Module Builder as the provider (section 8): drafts, live phone preview, and a pre-publish checklist (title, at least one lesson, valid quiz settings, linked requirement).
- Versioning: editing a published module creates a new version. Each completion records the version taken. When publishing a new version, the admin chooses whether to re-assign it to people who completed the old one.
- Typical client-authored modules: site-specific policies, fire evacuation, induction and local procedures, each with an optional read-and-acknowledge step.

### 5.2 Module stats and mobile-friendly reporting

Every module has its own stats page, and there is an overview across all modules.

Per-module stats:

- Headline cards: assigned, started, completed, completion rate, overdue, average score, pass rate, first-attempt pass rate, average time to complete.
- A progress bar split by status: completed, in progress, not started, overdue.
- Lesson funnel: how many learners reach each lesson, shown as horizontal bars, so drop-off is obvious.
- Question insights: percentage correct per question, hardest first, with the source reference and how often Learn more was opened (section 31.5), so the manager can see knowledge gaps.
- Score distribution and retake counts.
- Completions over time (weekly).
- People list: status, score, date and time taken per person, filterable by role or team, with a tap-through to the person's compliance record.
- Staff feedback: average rating, tag counts, comments and question reports, with status and reply (section 19.1).
- Export: CSV, and a print-friendly PDF summary for a module.

Overview across all modules: overall compliance percentage, broken down by requirement, role and team; lists of overdue and expiring-soon items; most and least completed modules; trends over the last 30 or 90 days.

Mobile presentation rules are in section 6.

## 6. Design direction

Tone: calm, warm and professional, native-feeling on a phone. Adult and plain-English, not childish. The staff are professionals and the manager is the buyer. The staff app may be more visual and game-like (section 16), while the manager and provider surfaces stay calm and professional.

- One soft accent colour on a clean, high-contrast base. Light and dark modes follow the device.
- Touch targets at least 44 CSS px. Apple recommends 44pt and Google 48dp. WCAG 2.2 sets 24x24 CSS px as the AA minimum (SC 2.5.8) and 44x44 as the enhanced level (SC 2.5.5).
- Text contrast at least 4.5:1 and UI component contrast at least 3:1 (WCAG AA). Visible focus states. Respect reduced-motion settings.
- Thumb-friendly: bottom tab bar and primary actions at the bottom of the screen for staff. Manager view adapts from cards on phone to tables on desktop.
- Status is never colour alone: red, amber and green always come with an icon and a word.
- System font stack for speed and native feel. No external font downloads.
- Theming: every colour, radius and font is a design token (CSS variable), so client themes (section 19.4) and a user's accessibility settings (section 19.3) can override them. Status colours (red, amber, green) are fixed semantic tokens, and accessibility settings always win over a theme.
- Plain English, GOV.UK-style writing: short sentences, active voice, no jargon without explanation.
- Gamification (staff app): visual and game-like but respectful. Use a learning path, progress rings, XP and levels as personal progress only, milestone badges, short tasteful celebrations, and a weekly goal instead of a daily streak. No demotion zones or leagues, no random bonus rewards or XP boosts, no lives or hearts, no guilt notifications, and nothing that rewards speed. Full rules are in section 16.1.
- Stats and charts on mobile: summary first (a big number, a short label and a trend), then one simple chart per card. Prefer progress bars and horizontal bars over wide or multi-series charts. Tap a card to drill down. Every chart has a table or text alternative, uses labels or patterns as well as colour, and has a clear empty state for modules with no data yet. Offer simple 30 and 90 day filters, and avoid dense dashboards.

## 7. Content plan

Source: the EYFS group and school-based framework. Paragraph references are to that document. Keep each lesson short and rewrite statute into plain English. Every quiz question carries its paragraph reference.

Tier 1 (fully built: about 4 lessons plus a bank of about 12 questions each):

1. Safeguarding and whistleblowing: DSL role (3.4, 3.32), policies (3.5-3.6), whistleblowing (3.7-3.8), acting on concerns (3.9), notifying Ofsted of allegations within 14 days (3.10), training renewed every 2 years (3.31-3.33).
2. Paediatric first aid and accidents: at least one current PFA holder on site and on outings (3.37-3.39), renewal every 3 years, display certificates or a list (3.40), accident records and notifying parents and Ofsted (3.78-3.79).
3. Safer eating, allergies and choking: PFA holder present at mealtimes (3.64), dietary and allergy information (3.65-3.66), weaning and textures (3.67), choking prevention and records (3.68-3.71), food poisoning notification (3.73).
4. Safer sleep: sleep rules for under-2s (3.86). New emphasis from September 2026.
5. What changed in September 2026 (micro-module): safer sleep, regard to screen use (3.94), banned dog breeds (3.82), other safeguarding clarifications, and the change that makes some unpaid activity regulated activity (framework footnote 20, citing the Crime and Policing Act 2026).

Tier 2 (lighter, 1-2 lessons plus quiz):

- Suitable people and vetting: DBS and barred list, references, disclosure duties (3.13-3.21), disqualification (3.22-3.27).
- Ratios and qualifications (3.43-3.57). Examples: under 2s at 1:3, 2-year-olds at 1:5, manager qualification requirements (3.45).
- Risk assessment and outings (3.91-3.93).
- Medicines (3.59-3.62).
- Records, confidentiality and data protection (3.95-3.99).

Tier 3 (shown as coming soon, to show the roadmap): learning and development (Section 1), assessment (Section 2), SEND (3.77), behaviour (3.74-3.76), induction and supervision (3.34-3.36).

Gap in what was read: the fetch of the PDF stopped around paragraph 3.100. The rest of Section 3 (information for parents, complaints, inspections, notifications, other legal duties) and Annexes A (PFA criteria), B (reception baseline) and C (safeguarding training criteria) have not been read. Re-fetch before writing the safeguarding and first aid modules.

Caveat: the framework is the legal baseline, not the whole of Ofsted compliance. Ofsted also inspects against its own handbook and expects regard to Working Together to Safeguard Children and the Prevent duty. Position the PoC as EYFS compliance training, and add Ofsted handbook content later.

## 8. Quiz engine and Module Builder

Question types: multiple choice, true/false, and branching scenarios (what would you do, with consequence and feedback).

Per-module admin settings:

- Mode: scenario-only, multiple-choice-only, or mix with a ratio.
- Number of questions drawn at random from the bank.
- Shuffle question and answer order.
- Pass mark and number of retakes allowed.
- Feedback on or off, and whether to show the paragraph reference.
- Learn more links: show for wrong answers only, or for all answers (default all).
- Notes in quizzes: Choice (default, learners can show or hide their notes) or Closed-book only (notes locked). See section 18.3.

Each question stores: type, prompt, options, correct answer or branch outcomes, explanation, source reference (an EYFS paragraph for nursery content), Learn more links (section 31), and tags (role, topic).

Module Builder (the 'easy to add content' demo):

1. Paste text or Markdown, or import JSON.
2. Live preview in a phone frame.
3. Split into lessons, add questions, tag roles, set quiz mode.
4. Publish to all clients or one client. Client admins get the same builder for their own policies, such as an evacuation procedure.
5. Authored modules are saved locally and can be exported as JSON to commit to the repo to make them permanent.

Who can build and edit what (assumed, not yet confirmed by the user):

- Provider admin: creates and edits provider modules, publishes them to the shared library, a pack, or selected clients, and sees aggregate stats across clients.
- Client admin: creates and edits their own modules, which are private to that client. They manage them in the Module Library (section 5.1), can duplicate provider modules into their own library to customise, but cannot edit the originals. They see stats for their own staff only.
- Staff: learn only.
- Module states: Draft, Published, Archived, with a version number. Client-authored modules need no provider approval before assignment in the PoC.

A real AI draft button needs a backend and API key, which a static GitHub Pages site cannot hold safely. In the PoC, Draft from a policy is a scripted Demo AI mock with canned output that still goes through human review before publishing (section 20.7). Real AI drafting is a production feature.

## 9. Technical architecture

- Single static single-page app deployed to GitHub Pages by a GitHub Action. Stack: Vite, React and TypeScript, with Tailwind. Use hash routing, because Pages has no server rewrites.
- One app, three surfaces, with a 'Demo as' switcher (Staff, Manager, Provider Admin). No real login.
- Reuse in production (decided): all business rules live in a shared TypeScript domain package with no browser or UI code: effective permissions, entitlements, account states, requirement status, scoring, XP, competition metrics and auto-assign rules. The UI never reads or writes storage directly. It calls a data layer with one interface and two implementations: a browser adapter (IndexedDB) for the PoC, and later an API adapter for production. Every record carries a client id (and site id where relevant) from day one, so multi-tenant separation is designed in. The production backend can then reuse the same domain package on the server. Details are in the Build Pack.
- Modules and seed data are static JSON or Markdown in the repo.
- State persistence is device-local: IndexedDB for staff, assignments, attempts and authored modules; localStorage for small settings such as current role and tour progress. Provide Reset demo and JSON export and import so state can move between devices. Storage is per browser per device, quota varies, and clearing site data wipes it (VERIFY limits).
- Installable PWA with a service worker for offline use. Handle cache busting on each deploy.
- Fast-forward time: an app clock offset stored in state, so expiry alerts and refresher assignment can be demoed live.
- Seeded history: seed three to six months of realistic attempts, completions, scores and dates for the demo nursery, so charts and funnels look populated on first load. Fast-forwarding time must keep the stats consistent.
- Stats come from an event log: record small events (lesson viewed, question answered, attempt finished, module completed) in IndexedDB, with a module version on each, and compute stats from them. A device-local PoC cannot aggregate real learners across devices, so the seeded data simulates a whole team.
- Competition and leaderboard metrics are also computed from this event log (section 13.8), so every question event must record the user, module, module version, question id and whether the answer was correct.
- Staff progress data (XP ledger, badges, weekly activity table, preferences) is stored alongside the event log, and all staff-facing numbers derive from the same events as the manager stats (section 16.5).
- Notes are stored in their own IndexedDB store, private to the learner. Quiz answer events also record whether notes were visible and the attempt mode (open or closed), which drives the closed-book XP bonus and closed-book competitions (section 18.5). Categories, groups and their module mappings are stored as a client-level layer (section 17.3).
- Permissions: one central function computes effective permissions from roles, overrides, scope and expiry, and every screen, button and data query consults it, so the permission engine is built first (Build Pack milestone M0) even though the role management screens come later (section 22.7). Roles, assignments and audit events are stored locally in the PoC, with 2FA and ownership transfer simulated.
- Entitlements: each package is a JSON set of limits and flags checked by the engine (section 20.6). Themes are token sets stored per client (section 19.4). Feedback, notifications, invites and auto-assign rules are stored locally in the PoC (sections 19.1, 21.1-21.3). All interface text lives in language files for translation (section 21.4).
- Charts: only bar, progress, line and simple distribution charts are needed. Decision (Build Pack section 3.1): small hand-built inline SVG components, themeable for light and dark, touch-friendly, each with a table alternative. No chart library.
- Seeded demo nursery (placeholder name Little Acorns Nursery) with about 14 staff in mixed states: current, expiring, overdue, not started. Include a DSL, a manager, room leaders, a cook and an apprentice.
- Status logic: green is current, amber is expiring within a configurable window (placeholder 60 days), red is expired or overdue, grey is not assigned.
- Exports use a print stylesheet or client-side PDF generation.
- Pricing and packaging mock: the package switcher showing Option A or Option B (section 20.6), priced per site and banded by staff count (placeholder bands: up to 15, 16 to 40, and 41 or more staff). Label all prices as placeholders.
- Free GitHub Pages publishes only from public repositories (GitHub documentation, checked 22 October 2026), so the repo is public (decided). Do not commit anything sensitive.

PoC limits to state honestly: no real authentication, no cross-device sync, no real email or notifications, no real payments, no AI assistant (a scripted mock labelled Demo AI only), no real push or SMS, no real-time Battle Room play (simulated players only, section 32.11), no real link checking for Learn more links (simulated, section 31.4), browser storage is not secure, and all provider-side metrics (cross-client usage, API usage, errors and logs) are simulated or limited to the current device (section 15).

## 10. Build phases and demo

The PoC Build Pack is the source of truth for building the demo: what is built fully, mocked or only mentioned, the build milestones, the screen inventory for each app, the consolidated data model, seed data, the master demo scripts and acceptance criteria. In summary:

- Build in milestones, starting with the shared domain package, data layer and permission engine, then the nursery manager-and-staff story, then the provider story, then polish, then the luxury retail pack (milestone M6), and the Battle Room (milestone M7, any time after M2).
- Demo modes: live, with a hidden presenter panel (Reset demo, Fast-forward time, Simulate failed payment, Jump to role or persona, Toggle system status, Open outbox and Clear prospect branding; Build Pack screen D2), and self-guided, with a welcome screen, a short tour and a try-this-next checklist because nobody is there to narrate.
- Three master demo scripts: a 10-minute nursery client track (manager and staff), a 10-minute luxury retail client track, and a 5-minute provider track showing how the provider runs and supports every client.

## 11. Open questions and next steps

On 22 October 2026 the user answered, or accepted Claude's defaults for, every open question in this section. The answers are in section 3 (Decisions log). What remains is either for the user to settle later, a question for prospects and pilot clients, or a check to make before launch.

Still to settle later (not blocking the PoC):

- Product name and branding. A placeholder is used until then, and the name should be industry-neutral (section 12.8).
- Price amounts for each package, staff band and add-on. The structure is decided (section 20).
- The production hosting provider, within a UK or EU region, chosen in the production engineering spec.

Questions for prospects and pilot clients (ask during demos and interviews):

- Which stats matter most to a manager (section 5.2), and whether the placeholder package limits (own modules, saved themes, admins, auto-assign rules, battles) feel right.
- How younger and older staff find the path view and Simple view.
- Which interface languages their staff need first (section 21.4).
- Whether the module feedback tags, ticket issue types and onboarding checklist steps match how they work.
- Luxury retail: do UK stores accept high value cash (registered as high value dealers) or follow a no-high-value-cash policy? Are personal phones allowed on the shop floor? Which store types matter (flagship, boutique, concession, outlet, airport)? Are there stores in Scotland, Wales or Northern Ireland, where some rules differ? The private pitch notes hold the prospect-specific version.

Checks before launch (VERIFY, legal and technical):

- Data protection: a data protection impact assessment, privacy notices, the processor agreement, and the UK adequacy position for any EU hosting region.
- Prizes: UK gambling and lottery rules, and the tax treatment of staff rewards (section 13.7).
- Failed-payment timings, retention periods, processor deletion duties and tax record periods (sections 24.3 and 24.6), written into the terms of service.
- Price changes: notice periods and how increases apply to annual plans, written into the terms of service (section 23.11).
- The DfE early years safeguarding course: whether its certificate can be downloaded and whether it meets the Annex C criteria (section 27.2).
- Legal-topic retail modules: legal advice before they are marketed as compliant (section 29.9).
- Every other item marked VERIFY in this brief and the Build Pack.

Suggested next steps for the receiving assistant:

1. Read the PoC Build Pack, then the decisions log (section 3), which records the answers to the former open questions.
2. Re-fetch the unread parts of the framework PDF (end of Section 3 and Annexes A and C) before writing the safeguarding and first aid modules.
3. Ask the user whether to start milestone M0 of the Build Pack now.
4. Draft the Safeguarding module (lessons, scenario and multiple-choice bank, source references) and the seed data.
5. Build milestone by milestone, and review each with the user on their phone.
6. After milestone M5, help the user line up 5 to 10 nursery managers to see the demo, and record their feedback in docs/decisions.md.

## 12. Multi-industry strategy

Decision: the user wants the product usable across industries. Named: social care and care homes, hospitality and food, construction and trades, schools and education, and retail, alongside nurseries. Recommended strategy: one industry-agnostic engine, with industry content delivered as Industry Packs, launching and demoing nurseries first.

### 12.1 Why vertical-first

- Vendor-blog comparisons suggest vertical SaaS churns less than horizontal (some verticals under 6%, against about 12% for horizontal) and can price against a specific compliance pain, while horizontal products compete on price but address a bigger market. Treat as directional (VERIFY).
- Compliance training is already sold across industries by established providers (for example High Speed Training, iHASCO and Educare, from memory, VERIFY). The likely differentiator is regulator-mapped tracking and role-based learning paths, not course volume.

### 12.2 The Industry Pack concept

A pack is a bundle of config and content, stored as JSON or Markdown in the repo:

- Terminology (for example Ofsted becomes CQC, HSE or Trading Standards; setting becomes site or venue).
- Role types and their default requirements.
- Staff record fields (for example DBS date for nurseries, CSCS card number for construction).
- Requirements (section 12.3).
- Modules and question banks.
- Regulator and legal references.
- Export templates (an inspector, auditor or regulator pack).
- Default status windows such as the amber warning period.
- Optional pricing defaults.

### 12.3 Core data model change: Requirements

A Requirement is an obligation: what is needed, who it applies to, the renewal period, the type of evidence accepted, and a source reference. Example: safeguarding training, all staff, renew every 24 months, evidence is a module completion or an uploaded certificate.

- Modules satisfy requirements. The compliance dashboard computes each person's status from requirements, evidence and expiry dates.
- This separates tracking from teaching. External training (the free DfE and NSPCC safeguarding course, a paediatric first aid course, a food hygiene certificate, later a CSCS card) counts once staff upload the certificate and someone with permission approves it (section 27).
- New industries then become mostly config rather than new code.

### 12.4 Shared core library plus industry packs

Several topics recur across industries: fire safety, manual handling, health and safety, data protection, first aid, safeguarding (scope differs), and equality and diversity. Build these once as shared modules with per-pack variants rather than duplicating them. This is a hypothesis to test, and it could reduce content cost.

### 12.5 Candidate industry notes

All from memory and unverified. Check with sector sources before using any of it.

- Schools and education: the closest overlap with the nursery safeguarding content. Annual safeguarding updates for all staff under Keeping Children Safe in Education, plus Prevent and data protection. Ofsted and the DfE. Likely the easiest second pack.
- Social care and care homes: regulated by CQC in England. Mandatory training typically covers safeguarding, moving and handling, infection control, fire safety, basic life support and medication. Care Certificate for new staff, and Oliver McGowan training on learning disability and autism. High staff turnover and a compliance-record pattern similar to nurseries, so a strong fit.
- Hospitality and food: food hygiene (commonly Level 2), allergen awareness, fire safety and licensing awareness, enforced by local authority environmental health. High turnover and many part-time and seasonal staff, so mobile-first suits well. Budgets are probably lower.
- Construction and trades: site safety induction, working at height, manual handling, asbestos awareness and competence cards such as CSCS, under HSE and the CDM regulations. Much training is delivered in person and certified externally, so the app is more a tracker of external certificates plus toolbox talks than the main teacher. Offline use on site matters.
- Retail: health and safety, manual handling, fire, age-restricted sales, conflict management and data protection, with Trading Standards oversight. Very high turnover and large multi-site chains, so group roll-ups and fast onboarding matter. Price sensitivity is likely high. Luxury retail is now built as a full pack and researched separately (section 29); general retail remains a later pack.

Hypothesised order of packs: schools, social care, hospitality, retail, construction. The user has not chosen an order, but has contacts in schools and in hospitality or retail, so those are the first places for validation interviews after nurseries.

### 12.6 Recommended scope for the PoC

- Build nurseries fully, then luxury retail fully as the second pack (section 29).
- Make the engine pack-driven from the start: JSON config, and no nursery or retail terms hard-coded in the code.
- The demo landing page lets the viewer choose Nursery or Luxury retail, and the same screens change wording, requirements and content.
- In the provider admin, show the remaining four industries (schools, social care, hospitality, construction) as stub packs. Each stub has a name, role types, three or four sample requirements and at most one sample lesson. Label them clearly as illustrative.
- Do not build a no-code pack builder yet.

### 12.7 Complications and tradeoffs

- Focus versus breadth: training for everyone is weak positioning. Each industry needs its own interviews and validation.
- Content is the real cost: config makes new industries cheap to set up but not to fill or maintain. Rules change (the EYFS every September), and wrong content carries liability. Subject experts or licensed content partners will likely be needed.
- Licensing varies: EYFS is under the Open Government Licence, but other industries' standards and guidance may be copyrighted.
- Regulation varies by sector and by country within the UK, including expiry rules, terminology and evidence.
- Competition: established multi-industry providers exist (section 12.1).
- Over-engineering risk: generic abstractions can slow the PoC and delay the first customer. Keep config in JSON files for now.
- Data sensitivity: health and children's settings carry heavier data protection duties once real data is involved.
- Pricing power varies: the nursery anchor of about GBP 30-35 per month may not hold elsewhere. Test per industry.
- Six packs at once spreads effort thin. Luxury retail is the one fully built second pack; the rest wait for client feedback.
- Delivery differs by industry: construction is often in person and certificate-led, and learner devices and connectivity differ.

### 12.8 Changes this implies elsewhere in the document

- Use neutral terms in code and UI: client admin, learner, requirement, site. Nursery wording belongs in the nursery pack.
- Replace EYFS paragraph reference with source reference in the data model and question schema (sections 8 and 9).
- Packaging (section 20): the same packages in every industry, with optional per-pack pricing defaults (section 12.2).
- Branding: an industry-neutral product name. Per-client theming is already in the PoC (section 19.4).
- The compliance record fields in section 5 are nursery-specific. Treat them as the nursery pack's fields.
- Competitions, prizes and leaderboards (section 13) are also industry-agnostic engine features.
- Calendars and module feedback (sections 28 and 19.1) are engine features too.
- External training evidence and approvals (section 27) are engine features too. Packs set which requirements accept external certificates and the accepted providers.
- Provider support operations (section 26) are engine features too. Packs ship the starter content used by onboarding.
- Support tickets and the feature and issue type lists (section 25) are engine features too. Packs may add industry-specific feature names.
- Roles, permissions and 2FA (section 22) are engine features too. The provider and client permission systems share one schema and engine with different catalogues and UX levels, and packs may ship suggested default client roles.
- Feedback, FAQs, accessibility settings, themes, packaging and entitlements, easy login, auto-assign rules, reminders and multilingual support (sections 19 to 21) are engine features too. Packs ship default FAQs, default auto-assign rules and suggested reminder policies.
- Module categories, groups, search, learner notes and closed-book mode (sections 17 and 18) are engine features too. Packs only ship default categories.
- The staff progress and game-like experience (section 16) is an engine feature too. Badge and level definitions are engine-level config, and packs may add industry-specific badges.
- Multi-site support and the provider operations dashboard (sections 14 and 15) are engine features too. Site is the neutral term for a location in every industry.
- Battle Room (section 32) is an engine feature too. Packs supply the host checklist (for example ratios in nurseries, back of house only in luxury retail).
- Learn more links and client link overlays (section 31) are engine features too. Packs ship the official links for their provider modules.
- Organisation display names and the provider review of billing names (section 30) are engine features too, as is the per-pack prize suggestion list (section 13.3).
- Sites carry pack-defined attributes, and requirements can apply only at sites with matching attributes (section 29.3), for example a store registered as a high value dealer.
- The client Module Library, Module Builder and stats (sections 5.1, 5.2 and 8) are industry-agnostic engine features. They live outside the packs, and packs only supply starter modules.

## 13. Competitions, prizes and leaderboards (headline selling point)

A headline selling point: client admins run competition campaigns with custom prizes to motivate their staff. Prizes are free text for now. There are no external integrations (no buying or delivering vouchers); the client provides prizes offline.

Why it may matter commercially (hypothesis, validate in interviews): it gives managers a reason to open the app regularly and gives staff a reason to come back, which supports retention of clients. It only works if the underlying training is good, and the prize cost is borne by the client.

### 13.1 Design principles

These extend the user's reasoning that a fastest-to-finish leaderboard is bad, because people could click through and guess to climb it without learning anything.

- Never rank by speed. No competition or leaderboard may use completion speed, time spent or fewest attempts as its metric. The only exception is the opt-in Speed mode inside a Battle Room, which has no effect outside the room (section 32.4).
- Reward correct learning and consistency, and resist farming. Count each question answered correctly once per person (unique questions), and each module completed once. Retakes are good for learning but do not add points.
- XP (section 16) is a personal progress measure only. It is never used for any ranking, so grinding XP cannot win a competition.
- Do not punish. Show the top places only (for example the top 10), never a bottom list. A staff member sees their own position privately. Ties are shared or settled by random draw, never by who got there first.
- Be fair to different working patterns: part-timers, new starters, people on leave and learners who work at a different pace. Offer this-month views alongside all-time boards, team percentage boards, random draws among everyone who qualifies, and an admin option to exclude people (for example on leave) from a competition.
- Privacy and wellbeing: staff can hide themselves from leaderboards, and names show as first name plus initial or a nickname. Banners never block learning, never nag and can be dismissed.
- Training comes first. Competitions are optional extras and must never replace or delay mandatory training. Due-training cards always sit above competition banners.
- Leaderboards are commonly reported to demotivate people ranked low, which is why the top-only and private-position rules exist (general knowledge, VERIFY).

### 13.2 Competition types

Every competition has a custom start date and end date, and a prize. There are two types.

1. Built-in competitions use metrics already in the app. The admin picks a template, dates, prize, eligible staff, how the winner is chosen, and whether the leaderboard is live before the end date.
2. Custom competitions have only a name, a start date, an end date and a prize (plus an optional short description). There is no metric and no leaderboard. The admin runs and judges it outside the app, for example a staff-room photo contest or a bake-off. Staff see the banner and the details screen only.

Common fields: name, description, start, end, prize text, eligibility (all staff, selected roles or teams, and named exclusions), and status (Draft, Scheduled, Live, Ended, Cancelled).

Built-in only: template, winner selection (top of the leaderboard, random draw among everyone who qualifies, or team target reached), number of winners, the leaderboard toggle, and an optional closed-book-only setting where only answers given with notes locked count (section 18.4).

Leaderboard toggle: the admin chooses whether staff can see the leaderboard before the end date. If off, it is hidden from staff until the end date and the final results are then shown (confirmed default). Admins can always see it. Custom competitions never have leaderboards.

Rules: the end must be after the start. The metric cannot be changed once the competition has started. The end date can be extended. An admin can cancel a competition. Ended competitions stay in a history list.

### 13.3 Prize field and prize generator

- The prize is a single text field. A Suggest a prize button fills it with the next idea from the fixed list below. It cycles in a shuffled order and never repeats the same idea twice in a row. Tapping again moves to the next idea.
- The text stays fully editable. The admin can change the amount or wording, keep cycling, or clear the field with a clear (x) button and type their own idea.
- Suggestions are pre-filled with concrete default amounts so they are easy to edit.
- The list is for adults aged roughly 18-60, mostly low cost, with no alcohol, tobacco or gambling items, so it works for religious, health and care or childcare workplaces.
- Industry packs can supply their own suggestion list. The luxury retail pack uses experiences suited to a heritage house instead of shop vouchers (section 29.10).
- The screen shows a short disclaimer: the client provides and pays for the prize and is responsible for any tax, payroll or legal implications (section 13.7).

The 20 suggestions (store as a JSON file):

1. £20 online shopping voucher (retailer of the winner's choice)
2. £25 high street shopping voucher
3. £15 coffee shop voucher
4. x1 free lunch (max spend £10)
5. Luxury face mask kit
6. Cinema trip for two (up to £25)
7. £20 takeaway or food delivery voucher
8. Box of premium chocolates (up to £15)
9. £15 book voucher
10. Pamper bath and candle gift set
11. Indoor plant and pot (up to £15)
12. Extra paid hour off, agreed with your manager
13. £20 wellbeing voucher (massage, yoga or fitness class)
14. Gourmet tea and coffee gift set (up to £20)
15. Movie night kit: snacks and a £10 streaming voucher
16. Board game or puzzle of your choice (up to £20)
17. £20 garden centre voucher
18. Insulated travel mug and tote bag set (up to £20)
19. Afternoon tea for two (up to £30)
20. Team pizza lunch (up to £50, ideal for team prizes)

### 13.4 Built-in competition templates, with reasoning

All templates follow the principles in 13.1. None uses speed.

1. Mastery Month: most modules mastered in the period. Mastered means every question answered correctly at least once, and retakes are allowed. Why: it rewards real knowledge, retries are encouraged rather than penalised, and speed is irrelevant.
2. Knowledge Builder: most unique questions answered correctly in the period. Why: it rewards the amount of correct learning and cannot be farmed by repeating the same quiz.
3. Learning Streak Challenge: most active learning weeks in the period. A week counts when the person completes at least one lesson or quiz. Why: it encourages little-and-often learning that suits shift work, spamming does not help because each week counts once, and counting total active weeks rather than an unbroken streak means holidays or sickness do not wipe out progress.
4. Team Showdown: teams or rooms within a site, or whole sites across a region, a country or all sites, compete on the percentage of their assigned training completed before the due date. Why: percentages are fair to teams and sites of different sizes, a shared goal builds peer support, and no individual is ranked or shamed.
5. Beat the Expiry: anyone who completes a due refresher (safeguarding, first aid, food hygiene and so on) before it expires, within the window, is entered into a random draw. Refreshers done outside the app count by their completed date once the certificate is approved (section 27). Why: it rewards proactive compliance, which is the manager's real problem, and not speed.
6. Complete and Win: everyone who completes and passes chosen modules by the end date is entered into a random draw. Why: every qualifier has an equal chance, so there is no reason to race or game it. It is ideal for must-do training such as the September framework update.
7. Scenario Savvy: most scenario questions answered with the best outcome, counted once per question. Why: it rewards judgement, which is what inspectors want staff to show.
8. Closed-Book Challenge: most unique questions answered correctly in closed-book mode in the period (section 18.4). Why: it rewards recall without leaning on notes, and the system locks notes in counted attempts. Learners who prefer notes can still take open-book attempts that simply do not count, so nobody is blocked from training.

### 13.5 Standing leaderboards (always on)

These sit outside any competition and are visible to staff and client admins. Each offers an All time view and a This month view, so newer staff are not permanently behind long-serving colleagues. Each shows the top 10 plus the viewer's own position, and each can be switched off by the admin.

1. Most questions answered correctly (all time): unique questions, each counted once.
2. Most modules completed (all time): each module counted once when passed. Only published modules count, and a new version does not count again.
3. Most modules mastered: every question answered correctly at least once.
4. Most active learning weeks: total weeks with learning activity, not an unbroken streak.
5. Refresher Champions: most refreshers completed before they expired.
6. Team board: percentage of assigned training completed on time, by team or room, shown at team level only.
7. Sites board: the client's sites ranked against each other, using per-person and percentage measures only (see Sites board below).

Scopes. Each individual board can be viewed at up to four scopes, and a scope appears only when it applies:

- My site: people at the viewer's site.
- My region: people at sites in the same region (for example London or the North West), if the client has sites in more than one region.
- My country (national): people at sites in the same country, if the client has sites in more than one country.
- All sites (global): people across every site the client has, worldwide.

Single-site clients never see scopes or the Sites board. Leaderboards never mix different clients (section 13.8).

Sites board (site versus site):

- Measures, each a separate tab: Compliance (percentage of required items current), On-time completion (percentage of assigned training completed by its due date), Participation (percentage of staff with learning activity this month), and Knowledge (modules mastered per active person this month). Packs can add their own: the luxury retail pack adds Collection readiness (percentage of client-facing staff who have completed the current collection, section 29.7).
- Scopes: My region, My country (national) and All sites (global).
- Fairness: per-person and percentage measures only, never totals, so a small boutique can beat a flagship. People on leave and new starters in their first 14 days (placeholder) are left out of the calculation. Sites with fewer than 3 active staff (placeholder) are marked as small sites and can be excluded by the admin. Ties are shared. Time windows are This month and This quarter rather than All time, so a site that falls behind can recover.
- Visibility: staff see the top 10 sites plus their own site's position, with what it would take to move up (for example "2 more people completing the collection would move your store up one place", computed from the live numbers). Staff never see a bottom-of-the-table list. Site managers see the same plus their site's measures in detail. Group admins see the full ranking with drill-down, which is the site comparison in section 14.2.

Defaults (confirmed default), set per client in leaderboard settings:

- Individual boards: My site scope only, because wider scopes show names to many more people. Admins can switch on region, national and global individual boards. When they do, names show as first name, initial and site, and the hide-from-leaderboards setting still applies.
- Sites board: on, at the widest scope the client has.

Deliberately excluded: fastest completion, time spent, shortest attempts, any bottom-of-the-table list, and any ranking that rewards less thorough work.

### 13.6 Staff experience

- Competition banners appear on the staff home screen when logged in, below any due-training card. One banner per live competition, as a swipeable carousel if there are several. Each shows the name, a short prize line and days left.
- Tapping a banner opens the details (a bottom sheet on phone): description, prize, dates and countdown, how to win in plain English, the person's own progress (for example 3 of 5 modules), the leaderboard if the admin has enabled it, who is eligible, and after the end, the winner announcement if the admin recorded one.
- A banner can be dismissed for the session. All competitions, the standing boards and the Sites board stay available in the Compete tab (section 16.2), which is also where Battle Room starts (section 32.2).
- No pop-ups, no pressure wording in countdowns, and no notifications by default.
- Staff who are not eligible still see the details, with a short note.

### 13.7 Legal and practical notes

All from general knowledge. Verify with an adviser before launch (VERIFY).

- Keep entry free. Never charge staff to enter or require a purchase. Merit-based competitions and free random draws among qualifiers are generally low risk, but check UK gambling and lottery rules.
- Tax and payroll: prizes such as vouchers can be taxable benefits for the employer, and the HMRC trivial benefits exemption may not cover rewards for work performance or cash-equivalent vouchers. The app should show a clear disclaimer that the client is responsible, and must not give tax advice.
- Equality and fairness: avoid rules or prizes that disadvantage part-timers, carers or disabled staff. Allow exclusions for leave, and keep non-physical prize options such as time off. Closed-book competitions can disadvantage staff who use notes as a reasonable adjustment, so keep them optional with an open alternative (section 18.4).
- Fulfilment is offline: the admin records the winner and hands over the prize.

### 13.8 Data and implementation notes

- Competition record: id, type, template, name, description, start, end, prize text, scope (the sites, region or country it covers, section 13.5), eligibility, winner selection, number of winners, leaderboard visibility, closed-book only (section 18.4), module ids, status, recorded winners.
- Metrics come from the event log in section 9. Each event needs the user, module, module version, question id, whether the answer was correct, and a timestamp, so unique correct questions, mastered modules and active weeks can be derived. Competitions count only events inside their window, while all-time boards count everything. Keep a per-person set of questions already credited.
- Leaderboards show a display name (first name plus initial, or a nickname) and respect each person's opt-out. In the PoC, ranks are computed on the device from seeded and local data.
- Seed the demo with: one live built-in competition with a populated leaderboard, one live custom competition, one ended competition with a recorded winner, and populated standing leaderboards.
- Competition templates are engine-level features that work in any industry. Prize suggestions live in a JSON file per industry pack (section 13.3), and packs may add their own competition templates later.
- Leaderboards are scoped within one client, then by site, region, country or all sites (section 13.5). Cross-client leaderboards are out of scope, for privacy.

### 13.9 Demo flow

As the manager: create a competition, choose Mastery Month, tap the prize button to cycle to an idea, edit the amount, set the dates, switch the live leaderboard on and publish. Switch to the staff view, see the banner, tap it, and see the prize, personal progress and leaderboard.

## 14. Multi-site clients

Some clients run several sites, for example a nursery group with five nurseries. Client admins must be able to see staff organised per site.

### 14.1 Hierarchy and roles

- Structure: Client (the organisation), then Sites, then optional Teams (rooms or departments), then Staff. Site is the neutral term for a nursery, care home, shop, venue or school. Nursery wording such as setting lives in the nursery pack.
- Each site records its country and an optional region chosen by the client (for example London or the North West). These drive the regional, national and global leaderboard views (section 13.5) and competition scopes.
- Roles: Group admin (sees and manages all sites), Site manager (sees and manages only their own site or sites), and Staff (learn only). A site manager can be assigned more than one site.
- Each staff member has a primary site. Some staff float between sites (bank, cover or peripatetic staff), so allow additional site links, and count the person once in roll-ups using the primary site.
- Transferring a person between sites keeps their full training history and records. Only the site link and its effective date change.
- Single-site clients never see any multi-site UI.

### 14.2 Client dashboard changes

- A site switcher in the header: All sites (group roll-up) or one site.
- Staff list organised per site: a collapsible section per site showing staff count, compliance percentage, and counts of overdue and expiring items. On a phone, sites are expandable cards. On desktop, a grouped table with filters for site, team, role and status. A flat list with search is also available.
- Group overview with a site comparison: compliance percentage, overdue and expiring counts, completion rate and staff count per site, sorted so the site needing most attention comes first. Tapping a site drills in.
- Training matrix and inspector-ready exports per site as well as for the whole group. In England each nursery is typically inspected as its own registered setting, so per-site exports matter (VERIFY).
- Stats (section 5.2) can be filtered by site and compared between sites.
- Assignments, due dates and reminders can target a site, a team, a role or a person.
- Module Library: modules are group-wide by default. A site-specific module, such as a local fire evacuation plan, is visible only to that site. Group admins edit group modules and site managers edit only their site's modules (assumed).
- Policy acknowledgements can be per site.
- Competitions and leaderboards (section 13): a competition can cover one site, selected sites, a region, a country or all sites, and Team Showdown can compare sites with each other. Standing leaderboards offer My site, My region, My country and All sites views, plus a Sites board ranking sites against each other (section 13.5). Staff see their own site by default for individual boards (assumed). Site managers can create competitions for their own site only.
- The client Billing page lists charges per site and for the whole group (section 23.6).

### 14.3 Data model notes

- Site: id, client id, name, short address or label, country, optional region, status, timezone, optional pack-specific references (for nurseries, a registration reference such as an Ofsted URN) and pack-defined attributes (for luxury retail, store type and high value dealer registration, section 29.3). Team: id, site id, name.
- Staff have a primary site id and a list of additional site ids.
- Every record, assignment, completion and event carries the site id as it was at the time, so history stays correct after transfers.
- Site scope is enforced in every list, stat, export and leaderboard query.
- Seeded demo: one client group with three sites (about 6, 5 and 4 staff, different compliance profiles, one site clearly behind), plus a single-site client, so both modes can be shown.

### 14.4 Complications and tradeoffs

- Floating staff must not be double counted in roll-ups.
- Privacy between sites: site managers see only their own site. What staff see on wider leaderboards is set in section 13.5 (individual boards default to My site).
- Local rules and registrations can differ per site, and per country within the UK, so keep requirements configurable per site.
- Pricing: per site, per staff member or tiered group pricing. The billing mock should be able to show per-site charges.
- UI complexity: keep single-site clients simple by showing the multi-site UI only when a client has more than one site.

## 15. Provider operations dashboard (internal admin)

The internal admin app must show how every client is using the product: number of sites, staff, usage per feature, API usage, errors, logging and more.

Important PoC limit: a static GitHub Pages app has no server, so there is no real cross-client telemetry, API traffic or server log. In the PoC these views run on seeded, clearly labelled simulated data, plus a genuine This device view built from the app's own local event and error log. A real version needs a backend and a telemetry pipeline.

### 15.1 Platform overview

- Totals and trends: clients (by status: trial, active, at risk, churned), sites, staff, active learners (daily, weekly, monthly), lessons completed, quiz attempts, MRR (mock), error rate, and API calls.
- Lists: clients needing attention (low usage, falling activity, many overdue items, recent errors) and top features by use.

### 15.2 Client list

- A New client button opens the onboarding wizard (section 26.1).
- Columns: client name, industry pack, plan, status, number of sites, number of staff (total, and active in the last 30 days), last activity, health score, MRR (mock) and open errors.
- Search, filter, sort and CSV export. Cards on phone.

### 15.3 Client detail page

Tabs: Overview, Sites, Staff, Usage, API, Errors and logs, Support tickets (section 25), Billing, Modules, Competitions, Audit.

- Overview: display name, billing name and name history with the Billing name differs badge (section 30.3), plan, status, contract dates, health score with its reasons, and notes.
- Sites: a table of sites with staff count, active staff, compliance percentage and last activity per site.
- Staff: counts by site, role and status (active, invited, archived). By default the provider sees numbers and roles, not detailed personal records.
- Usage per feature: adoption and activity for logins, modules started and completed, quiz attempts, Module Builder (modules created and published), competitions created, battles hosted and players per battle (section 32.10), leaderboard views, banner taps, exports generated, assignments sent and reminders. Show 30 and 90 day trends, usage against plan limits, and adoption percentages.
- API: calls per day and per endpoint, error rate, response time, rate-limit hits, and API key management (create and revoke). This applies once an API exists, which is a future feature.
- Errors and logs: see 15.5.
- Billing: plan, sites and seats billed, invoices (mock), usage against limits, and any price override, discount or increase with its dates (section 23.11).
- Audit: provider-side actions on this client (section 15.6).

### 15.4 Client health score (churn prevention)

A simple score built from adoption signals: logins in the last 14 days, percentage of staff active, training completion trend, overdue compliance, features used, and recent errors. Show the score with the reasons behind it, and keep an at-risk list. This is a hypothesis to validate, and it supports the retention goals in section 4.

### 15.5 Errors and logging

- Structured log viewer: time, severity (info, warning, error), client, site, feature, event type, message, and request or session id. Filter by client, site, severity, feature and date range, with full-text search.
- Error grouping: identical errors grouped with a count, first and last seen, affected clients and sites, and number of affected users.
- Detail view: message or stack trace, app version, device and browser, and the events leading up to the error.
- Status: open, acknowledged or resolved, with an optional note.
- Alerts (later): spikes in errors or API failures for a client.
- Privacy by design: logs must not contain child data or personal staff details beyond internal ids. Redact free text and email addresses. Set a retention period (for example 30-90 days, decided with an adviser) and restrict who can view logs.

### 15.6 Access control and audit

- Provider roles and permissions: a full permission matrix with custom roles, ownership transfer and 2FA (section 22). By default, support staff can see logs and usage but not personal staff records.
- Any provider access to client data, including a view-as-client mode, must be explicit, time-limited and written to an audit log that the client can see. Check with a data protection adviser, since the provider generally acts as a processor of client data under UK GDPR (VERIFY).

### 15.7 PoC implementation

- Seed 13 fictional clients across the six packs (4 fully detailed and 9 summary clients, Build Pack section 7.2), with different plans, sizes and statuses and 1 to 5 sites each. Seed 90 days of daily usage per feature, API calls, and a few dozen errors and log entries so charts look real. Show a visible Simulated data badge.
- A This device tab shows genuine local events and errors, for example from the app's own error handlers, so the logging pipeline is real even though cross-client telemetry is not.
- Use the chart rules in section 6 and the event model in section 9, with extra event types for features such as the builder, competitions and exports.
- Production candidates (VERIFY): a backend with authentication and a database, an established or open-source product analytics and error tracking stack, structured logging with correlation ids, role-based access control, and an audit log.
- API metrics assume a future public or integration API (for example staff import, single sign-on, or links to nursery management software such as Famly). No API exists in the PoC, so the API views are simulated and marked as roadmap.

## 16. Staff progress and game-like learner experience

Staff can track their progress through courses: what they have completed, what they still need for compliance and how often it renews, their history, and where they sit on competition leaderboards. The feel is Duolingo-style, visual and game-like, suited to younger phone users yet easy for older staff.

### 16.1 Design stance: borrow the mechanics, drop the manipulation

Duolingo's model uses XP, streaks, badges, and leaderboards organised into leagues with promotion and demotion zones. Research and commentary (mostly blogs and case studies, so directional) report these problems: streaks create anxiety and guilt-driven notifications, XP boosts and leagues push people to rush and grind rather than learn, XP can reward easy repeated practice over new learning (sometimes called ghost engagement), the novelty of gamification wears off, and competing against strangers can demotivate.

Keep:

- A visual learning path and progress rings.
- XP as a personal measure of real learning, plus levels.
- Milestone badges and brief, friendly celebrations.
- A gentle weekly rhythm in place of a daily streak.
- A clear next action on every screen.
- The person's own leaderboard position (shown privately, section 13).

Drop:

- Demotion zones and promotion leagues.
- Random bonus rewards and XP boosts (variable rewards).
- Loss-based streak pressure and guilt-trip notifications or mascots.
- Hearts or lives that block learning.
- Ranking against strangers: boards stay within the person's own site or client.

Rules:

- XP rewards real learning only: new lessons, passed quizzes, mastered modules, refreshers completed early, and a small capped amount for correct answers in Battle Room (section 32.9). Repeating already-mastered content earns reduced or no XP, there is a daily XP cap, and nothing earns XP for speed.
- XP is personal progress only. It is never used for any ranking or competition, so grinding XP cannot win anything. Leaderboards use the metrics in section 13.
- Closed-book bonus: a correct answer given with notes hidden earns extra XP, shown transparently in the quiz header (section 18.3). It is personal only and never affects rankings, except in closed-book competitions where the system locks notes.
- A weekly goal replaces the daily streak. The total of active learning weeks never resets. A current run is shown softly, with automatic rest weeks for leave, and there is never a red lost-your-streak state.
- Compliance comes first. Mandatory training is never gated behind, or made to look optional beside, game elements.
- No notifications by default. Any reminders are neutral in tone and the person controls them.

### 16.2 Staff screens

Bottom tab bar with 4-5 tabs, each with an icon and a text label: Home, Learn, Progress, Compete, Me.

- Home: a friendly greeting, a progress ring for compliance (for example You're compliant, or 2 to do), a single Next up card (due training always first), the weekly goal ring, then a Coming up strip with the next three dates and a link to the full calendar (section 28), competition banners, the latest badge, and a My notes button (section 18).
- Learn: a visual learning path per module, with lessons as connected nodes (done, current, next). Modules can be started in any order, and lessons within a module build in sequence. A Simple view toggle swaps the path for a plain list. A search bar, filters, category cards and group rows sit at the top (section 17).
- Progress, in five parts (Calendar is the fifth, section 28):
  - My compliance: a checklist of everything the person must have (the requirements in section 12.3), each with status (Current, Due soon, Overdue, Not started), last completed date, next renewal date, how often it renews (for example every 2 years), and an action button (Start training, or Upload certificate where external evidence is accepted, section 27). Items awaiting approval show Awaiting check.
  - Completed: completed modules with date, score and certificate.
  - History: a timeline of lessons, quiz attempts, scores and badges, with a weekly activity chart and a score trend, filterable by year or module. Optional download of their own training record as a PDF (confirmed default).
  - XP and level: a level progress bar and recent XP, with what earned it.
  - Calendar: the staff calendar in section 28.
- Compete: live competitions with the person's own progress, and the standing leaderboards from section 13.5, with a scope switch (My site, region, country, all sites, where they apply) and the Sites board showing where their site stands. The person's row is highlighted. They see their exact position privately, for example You're 4th of 14, with the points or items needed to reach the next place. Outside the top 10 they still see their own position and progress, never a bottom-of-the-table list. A Battle Room button on this tab opens live quiz battles (section 32).
- Me: display name or nickname, hide-from-leaderboards switch, badge collection, accessibility settings (text size, contrast, reduce motion, sound, Simple view) and notification preferences.

### 16.3 Game elements, concretely

- XP and levels: plain numbered levels with a progress bar to the next level. Level thresholds are config.
- Weekly goal: default of one lesson per week, configurable by the client admin. Completing it fills a ring.
- Badges, adult and milestone-based, never for speed: First module, Safeguarding Ready, Mastery (per module), Early Bird (refresher done before expiry), Scenario Savvy, Learning Habit (four active weeks), All Compliant, competition winner, and the Battle Room badges (section 32.9). Unearned badges show as next goals.
- Celebrations: a short tasteful animation on lesson and module completion (a ring fill, a tick, a small confetti burst), with haptics where supported. Sound is off by default and reduced-motion settings are respected.
- The biggest reward is the all-compliant moment: the compliance ring turning green with a short celebration.
- Style: modern and youthful, with rounded cards, bold accent colours, big numerals and smooth motion, but not childish. No mascot in the PoC (revisit later).

### 16.4 Working for all ages

- Simplify, and make controls larger and well spaced. In a systematic review of usability studies with people over 60, these two were the most significant of 27 guidelines.
- Body text of at least 16px (studies suggest older adults prefer at least 14pt and sans serif fonts), a text-size setting that also honours the device setting, and line height of about 1.5.
- A bottom tab bar with 3-5 labelled options. No hamburger menus. Icons always come with text labels, and labels are descriptive, not cute.
- Every swipe or gesture has a plain button alternative. Taps give obvious feedback.
- Short, skippable three-screen onboarding, contextual help where needed, and confirmation for anything destructive.
- A user-chosen Simple view (list instead of path, minimal animation, larger text). It is a setting, not an age label.
- No time pressure anywhere. Never rely on colour alone, and keep contrast high (section 6).
- Test with real younger and older users before relying on any of this.

### 16.5 Data needed

- Requirement status per person (section 12.3): requirement, last completed date, expiry date, renewal cadence and status.
- The event log (section 9) provides history, scores and timestamps. All staff-facing numbers come from the same events as the manager stats, so staff and manager views never disagree.
- An XP ledger: each entry has a type, amount, source and date, so XP cannot be awarded twice and repeat-content rules can be applied.
- Earned badges, a weekly activity table, and preferences (display name, hide from leaderboards, Simple view, text size, reduced motion, sound).
- Config for level thresholds and badge definitions, kept at engine level.
- Seeded demo personas to switch between, so both generations can be shown. Suggested: a younger room leader who is an avid learner, a 58-year-old cook who is less confident with technology and is behind on food hygiene, and a new starter with almost no history. All fictional.

### 16.6 Tradeoffs and risks

- Engagement versus pressure: more game-like means more habit-forming. Keep the guardrails in 16.1 and review them with real users.
- Novelty fades, so tie the game layer to real value (the compliance status), not points alone.
- Build cost: animations and illustration take time. PoC priority is the learning path, progress rings, compliance checklist, history, XP and level, weekly goal, badges and leaderboard position. Defer avatars, sound and elaborate animation.
- Older users may find the path unfamiliar, so the Simple view must be easy to find and fully equivalent.
- Privacy: staff see their full history, managers see summaries, and staff can hide from leaderboards and download their record.

## 17. Organising and finding modules

Client admins can group and categorise modules. Staff can search and filter them.

### 17.1 Categories and groups (client admin)

- Categories are topic labels such as Safeguarding, Health and safety, Food and nutrition, and Induction. Each module has one primary category. Admins can create, rename, recolour, give an icon, reorder, merge and delete categories (deleting asks where to move its modules). The nursery pack ships default categories, and other packs ship their own.
- Groups (also called collections or programmes) are ordered bundles of modules, such as New starter induction or Baby room essentials. A module can sit in several groups. A group can be assigned as a bundle to people, roles, teams or sites with one due date, and staff see group progress (for example 3 of 6 complete). The admin chooses whether a group must be completed in order or in any order.
- Provider modules are read-only, but categorising and grouping them is a client-level layer. A client can place any module they can see into their own categories and groups without changing the module itself.
- Management actions: create and edit, select several modules and add them to a category or group in one go, and reorder with move up and move down buttons rather than drag only, which is better for phones and accessibility. Counts and completion are shown per category and group.
- The Module Library filters (section 5.1) include category and group.
- Multi-site (section 14): categories and groups are group-wide by default, and a site manager can create site-level groups for their own site.

### 17.2 Search and filter (staff)

- The Learn tab has a search bar at the top and a Filters button, plus category cards and group rows for browsing.
- Search covers module titles, descriptions, lesson titles and category names. In the PoC it runs entirely on the device from the module data. Results update as the person types, with matches highlighted and a friendly no-results state.
- Filters: category, group, status (Not started, In progress, Completed), requirement (Required, Optional), due soon or overdue, and length (for example under 10 minutes). Sort by due date, recently active, or A to Z.
- Filters open in a sheet with large controls, a live count on the apply button (for example Show 8 modules), and a clear Reset filters option. Active filters appear as removable chips.
- Required and due-soon modules stay prominent. The default Learn view lists required and due items first, then everything else, so browsing never hides compliance work.
- Staff see the modules assigned to them plus optional modules the client has made available to them (confirmed default), each with a Required or Optional badge.
- Notes have their own search (section 18).

### 17.3 Data notes

- Category: id, client id, name, colour, icon, order. Group: id, client id, name, description, ordered module ids, and an in-order flag. Module-to-category and module-to-group mappings live in the client layer, not in the module itself.
- Seed the demo with about six categories and three groups.

### 17.4 Tradeoffs

- One category per module keeps things simple. Many-to-many tags give flexibility but add clutter. Start with one category plus groups, and consider tags later.
- Search over a large library may need a proper index library (VERIFY candidates). For the PoC's small data set, simple filtering is enough.

## 18. Learner notes and closed-book mode

Staff can take notes during each course and show or hide them during quizzes. Hiding notes earns more XP than showing them, and competitions can require notes to stay hidden, enforced by the system.

### 18.1 Taking notes

- Every lesson screen has a clearly labelled Add note button in a consistent, thumb-friendly position. It opens a bottom sheet with a text field, the module name and lesson name shown at the top, and Save.
- Notes are plain text with a sensible length limit (assumed 1,000 characters). They can be edited, deleted and starred. Each note records its module, lesson, and created and updated times.
- Notes are private to the learner. Managers and the provider cannot read note content (confirmed default). Staff are reminded not to write personal details about children or colleagues in notes.
- Notes autosave locally, so nothing is lost if the person leaves mid-lesson.

### 18.2 Where notes are found, and keeping the course obvious

1. General notes: a My notes button on the Home screen, also reachable from Learn and Me. It opens all notes grouped under headings by course. Each note card always shows a course name chip with the module's category colour and icon, the lesson name and the date. There is search, filtering by course or category, and a starred filter. Tapping the course name chip opens that course, at the lesson where the note was written when that lesson still exists.
2. Inside a course: a Notes button in the course header opens a panel showing only that course's notes. The panel header always reads Notes for followed by the course name, in the course's colour, with a link to All my notes.
3. During a quiz: a Show notes or Hide notes control (section 18.3). The panel uses the same course header, so the learner can always see which course the notes belong to.

Edge cases:

- If a module is archived or removed, its notes stay in General notes under the course name with a Course no longer available label and no link.
- When a module gets a new version, notes stay attached to the module. If their lesson no longer exists, tapping the chip opens the start of the module.

### 18.3 Show or hide notes during quizzes, and XP

- The default is notes hidden. The quiz header shows a clear control reading Notes hidden: bonus XP or Notes shown: standard XP, so the tradeoff is transparent.
- Each answer records whether notes were visible when it was answered. This is per question, so peeking on one question does not cost the bonus on the others. Once notes have been shown for a question, that question cannot later be counted as closed-book.
- XP: a correct answer given with notes hidden earns a closed-book bonus on top of standard XP (placeholder: 1.5 times standard XP, configurable). The XP rules in section 16.1 still apply: nothing for speed, reduced or no XP for repeated content, and a daily cap.
- XP is personal and never used for rankings, so the open versus closed difference affects only the person's own XP, except in closed-book competitions (section 18.4).
- Admin setting per module (section 8): Notes in quizzes can be Choice (the default) or Closed-book only. In closed-book-only modules the notes control is absent during quizzes and a short explanation is shown.
- The attempt record stores the mode. Managers see only an aggregated split of open-book and closed-book answers per module, never note content (assumed).

### 18.4 Closed-book competitions (system enforced)

- Competition option: Closed-book only, for built-in competitions. Only answers given with notes locked count toward the competition metric.
- Enforcement is by the system, not an honour system inside the app. When a learner starts a quiz in a module that is in scope, they choose before the first question: Closed-book (notes locked, counts for the competition) or Open-book (notes available, does not count for the competition). The choice is fixed for that attempt. In closed-book mode the notes button is replaced by a locked indicator, note content cannot be opened during the quiz, and Learn more links stay hidden until the attempt ends (section 31.4).
- Competition banners and details state plainly that the competition is closed-book, and show the learner their counted progress.
- Candidate template: Closed-Book Challenge, ranking the most unique questions answered correctly in closed-book mode during the period, with the same no-speed and no-farming rules as section 13.1.
- Limit to state honestly: the app cannot stop someone using paper notes, screenshots or another device. Random draws among qualifiers are less sensitive to this than top-of-leaderboard prizes.
- Fairness: closed-book competitions can disadvantage staff who rely on notes as a reasonable adjustment, for example dyslexia or English as an additional language. Keep them optional, never make a compliance pass mark depend on closed-book mode, and always offer an open alternative (section 13.7).

### 18.5 Data notes

- Note: id, user id, module id, lesson id (optional), body, starred, created at, updated at.
- Quiz answer events (section 9) gain a notes-visible flag, the attempt mode (open or closed), and the competition id where relevant. The XP ledger records closed-book bonus entries separately.
- Notes live in their own IndexedDB store in the PoC. They are private to the device and learner, and are included in the JSON state export only if the person chooses (assumed).
- Seed demo notes for each persona so the General notes screen is populated.

### 18.6 Tradeoffs and risks

- Notes visible during quizzes weaken the quiz as evidence of knowledge. The recorded mode makes this visible, and modules needing stronger evidence can be closed-book only.
- A bonus for hiding notes might discourage people from using notes at all. Notes stay unrestricted while learning, and the bonus is modest and personal.
- Notes are free text and may hold personal data. Keep them private, remind staff what not to write, and plan retention and deletion rules before real data is used.
- Build cost is moderate. Notes create, edit and delete, the mode flag and the XP bonus are cheap. The locked-mode UI and competition filtering are the main extra work.

## 19. Feedback, help, accessibility settings and themes

Staff and client admins can give feedback at any point, both apps have FAQs, users can customise common accessibility settings, and client admins have a theme builder with seasonal presets and a package-limited number of saved themes.

### 19.1 Feedback: app feedback to the provider, module feedback to client admins

Two separate streams, so each reaches the people who can act on it.

App feedback (about the app itself) goes to the provider, so the user can see what is and is not working:

- Entry points on every screen: a Help and feedback item in the header menu (a question mark icon with a text label), and on desktop a small unobtrusive feedback tab. The button never covers content and is never a pop-up.
- The sheet: type (Idea, Problem, Praise), an optional rating, and free text. Context is attached automatically: screen, role (staff or admin), client and site ids, app version, and device and browser. No other personal details are attached.
- Honest wording: the sheet tells staff plainly that app feedback goes to the product team and not to their manager (confirmed default).
- Provider feedback inbox (extends section 15): filterable by client, type, rating, screen and status (New, Triaged, Planned, Done, Won't do), with tags, search, themes, sentiment trends over time, and a link to errors and logs from the same session.
- A You said, we did changelog in the Help area shows what changed because of feedback (section 26.2).
- Optional pulse survey (off by default): at most one question about the app, no more than once every 30 days per person, to avoid survey fatigue.

Module feedback (about a specific module, lesson or question) goes to the client admins who can act on it:

- Entry points: a short feedback card at the end of every module (a rating from 1 to 5, quick tags, and an optional comment), a thumbs up or down at the end of each lesson, and Report a problem with this question on every quiz question.
- Quick tags (placeholder list, editable by the provider): Really useful, Clear, Unclear, Too long, Out of date, Mistake in a question, Not relevant to my role, Hard to use on my phone.
- Staff can choose Send anonymously. The card notes that in a small team the sender may still be guessable (confirmed default). Names are shown to admins otherwise.
- Client admins with View module feedback see it on each module's stats page (section 5.2), as a rating and tag counts in the Module Library (section 5.1), and in a Module feedback list across all modules, filterable by module, site, tag, rating and status (New, Reviewed, Actioned, No action needed).
- With Respond to module feedback, an admin can reply to the staff member (for example Thanks, we've updated the lesson), which arrives in the person's notification centre, closing the loop. Replies to anonymous feedback are not possible.
- Acting on it: for the client's own modules, an Edit module shortcut opens the Module Builder at the lesson or question concerned. For provider modules, which clients cannot edit, the admin can Escalate to provider with a note.
- Feedback on provider modules also reaches the provider automatically with names removed, grouped per module across all clients, so mistakes and out-of-date content are fixed once for everyone (in the provider content library, section 5 and 26.2). Feedback on a client's own module stays with that client; the provider sees only counts.
- Question reports (Mistake in a question) are flagged for priority review in both places.

Both streams:

- When someone needs a reply about a problem, the feedback sheet points them to a support ticket instead, and provider admins can convert app feedback into a ticket (section 25.1).
- Privacy: feedback text may contain personal data. Remind people not to include names of children or colleagues, redact where possible, and apply the retention period in section 24.6.
- PoC: feedback is stored on the device and shown in the provider inbox and the client admin views, alongside seeded entries, clearly labelled (section 15.7).

### 19.2 FAQs (separate for the staff app and the client admin app)

- A Help area reachable from the header menu and from Me or Settings, with search, categories, short answers, and a Was this helpful? control. At the bottom: Still stuck? Send feedback.
- Contextual help links where users commonly get stuck, for example in the Module Builder and when creating a competition.
- Staff FAQ topics to seed: how to see what I must complete, how renewals work, what XP and levels are, how notes and closed-book mode work, leaderboards and hiding yourself, changing text size, and what to do if I cannot log in.
- Client admin FAQ topics to seed: add staff and invite them, create and publish a module, categories and groups, assign training and auto-assign rules, competitions and prizes, themes, sites and roles, inspector-ready exports, and plan and billing.
- FAQ content is stored as Markdown or JSON in the repo. The provider maintains the global FAQs, and client admins can add a few client-specific FAQs such as who to ask for help locally (confirmed default).
- Helpfulness ratings feed the provider's usage view (section 15).

### 19.3 Display and accessibility settings (staff and admin)

A Display and accessibility screen in Me or Settings, also reachable from the login screen, applies changes instantly with a live preview. Defaults follow the device settings (text size, colour scheme, contrast and reduced motion). Settings persist per device in the PoC, and per user in production.

- Text size: steps from Default to Largest, up to at least 200%, with layouts that reflow and never truncate or overlap.
- Display zoom: a UI scale of about 100% to 150% as well as text size. Never disable browser pinch zoom.
- Contrast: Standard or High contrast, with stronger borders and higher contrast ratios.
- Colour mode: Light, Dark or Auto.
- Reduce motion: switches off celebrations and animations.
- Sound and haptics: separate switches, with sound off by default.
- Reading support: line and letter spacing, an optional dyslexia-friendly font (bundled and loaded only when chosen, check the licence), and left-aligned text.
- Bigger buttons: an option for larger touch targets.
- Simple view (section 16) and Read aloud (section 21.4).
- Reset to defaults.
- Baseline for everyone, not a setting: semantic HTML, screen reader labels, visible focus states, and testing with VoiceOver and TalkBack. The target is WCAG 2.2 AA, with a published accessibility statement.
- Dashboards and tables adapt at large text sizes, for example tables become cards.
- Accessibility settings are included in every package and are never paywalled. They always override a client's custom theme.

### 19.4 Theme builder (client admin)

- Prebuilt themes: Default (light and dark) plus seasonal presets. The user asked for Christmas, Halloween and Easter. Suggested additions: New Year, Valentine's Day, Spring, Summer, Bonfire Night, Diwali and Eid, so the set is inclusive.
- Custom builder: primary and accent colours, background tint, corner roundness, a font pairing from a small safe list, a logo (Group package), and optional subtle seasonal decorations such as a header icon. No heavy animation, and reduced-motion settings are respected.
- Guardrails: contrast is checked automatically (text 4.5 to 1, UI components 3 to 1) and the builder warns, auto-adjusts or blocks saving. Semantic colours (the red, amber and green status colours, errors and success) are fixed and not themeable. A theme can never hide or alter compliance information. A user's accessibility settings override any theme.
- Scheduling: an optional start and end date, for example Christmas from 1 December to 6 January, then it reverts automatically.
- Preview as staff before publishing, in a phone frame.
- Saved themes: the number of saved custom themes is limited by package (section 20). Prebuilt themes are always available. On a downgrade, nothing is deleted. The oldest themes within the new limit stay active and the rest become read-only until the client upgrades or removes some.
- Scope: a theme applies to the staff app by default, with an option to apply it to the admin app too (assumed). For multi-site clients (section 14), a group-wide theme is the default, with optional per-site overrides in the Group package (assumed).
- Implementation: all colours, radii and fonts are design tokens held as CSS variables, which suits a static site. A theme is a set of token values: id, client id, name, tokens, logo reference, decorations, schedule, and created date. Themes can be exported and imported as JSON.
- The provider sees theme counts against the limit in each client's usage tab (section 15).

## 20. Packaging, pricing and add-ons

Two packaging options are written up. Option A is the launch structure (decided 22 October 2026, section 3), and Option B stays in the demo for comparison. No prices are proposed here, only structure. The market anchor in section 4.3 is that competitors charge roughly GBP 30-35 per month for a 15-person nursery.

### 20.1 Principles

- Safety, accessibility, compliance basics and privacy are never paywalled.
- Charge for scale (sites, admins, modules created), customisation (themes and branding), and features with running costs (AI, messaging, translation, extra content).
- Price per site, banded by staff count, not per seat, because staff turnover makes per-seat billing awkward (section 4.2).
- Keep choices few: a small nursery manager wants a clear price.
- Competitions are the selling point, so every package includes a taste of them (one live competition) to show value early.

### 20.2 In every package (the floor)

- Learning, compliance requirements with expiry tracking, notes, search, categories, and basic stats.
- Easy login, reminders and the notification centre for compliance reminders (section 21).
- Feedback, FAQs, all accessibility settings, and read-aloud.
- XP, badges, standing leaderboards, and one live competition at a time.
- All prebuilt themes, plus one saved custom theme.
- Inspector-ready exports.
- Built-in client roles (Account Owner, Group Admin, Site Manager, Supervisor, Trainer, Viewer), the Team and permissions page, and authenticator-app 2FA for admins (section 22.5 and 22.6). Security is never paywalled. Only the number of custom client roles may be limited by package (confirmed default).
- Support tickets with screenshots (section 25). Higher packages get faster response targets, not access to support itself.
- Calendars for staff and client admins (section 28), and module feedback from staff to client admins (section 19.1).
- Learn more links on answers, including the client's own links and documents (section 31), and editing the organisation display name (section 30).

### 20.3 Option A: three tiers plus add-ons

Placeholder limits, to be tested with customers:

- Essentials: the floor, up to 3 of the client's own modules, 1 admin, 1 saved theme, 2 auto-assign rules, 1 live competition, 2 battles a month with up to 10 players.
- Standard: unlimited own modules, categories and groups, unlimited competitions including closed-book ones, 3 admins, 5 saved themes, unlimited auto-assign rules, unlimited battles with up to 30 players.
- Group: everything in Standard, plus multiple sites with site managers and group roll-ups, unlimited admins and saved themes, logo branding, integrations and SSO, priority support, and battles with up to 50 players including cross-site battles.
- Add-ons on any tier: AI Assistant, translation of content, SMS or WhatsApp reminders, extra industry content packs, and onboarding or white-label setup.
- Records Keeper (for clients who have cancelled): a low-cost, read-only archive plan to keep records online beyond the free export window (section 24.5). Available under Option A or Option B.

### 20.4 Option B: one plan plus add-ons

- Core plan: the floor plus unlimited own modules, categories and groups, unlimited competitions, 3 saved themes, 3 admins, unlimited auto-assign rules, and unlimited battles with up to 30 players (larger and cross-site battles with the multi-site add-on).
- Add-ons: multi-site and group roll-ups (per extra site), a branding pack (unlimited themes and logo), AI Assistant, translation, SMS or WhatsApp reminders, integrations and SSO, extra industry packs, and priority support and onboarding.

### 20.5 Comparison and current lean

- Option A is clear and predictable, with an obvious upgrade path. The risks are that clients pay for bundled features they do not use, and that tier boundaries feel arbitrary.
- Option B has a lower entry price and is pay for what you use. The risks are more decisions at purchase, harder forecasting and comparison, and add-on sprawl that can feel nickel-and-dime.
- Decision (22 October 2026): Option A for launch, with only four or five add-ons, because small managers want a simple choice. Option B stays in the demo switcher, so both can still be shown to managers. A hybrid, with tiers for scale and add-ons for running-cost features, is also possible.

### 20.6 Entitlements, limits and the PoC

- Each package is defined in JSON as entitlements (limits and on or off flags). The engine checks them wherever relevant, for example when creating a module, saving a theme or starting a competition. Swapping between Option A and Option B means swapping the config.
- Clients with the right permission manage add-ons and plans themselves in the client admin Billing area (section 23). Entitlements derive from the package plus active add-ons.
- The client admin sees usage against limits (for example 3 of 3 own modules) and a calm one-line upgrade prompt at the limit. Existing data is never blocked or deleted. On a downgrade, items beyond the new limit become read-only until the client upgrades or removes some.
- The provider admin can change a client's package and add-ons and see usage against limits (section 15), and can override prices or apply percentage discounts and increases for one client or many (section 23.11). The billing mock can show Option A or Option B.
- Demo: switch a demo client between packages and watch limits and locked cards change live.
- Free trial: a 30-day trial with sample data and no card is a hypothesis to test.

### 20.7 AI Assistant add-on

- Packaging: an add-on with a fair-use cap and optional top-up packs. One 2026 pricing report says about three quarters of SaaS vendors have announced AI surcharges, and common advice is to bundle basic AI and sell power features separately (vendor blogs, directional). Option to bundle basic AI into the top tier later.
- Learner uses: Explain this in simpler words, and Quiz me for practice. Practice quizzes earn no XP and do not count toward compliance or competitions.
- Client admin uses: draft a module from a pasted policy, and suggest quiz questions with source references. AI output is always a draft, labelled AI-drafted, and a human must review and approve it before it can be published.
- Guardrails: answers are grounded only in the client's approved modules and policies, and cite the module, lesson and source reference. The assistant says it does not know when something is out of scope. It gives no legal advice and no predictions about inspection outcomes, and never invents EYFS paragraph references. Staff are warned not to paste personal data, and children's data is never included.
- Governance: usage caps, a per-client kill switch, and an interaction log without personal data for audit and cost. Confirm that model providers do not train on client content (VERIFY).
- Technical: it needs a backend and a secure API key, so it cannot run on static GitHub Pages. In the PoC it is a scripted mock with a few canned prompts per screen, clearly labelled Demo AI. Clients without the add-on see a calm locked card.

## 21. Additional features from the gap analysis

Four features that frontline training platforms commonly offer (vendor sites, directional): easy login, automatic assignment, reminders, and multilingual support with read-aloud.

### 21.1 Easy login (no work email needed)

- Invites: the admin adds a person by name, with phone or email optional. The app generates a personal invite link and QR code. A site QR code or join code can also let staff self-register, held in an approval queue for the admin.
- Sign-in: after the first sign-in, the person sets a 4-6 digit PIN or uses device biometrics or a passkey where available (VERIFY). Fallback is name plus site code plus PIN. Email or phone can be added later for recovery.
- Shared devices: nurseries often have a staff-room tablet. Offer a shared-device mode with a quick user switch (tap a name, enter a PIN) and automatic sign-out after inactivity.
- Security: attempt limits and lockout, admin PIN reset, expiring one-time tokens, and QR codes that carry only a random token (no names or ids).
- Admin tools: bulk invite by CSV, print QR cards, and invite status (Invited, Joined, Needs approval).
- Staff are never asked for a work email.
- PoC: simulated login screens, client-side QR generation, a PIN pad, shared-device switching and invite status. There is no real authentication in the PoC, so it is labelled as a demo.

### 21.2 Auto-assign rules

- Format: when [trigger], for people matching [role, team or site], assign [module or group] due [N days later].
- Triggers: person added, role set or changed, moved to a site, a requirement approaching expiry (for example 60 days before), start date plus N days (probation milestones), and a new module version published.
- Admin UI: a list of rules, each with a plain-language sentence (for example When someone joins as Practitioner at any site, assign New starter induction, due in 14 days). Each rule has an on or off switch and a preview of how many people it would affect now. A history log shows assignments created by each rule.
- Safeguards: no duplicate assignments, and nothing assigned if the requirement is already current. Manual override is always possible.
- Packs ship suggested default rules (for example a safeguarding refresher 60 days before expiry).
- Multi-site (section 14): rules can be group-wide or site-specific.
- Packaging: a small number of rules in Essentials, unlimited in higher packages (section 20).
- Data: Rule: id, client id, trigger, filters, action, due offset in days, enabled. Each assignment records its source (manual or rule id).
- PoC: rules run on the device in response to demo actions (an Add staff member button, and fast-forward time to trigger expiry rules).

### 21.3 Reminders and nudges

- Defaults: compliance reminders (due soon, overdue, expiring) follow the client's reminder policy and are on by default, because this is required work. Game and competition notifications stay off by default and are opt-in (sections 13 and 16).
- Staff reminders: due in 7, 3 and 1 days, overdue, expiring at 60 and 30 days. Reminders stop immediately on completion. Staff can snooze (remind me tomorrow), choose channels, and set quiet hours. A notification centre lists reminders with read state.
- Manager nudges: a weekly digest of who is overdue or expiring, one-tap Send reminder to a person, team or site, a Chase all overdue action that shows a preview and respects the frequency cap, and optional escalation (overdue more than N days notifies the manager).
- Tone and templates: neutral and helpful message templates with a few tone presets that admins can edit. Overdue lists are visible to managers only, never to peers.
- Guardrails: a frequency cap per person per week, quiet hours, a paused until date for people on leave, and no shaming language.
- Channels: in-app notification centre first. Web push for the installed web app on supported devices (VERIFY platform support, including on iPhone). Email optionally. SMS or WhatsApp as a paid add-on with consent and a per-message cost (VERIFY provider).
- Data: Notification: id, user id, type, created, read, channel and source. ReminderPolicy: per client and per site.
- PoC: the in-app notification centre and banners, plus a Send reminder button that records an event and shows a confirmation. Fast-forward time triggers due and overdue reminders. No real push or SMS is sent.

### 21.4 Multilingual support and read-aloud

- Interface language: a language switcher in the staff app, and later the admin app. Candidate languages to validate with clients (not statistics): for example Polish, Romanian, Urdu and Arabic.
- Content translation: modules are authored in one language. Translations can be human-supplied or machine-generated (for example through the AI add-on) with a Machine translated label and a review flag. The original language remains the authoritative text, and the language taken is recorded on each completion. Quiz questions are translated too.
- Right-to-left layouts for Arabic and Urdu if those languages are added, using logical CSS properties and testing.
- Read-aloud: a play and pause button on lessons and quiz questions with a speed control, skip by paragraph, and the current text highlighted where feasible. The PoC uses the browser's built-in speech synthesis, which is free and often works offline. Voice quality and language support vary by device (VERIFY). Production may use pre-generated audio per lesson.
- In closed-book mode read-aloud reads only the question and answer options, never the learner's notes.
- Packaging: read-aloud is included in every package as an accessibility feature. Content translation is an add-on, because of its cost and review effort.
- PoC: externalise all interface text into language files, include a second language for the staff app with one sample translated module, and use browser read-aloud, with machine translations labelled.

## 22. Roles, permissions, ownership and two-factor authentication

The provider app supports delegation, so control can be handed to someone else while the user keeps ultimate control, or hands that over too. The client admin app gets the same capability in a simpler form, so managers can give supervisors the right permissions. Complexity is acceptable on the provider side.

Important PoC limit: a static GitHub Pages app has no server, so there is no real authentication, no real enforcement and no real two-factor authentication. The PoC shows the full interface and simulates the behaviour on the device, with a visible Demo only badge. Real enforcement must happen on a server (section 22.8).

### 22.1 Principles

- Least privilege: people get only what they need. Defaults are conservative.
- Permissions are explicit and additive. A role is a named set of permissions, and a person can hold one or more roles. There are no hidden implicit grants.
- Read and write are separate. Granting write does not silently grant read of unrelated areas, and sensitive actions (delete, export, billing, impersonation) are separate permissions.
- Scope matters as much as permission: a permission applies to a scope (everything, one client, one site, or own items only).
- Everything is audited: who changed what role or permission for whom, and when.
- Safe by default in the UI: the dangerous things (ownership, security settings, deleting) sit apart and need extra confirmation.
- Best-practice articles were found by search (Frontegg, Stytch, Oso, Cerbos and Microsoft Azure RBAC) but only their titles came back, so the specifics below are standard practice from general knowledge. VERIFY before relying on them.

### 22.2 Provider app: ownership and control

- Owner role: exactly one Primary Owner at any time (the user). Owner has every permission, including those that cannot be delegated.
- Non-delegable by default (owner only, but the owner may explicitly allow it): transferring ownership, deleting the provider account, changing the 2FA policy, managing owner-level roles, and viewing or exporting the audit log of owner actions.
- Ownership transfer: a deliberate multi-step flow. The owner names the new owner, the new owner accepts by email, both confirm with 2FA, and there is a short cooling-off period during which the transfer can be cancelled. After the transfer the previous owner is demoted to a chosen role (default Admin), so the user may keep strong control or hand over fully, as the user requested.
- Optional Co-Owner role (confirmed default): full permissions, but cannot remove the Primary Owner or change ownership. This allows handing over day-to-day control while the user retains ultimate control.
- Break-glass and recovery: owner recovery codes and a documented recovery process, so losing a phone cannot lock the business out forever. Two owners are recommended in production for continuity.
- Provider staff access to client data is restricted and audited (section 15.6).

### 22.3 Permission model (provider app)

Permissions are grouped by area. Each area lists actions, and each action is a checkbox. The matrix has two columns of checkboxes per row, Read (View) and Write (Create, Edit, Delete), plus extra checkboxes for sensitive actions.

Suggested areas and their sensitive actions (placeholder list, refine during build):

- Clients: view list and details; create, edit, suspend or reactivate; delete (sensitive); view staff counts and roles; view personal staff records (sensitive, off by default); view-as-client mode (sensitive, time-limited and audited, section 15.6); review organisation name changes; revert a display name (sensitive); edit billing name and details (sensitive) (section 30).
- Sites and staff counts: view and edit site and seat metadata.
- Modules and content: view library; create, edit, version and publish provider modules; publish to all clients or selected clients (sensitive); archive or delete (sensitive); manage question banks, FAQs and prize suggestion lists; manage Learn more links and run link checks (section 31).
- Industry packs: view; edit packs and requirements; create new packs.
- Billing: view plans and invoices; edit plans and entitlements; draft price changes (overrides and percentage discounts or increases); confirm price changes (sensitive, section 23.11); apply credits (sensitive); view revenue summaries; export billing data (sensitive); manage add-ons.
- Operations: view usage metrics, API usage, errors and logs; acknowledge or resolve errors; view client health scores; manage alerts; manage API keys.
- Feedback inbox: view app feedback; triage, tag and change status; delete. View module feedback on provider modules (names removed) and edit the quick tag list (section 19.1).
- Clients and onboarding: create clients with the New client wizard, edit sites and packages, view onboarding progress (section 26.1).
- Communications: compose and send announcements and release notes; send to all clients (sensitive) (section 26.2).
- Account recovery: start recovery requests; approve them (sensitive, two approvers needed); complete resets or Account Owner transfers (sensitive) (section 26.3).
- Data requests: view and manage the request log; run person exports or erasure on a client's behalf (sensitive) (section 26.4).
- Incidents: post status, maintenance and incident updates; post an incident visible to all clients (sensitive); manage the breach log (sensitive) (section 26.5).
- Support tickets: view; reply; assign; change status and priority; internal notes; view attachments (sensitive); delete or redact attachments (sensitive); merge; manage saved replies; manage feature names and issue types; view support reports (section 25.8).
- AI Assistant add-on: view usage; enable or disable per client (kill switch); edit guardrails and caps.
- Competitions and themes: view competition and theme usage; manage global seasonal themes and prize suggestion lists.
- Team and roles: view team; invite or remove members; create, edit and delete roles; assign roles; reset someone's 2FA (sensitive).
- Security and audit: view audit log; export audit log (sensitive); edit security policy such as 2FA requirement and session timeout.
- System: feature flags and global settings (sensitive).

UX for the permission matrix:

- A grid with areas as rows and Read and Write checkboxes as columns, expandable rows for finer actions, and a sensitive actions group highlighted with a warning icon and extra confirmation text.
- Search within permissions, collapse and expand all, select all or none per area, and a summary count (for example 38 of 112 permissions selected).
- Dependencies are enforced and explained: for example, Write on Billing automatically requires Read on Billing, and the UI shows why a box is locked.
- Scope selector per role or per assignment: All clients, Selected clients, or Own clients only (for account managers).
- Compare roles side by side, and a Preview as this role button that shows the provider app as that role would see it (simulation).
- Plain-language descriptions beside each permission, and a short sentence summarising the role (for example Can view and triage feedback but cannot see billing).
- Accessible: fully keyboard operable, labelled checkboxes, and a table view that reflows to cards on phones.

### 22.4 Roles in the provider app (CRUD, saveable, preset on invite)

- Built-in system roles (editable copies allowed, originals locked): Owner, Co-Owner (optional), Admin, Support, Billing, Content Editor, Read-only.
- Custom roles: create, read, update, duplicate, and delete. Create from scratch or by duplicating an existing role. Roles have a name, description, colour, and the permission set. Deleting a role that is in use requires reassigning those people first. Editing a role updates everyone who holds it, with a clear warning showing how many people are affected.
- Versioned changes with an audit entry for every role change, and the ability to see who last changed a role.
- Invite by email: choose one or more roles and scope, then send. The invitee accepts via an emailed link, sets up 2FA, and arrives with everything preset. Invitations expire (assumed 7 days), can be revoked or resent, and show a status (Invited, Accepted, Expired, Revoked).
- Multiple roles per person: effective permissions are the union of the roles. A person's Effective permissions view shows the final result and which role grants each permission, so there is no mystery.
- Per-person overrides (optional, advanced): grant or deny a single permission beyond their roles. Denies take precedence (assumed). Use sparingly, and flag overrides in the audit log.
- Time-limited access (assumed useful): a role or permission assignment with an expiry date, for contractors or temporary cover.
- Guardrails: nobody can grant a permission they do not hold themselves (no privilege escalation), nobody can edit their own roles, and the last Owner cannot be removed or demoted.
- Team page: a list of members with roles, status, 2FA status (enabled or not), last active, and quick actions (change roles, suspend, remove, reset 2FA).

### 22.5 Client admin app: simpler roles

Goal: a smoother, cleaner UX than the provider app, but still genuinely useful. Managers assign supervisors the right permissions without a huge matrix.

- Built-in roles (labelled in plain English): Account Owner (the main manager, full control, one per client), Group Admin, Site Manager, Supervisor, Trainer or Content Author, and Viewer (read-only, for example a director or consultant). Each shows a one-line description of what it can do.
- Permissions are grouped into about 10 plain-language categories instead of a long matrix, each with three simple levels: No access, View, and Manage. Suggested categories:
  - Staff and invites (including Manage team and roles: invite admins, change roles and scope, sensitive)
  - Training evidence (Upload evidence for others, and Approve training evidence, sensitive, section 27.5)
  - Assigning training
  - Modules and Module Library (own content, and Add learning links and documents, section 31.3)
  - Reports and exports
  - Competitions and prizes (including Host battles, section 32.10)
  - Themes and branding
  - Notifications and reminders
  - Settings and billing (including Edit organisation name, section 30)
  - Feedback and help (including Raise support tickets, View all of my organisation's tickets, Allow staff to raise tickets, View module feedback and Respond to module feedback, sections 19.1 and 25.8)
- Sensitive items (billing, deleting staff, exporting records, changing roles) get an extra Allow toggle with a short explanation.
- Scope is a simple picker: Whole organisation, Selected sites, or Only my site (relevant to multi-site clients, section 14). Single-site clients never see the scope picker.
- Customisation: clients can create a custom role by starting from a template (for example Supervisor) and flipping a few switches, then save it with a name. The number of custom roles may be limited by package (section 20, confirmed default). Presets cover most needs, so most clients never need a custom role.
- Assigning: add a team member by name and email (or via the invite link or QR code from section 21.1), pick a role and scope, and send. A plain preview shows what they will be able to do. Staff who are supervisors can also be promoted from the staff list in two taps.
- Everyday UX: a Team and permissions page that lists admins and supervisors with their role, scope and 2FA status, a What can this person do? summary panel, a Preview as this role option, and undo-friendly confirmations.
- Guardrails: a supervisor can only grant permissions they hold, the Account Owner cannot be removed (but can transfer ownership with a simple confirmed flow), and every change is recorded in a client-visible activity log.
- Two-factor: required for every client admin (decided 22 October 2026), with the enrolment grace period in section 22.6. Staff learners do not need 2FA (they use the easy login in section 21.1).
- Data visibility: supervisors only see their scope's data. Notes (section 18) remain private to learners regardless of any role. Screens a person cannot access show a clear You don't have access to this, ask your manager message and never an empty or broken page.

### 22.6 Two-factor authentication (authenticator app)

- Method: time-based one-time passwords (TOTP) using any standard authenticator app (for example Google Authenticator, Microsoft Authenticator, Authy or 1Password, VERIFY). Setup shows a QR code and a manual key, then asks for a 6-digit code to confirm.
- Recovery: ten single-use recovery codes shown once and downloadable or printable, plus a re-issue flow. An owner can also reset another user's 2FA (a sensitive, audited action that forces re-enrolment and notifies the user).
- Enforcement: required for all provider team members (assumed, because the provider holds client data). Client admins as set in section 22.5. A grace period of a few days to enrol after invitation, then access is limited until enrolled.
- Sign-in flow: email and password (or the chosen identity method), then the authenticator code. A Trust this device for 30 days option (assumed) reduces friction. Sensitive actions (ownership transfer, role edits, viewing personal records, exports) ask for a fresh code (step-up verification).
- Protection: rate limiting and lockout on repeated wrong codes, session timeout, a list of active sessions with sign out everywhere, and email alerts on new device sign-ins, 2FA changes and role changes.
- Later options (not for the PoC): passkeys and hardware security keys (VERIFY), single sign-on (SSO) for the Group package (section 20), and SMS codes (weaker, avoid as the main method).
- PoC: a simulated enrolment flow with a QR code generated on the device, a code entry screen that accepts a fixed demo code, recovery-code screens, and a Demo only badge. No real security is provided by the PoC.

### 22.7 Data model and enforcement logic

- Permission: id (for example billing.write), area, action, description, sensitive flag, and dependencies.
- Role: id, owner (provider or a client id), name, description, colour, list of permission ids, system or custom flag, version, and created and updated metadata.
- Assignment: id, user id, role ids, scope (all, client ids, site ids, or own), optional per-person overrides (grants and denies), optional expiry, status, invited by, and timestamps.
- User: id, email, name, status, 2FA enabled flag, last active, and active sessions.
- Audit event: actor, action, target, before and after, time, IP and device where available, and reason for sensitive actions.
- Effective permissions are computed as the union of role permissions, plus grants, minus denies, filtered by scope and expiry, evaluated by one central function so the UI and the enforcement always agree. In the PoC this function drives which screens, buttons and data appear for the current Demo as role.
- Provider and client permission systems share the same engine and schema, with different permission catalogues and different UX levels (full matrix for the provider, simplified levels for clients). This fits the engine-level approach in section 12.
- Industry packs may ship suggested default roles for clients (section 12.2).

### 22.8 Production notes (not for the PoC)

- Authorisation must be enforced on the server for every request, not just by hiding buttons in the interface.
- Use a proven identity and authorisation service or library rather than building authentication from scratch (VERIFY options).
- Store 2FA secrets encrypted, hash recovery codes, and log security events for audit.
- Provider staff access to client data should be processed under appropriate data protection arrangements (section 15.6). Take advice from a data protection adviser.
- Test the permission system with automated tests for escalation, scope leaks, and the last-owner rules.

### 22.9 Demo and PoC scope

- A Demo as role switcher in the provider admin (Owner, Admin, Support, Billing, Content Editor, Read-only) and in the client admin (Account Owner, Group Admin, Site Manager, Supervisor, Trainer, Viewer), showing the app change as the role changes.
- Seeded provider team of about five members with different roles and 2FA states, and a seeded client team of about four.
- Demo flows: create a custom provider role with the checkbox matrix and save it, invite someone by email (simulated) with that role preset, view their effective permissions, and transfer ownership (simulated). In the client admin: promote a staff member to Supervisor in two taps, use Preview as this role, and show the activity log.
- Show the 2FA enrolment flow as a simulated demo, clearly labelled.
- Build Pack milestones: the permission engine in M0, client roles in M3 and provider roles in M4, so every screen consults the engine from the start.

### 22.10 Tradeoffs and risks

- Complexity: a full permission matrix is powerful but easy to misconfigure. The provider side accepts this, so mitigate with effective-permission views, previews, dependency enforcement and audit logs. The client side stays simple on purpose.
- Over-granular permissions slow development. Start with the catalogue above and grow it.
- A PoC cannot demonstrate real security, so avoid implying that it does.
- Ownership transfer and recovery are high-stakes flows. Test them carefully and document the recovery process.
- Roles multiplying per client can become messy, so limit custom roles by package and encourage the presets.

## 23. Client billing and add-on management

Client admins can manage add-ons and see billing information when their permissions allow it. This connects the packaging in section 20, the client roles in section 22.5 and the provider billing views in section 15.

Important PoC limit: a static GitHub Pages app cannot take real payments or issue real invoices. The PoC shows realistic billing screens on fake data with a Demo billing badge. Real billing needs a payment provider and a backend (section 23.8).

### 23.1 Permissions for billing and add-ons

Billing sits in the Settings and billing category in section 22.5 (levels No access, View, Manage) and is split into separate checkboxes behind the sensitive Allow toggle, so a manager can grant one without the others:

- View billing and plan: see the plan, usage against limits, renewal date, and invoices.
- Download invoices and receipts.
- Manage add-ons: turn add-ons on or off and change their limits.
- Manage plan and payment: upgrade, downgrade or cancel, and change the payment method and billing contact.

Default roles (confirmed default):

- Account Owner: all four.
- Group Admin: view billing, download invoices and manage add-ons. No plan or payment changes.
- Site Manager: no billing access, except an optional view of their own site's charges in multi-site clients (section 14).
- Supervisor, Trainer and Viewer: none unless granted.
- Staff learners never see billing.

Rules: the Account Owner can always see billing and cannot be locked out. Only people holding a permission can grant it (section 22.4). Every billing action is recorded in the client activity log and visible to the provider (section 15.3 Audit tab).

### 23.2 Plan and billing overview (View billing)

- Plan card: current package (section 20), billing period, price, any discount or price override, any scheduled price change with its date (section 23.11), next renewal date, and a trial banner if on a trial.
- Usage against limits: for example 3 of 3 own modules, 4 of 5 saved themes, 2 of 2 auto-assign rules, with calm upgrade prompts at the limit (section 20.6). Add-on usage meters for the AI Assistant and SMS or WhatsApp, with the cap and what is left this period.
- Billing detail: sites and staff bands billed, per-site charges for multi-site clients, the billing contact, and the billing name, address and VAT number, with a Request a change button (section 30).
- Invoices: a list with date, number, amount, status (Paid, Due, Overdue, Refunded) and a download button. Receipts and a simple year-to-date total.
- Payment method: shown as the last four digits and expiry only. Changing it opens the payment provider's secure hosted page (section 23.8), never a card form inside the app.
- Cards on phone and tables on desktop, per section 6.

### 23.3 Add-on marketplace and management (Manage add-ons)

- An Add-ons page lists every add-on from section 20 as a card: AI Assistant, content translation, SMS or WhatsApp reminders, extra industry content packs, branding pack (Option B), extra sites (Option B), and onboarding or white-label setup. Each card shows what it does, what it costs, an example, its status (Off, On, Trial), and the usage cap where one applies.
- Turning on: a plain confirmation that states the price, when billing starts, any proration, and the effect on the next invoice. The entitlement flag flips immediately so the feature unlocks (section 20.6).
- Turning off: takes effect at the end of the billing period (assumed). Content created while on (for example translations or AI drafts) is kept read-only and never deleted. Features show a calm locked card.
- Usage-based add-ons (AI Assistant, SMS or WhatsApp): the admin can set a monthly spending cap and low-balance alerts. At the cap the feature pauses rather than creating surprise charges. Optional top-up packs.
- Trials: a one-click trial for an add-on, if the provider offers it (confirmed default), with a clear end date.
- Request flow for people without permission: a locked feature shows Ask someone with billing access, which sends an in-app and email request to the people who hold Manage add-ons. They can approve with one tap. This keeps supervisors from hitting dead ends.
- Dependencies are explained: for example, SMS reminders need reminder policies to be switched on (section 21.3).

### 23.4 Plan changes and cancellation (Manage plan and payment)

- Upgrade or downgrade between packages with a preview of the price change, new limits and anything that becomes read-only (section 20.6). Upgrades apply immediately with proration. Downgrades apply at period end (assumed).
- Cancellation: a clear flow that explains when access ends, offers an export of training records and certificates before the end, then follows the Closed and Deleted states and retention schedule in section 24, with the optional paid Records Keeper archive. A Pause option is a possible alternative for seasonal settings.
- Staff or site changes: adding a site, or moving into a different staff band, shows the price effect before confirming.
- Annual billing discount (confirmed default).

### 23.5 Safeguards and UX

- Step-up verification: a fresh authenticator code (section 22.6) for plan changes, payment method changes, cancellation and billing contact changes.
- Cost transparency: every action that changes the bill states the change in plain English first, then asks for confirmation. No dark patterns in cancellation.
- Notifications: email to the billing contact and Account Owner for add-on changes, plan changes, failed payments, upcoming renewals and approaching usage caps. Staff are never notified of billing events.
- Failed payments: the account moves through staged states with a grace period (Past due, Limited, Read-only, Closed, Deleted), and compliance records stay exportable until deletion (section 24).
- Accessible and simple: the same large controls, clear labels and Simple view guidance as the rest of the admin app (section 16.4).

### 23.6 Multi-site clients

- Charges are shown per site and for the whole group (section 14). Group Admins see all sites. A Site Manager with the optional permission sees only their own site's charges.
- Add-ons are group-wide by default. Per-site add-ons (for example SMS only at one site) are possible if billing is per site (confirmed default).

### 23.7 Provider side (extends sections 15 and 20)

- The provider's Billing tab per client (section 15.3) shows the same plan, add-ons, usage, invoices and status, with provider permissions to change plan and add-ons, apply credits or discounts, and issue refunds (sensitive, section 22.3).
- Changes made by the client or the provider are recorded in one audit trail showing who, what and when.
- Add-on adoption and revenue reporting for the provider: which add-ons are on, trials converting to paid, usage caps being hit, and clients at risk of cancelling (feeds the health score in section 15.4).
- A dunning view of clients by account state, amounts outstanding and recovery rate, with a sensitive permission to extend grace or pause the timeline (section 24.7).

### 23.8 Data model and production notes

- Subscription: client id, package id, price, billing period, status (see the full set of account states in section 24.9), renewal date, and billing contact.
- AddOnSubscription: subscription id, add-on id, status, started, ends at, usage cap, usage this period.
- Invoice: id, number, client id, lines (plan, sites, add-ons, usage), tax, total, status and dates.
- BillingEvent: actor, action, before and after, time, for the audit trail.
- Entitlements (section 20.6) derive from the package plus active add-ons, so turning an add-on on or off flips flags in one place.
- Production: use an established payment provider and its hosted customer portal for cards and invoices, so card details never touch the app (VERIFY providers and fees). Handle UK VAT and invoice requirements (take advice, VERIFY). Support Direct Debit if clients prefer it (VERIFY). Store only provider tokens and last four digits. Keep billing records for the legally required period (VERIFY with an adviser).

### 23.9 Demo and PoC scope

- A Billing tab in the client admin with fake invoices, usage meters and an add-on page. The existing package switcher (section 20.6) also changes what the client sees here.
- Demo flows: as the Account Owner, switch on the AI Assistant add-on with a confirmation and watch the locked card in the staff or admin app unlock. Set a usage cap. As a Supervisor with no billing permission, tap a locked feature and send a request. Switch back to the owner, approve it, and see the entry in the activity log. Then open the provider app and see the same change in the client's Billing and Audit tabs.
- Payments are simulated: a mock hosted payment page, fake card details, and a Demo billing badge. No real payment or invoice is created.
- Build Pack milestones M3 (client billing screens) and M4 (provider billing views).

### 23.10 Tradeoffs and risks

- Self-serve billing reduces support load but exposes clients to purchase mistakes, so confirmations and caps matter.
- Add-on sprawl can confuse small managers. Keep the add-on list short, as in section 20.5.
- Usage-based add-ons can create surprise bills without caps, so caps and alerts are on by default.
- Real payments add compliance and tax work that a PoC avoids entirely.
- Letting supervisors request add-ons creates a pleasant flow but needs clear ownership of who approves.

### 23.11 Provider price overrides, discounts and increases

The provider can change what one client or many clients pay, without changing the package itself: a fixed price override, a percentage discount, or a percentage increase. Every change has a notice period and must be confirmed by a provider admin with the right permission before it applies. Requested by the user on 22 October 2026. Design reasoning only, no new external research.

What can be changed:

- Price override: a fixed price for the client's package (per site and staff band) or for one add-on, replacing the list price.
- Percentage discount (for example minus 10 per cent) or percentage increase (for example plus 5 per cent), applied to the plan, to one add-on, or to the whole invoice.
- Optional end date, for example a three-month introductory or retention discount. Without an end date the change is ongoing.
- A reason (required, from a short list such as Loyalty, Retention, Introductory offer, Annual review, Correction, plus free text) and an internal note.

Choosing clients:

- One client from the client's Billing tab, or many from a Price changes page: select clients individually or by filter (package, industry pack, account state, number of sites, health score) or all clients. A list price change for every client uses the same tool with All clients.

Notice and timing:

- Every change has a notice field in days, defaulting to 30 for both increases and discounts. The person can shorten or lengthen it, for example 0 days for a discount that should apply at once.
- The effective date is the confirmation date plus the notice. Increases on annual plans apply from the next renewal unless the client's contract says otherwise (VERIFY the terms of service).
- Scheduled changes can be cancelled before they take effect. When an end date passes, the previous price returns automatically.

Confirmation:

- Anyone with Draft price changes prepares the change and submits it. It applies only after someone with Confirm price changes (a sensitive permission, section 22.3) confirms it with a fresh authenticator code (section 22.6). The Owner holds both by default; in larger teams a second person can confirm, and the provider can require two different people (assumed off by default).
- Before submitting and before confirming, a preview shows every affected client with the current price, the new price, the effective date and the monthly revenue effect, plus warnings for unusual changes (for example an increase over 20 per cent or a price below a set floor, placeholders).

Rules:

- At most one override and one percentage adjustment per client and item at a time. A new confirmed change replaces the old one, and the preview shows this.
- Order of calculation: list price, then any override, then any percentage adjustment. Prices never go below zero. Money is rounded to the penny.
- Issued invoices never change. Invoices show the list price and the adjustment as a separate line (for example Loyalty discount, minus 10 per cent).

What clients see:

- Confirmed increases send a notice to the billing contact and Account Owner (email and in-app), stating the old price, the new price, the effective date and how to ask a question. People with billing permission see the scheduled change on the plan card and in the client calendar (section 28.3). Staff never see pricing.
- Discounts show on the plan card and invoices, with the end date if there is one.

Audit and reporting:

- Every draft, submission, confirmation, cancellation and expiry is recorded in the provider audit log and the client's billing audit trail (section 23.7).
- Revenue reports show list revenue, adjustments and net revenue, so the cost of discounts is visible.

Data model:

- PriceAdjustment: id, clientIds, scope (plan, add-on id, or whole invoice), kind (override or percent), value (pence for an override, a signed percentage otherwise), reason, note, noticeDays (default 30), effectiveAt, endsAt, status (draft, submitted, scheduled, active, ended, cancelled), createdBy, confirmedBy, confirmedAt.

PoC:

- A Price changes page and a section on each client's Billing tab in the provider app. Simulated notices go to the Outbox. Build Pack milestone M4.

Tradeoffs and risks:

- Bulk changes are powerful and easy to get wrong, hence the preview, the warnings, the confirmation with a fresh code and the cancel option.
- Increases damage trust if they surprise people. The notice period, the plain-language notice and the next-renewal rule for annual plans reduce this.
- Many custom prices make revenue harder to forecast. The revenue report shows how much is discounted.

## 24. Failed payments, account states and data retention

What happens when a recurring payment fails for a package or add-on: what is blocked, the grace period and what works during it, whether anything free remains after payments stop, how to keep provider costs down for clients who no longer pay, and how long data is kept.

All timings below are placeholders to tune and to write into the terms of service, with legal advice (VERIFY).

### 24.1 What is known to work

- Most failed recurring payments are recoverable without the customer noticing, so automatic retries come first. Stripe's recommended default for its automatic retries is 8 attempts within 2 weeks, with a choice of windows from 1 week to 2 months. When retries are exhausted, the subscription can be cancelled, marked unpaid, left past due, or paused.
- Stripe does not retry hard declines such as a lost or stolen card, which need a new payment method from the customer. For UK Bacs Direct Debit it can retry insufficient-funds failures up to 2 times within 30 days.
- Common dunning guidance (vendor blogs, directional): a grace period of 7 to 14 days, never cutting off access after the first failure, retries spaced out rather than daily (an example is 3, then 5, then 7 days), clear and non-accusatory emails with a one-click link to update payment details, and an in-app banner because emails are missed.
- Prevention is cheaper than recovery: warn before a card expires, use the payment provider's card updater where available (VERIFY), and offer Direct Debit, which suits UK small businesses and avoids card expiry altogether (VERIFY failure rates).
- Recommended pattern for this product: degrade gradually rather than cut off. Variable-cost features stop first, optional extras stop next, then the account becomes read-only, then closes, then the data is deleted. Compliance records stay exportable until deletion.

### 24.2 Principles

- Protect children and inspection evidence: a client's compliance records and certificates must stay exportable until the data is deleted, in every state. Never hold records hostage.
- Protect the provider: stop anything with a running cost first (AI, SMS, WhatsApp, translation), and keep the cost of a non-paying client close to zero after about 30 days.
- Protect staff: staff never see billing problems or the word payment. While mandatory training still works, nothing changes for them.
- Be fair and transparent: every state shows what still works, what has paused, what happens next and on what date, and one button to fix it.
- Reactivation is instant: paying the outstanding balance at any point before deletion restores everything exactly as it was.
- Same rules for voluntary cancellation from the Closed state onwards (section 24.3).

### 24.3 Account states and timeline (placeholders)

1. Active: normal service. Pre-dunning: emails 30 and 7 days before a card expires, and before an annual renewal.
2. Past due (day 0 to day 14, the grace period): everything keeps working. Automatic retries run. Day 0 email to the billing contact and Account Owner, then reminders around day 3, 7 and 12, each with a secure link to update payment. A calm banner is shown to people with billing permission from day 0, and to all client admins from day 7. Staff see nothing. Usage-based add-ons (AI Assistant, SMS or WhatsApp) work only within the allowance already paid for: no overage and no top-ups.
3. Limited (day 15 to day 30): the client is temporarily dropped to the floor package (section 20.2), so core compliance keeps running and extras pause. See the matrix in 24.4. Email every 5 days, plus a one-tap offer to resolve: pay now, pay by bank transfer, switch to a cheaper package, or pause.
4. Read-only (day 31 to day 60): nothing new can be written. Admins can sign in, view everything, export the inspector-ready matrix, records and certificates, and pay. Staff can sign in to view and download their own training record and certificates, with a neutral message: Your organisation's account needs attention. Please speak to your manager. Learning, assignments, reminders, competitions and add-ons stop.
5. Closed (day 61 to day 150, or from the end of the paid period for a voluntary cancellation): the subscription is cancelled. Only people with billing or export permission can sign in, to export data or reactivate. Staff sign-in ends, but the client admin can send staff a notice beforehand to download their own records (on by default, assumed). Data moves to low-cost archive storage. Final notices at 30 and 7 days before deletion.
6. Deleted (after day 150): client personal data is deleted within 30 days, including from backups as they rotate (section 24.6). Only billing records required for tax and a minimal record that the account existed and was deleted are kept. A deletion confirmation is emailed to the Account Owner.

Other rules:

- If the client pays at any point before deletion, the account returns to Active immediately with all data, settings, themes, roles and history.
- The provider can extend the grace period or pause the timeline for a client (a sensitive, audited permission, section 22.3), for example for a disputed charge, a bank error or a known hardship.
- A chargeback or suspected fraud moves the account straight to Limited pending manual review (assumed).
- A trial that ends without payment goes to Read-only for 14 days, then Closed for 30 days, then Deleted (assumed). Trial data is mostly sample data.
- A nursery that closes for good follows the Closed path, with exports available to whoever is responsible for its records.
- Annual plans and invoiced groups (bank transfer, for example 30-day payment terms) follow the same states, counted from the invoice due date.

### 24.4 What works in each state

Core compliance (staff learning on assigned mandatory modules, the compliance checklist, the manager dashboard):

- Past due: yes. Limited: yes. Read-only: view only. Closed: export only.

Inspector-ready exports, staff records and certificates:

- Every state until deletion. Staff can download their own record in Active, Past due, Limited and Read-only.

Creating or editing own modules, categories and groups, the Module Builder, new competitions, new themes, new invites, new auto-assign rules:

- Past due: yes. Limited: no, with existing items kept as they are. Read-only and Closed: no.

Battle Room (section 32):

- Past due: yes. Limited, Read-only and Closed: no new battles.

Live competitions:

- Past due: yes. Limited: running competitions continue to their end date, because staff were promised prizes and they cost little, but no new ones. Read-only: frozen, with a final standings snapshot so the admin can still award prizes.

Standing leaderboards, XP, badges, notes and history:

- Past due and Limited: yes. Read-only: view only. Closed: not available to staff.

AI Assistant, SMS or WhatsApp, translation and other usage-based add-ons:

- Past due: only within the allowance already paid. Limited, Read-only and Closed: off.

Reminders:

- Past due: yes. Limited: in-app only. Read-only and Closed: off.

Themes and branding:

- Stay as they are in every state (no running cost), but editing stops from Limited.

Multi-site roll-ups, site manager access and roles:

- Past due and Limited: yes. Read-only: view only.

Billing page, payment update and reactivation:

- Always available to people with billing permission, in every state until deletion.

Support tickets (section 25):

- Admins can raise and follow tickets in every state until deletion, so they can get help with billing or exports. Staff can raise tickets while they can still sign in.

Sign-in and 2FA:

- Always available to admins until deletion. Staff sign-in ends at Closed.

If only an add-on payment fails (for example a separately billed SMS top-up), only that add-on pauses. Recommendation: bill the package and add-ons on one consolidated invoice, so there is one payment and one state per client.

### 24.5 Free offering after payments stop

Options considered:

- A permanent free tier for lapsed clients: not recommended at launch. It keeps compute, support and security costs running for clients who pay nothing, can undercut the paid Essentials package, and small nurseries may simply stay on it.
- Hard cut-off and immediate deletion: not recommended. It risks a setting losing inspection evidence, damages trust and reputation, and may conflict with the client's own record-keeping duties (VERIFY).
- Recommended: the staged path above, which gives about 60 days of free read-only and export access in total, then a paid Records Keeper plan for clients who want to keep their records online for longer. Records Keeper is a low-cost, read-only archive: view and export only, admins only, no learning, no add-ons, priced to cover storage and a margin (placeholder, add to section 20). This turns retention into revenue rather than a cost.
- A freemium acquisition plan for very small settings (for example up to 5 staff, provider modules only, no competitions) could be tested later as marketing. It should be judged on conversion to paid, not offered to lapsed clients by default (VERIFY economics).

### 24.6 Data retention

Who decides: for client training data, the client is the controller and the provider is the processor. The ICO says personal data must not be kept longer than needed for its purpose, that a retention policy should set standard periods wherever possible, that keeping data to meet legal or professional record-keeping requirements is allowed, and that backups should also be cleared when live data is deleted. Processor contracts usually require the processor to delete or return client data at the end of the service unless the law requires storage (VERIFY the UK GDPR wording and the contract with an adviser). The EYFS says records about individual children must be kept for a reasonable period after they leave and that providers decide how long. The app should avoid holding child data in the first place.

Proposed retention schedule (placeholders, configurable, take advice before launch):

- Client training and compliance records (staff, assignments, completions, scores, certificates, requirement history): kept while the account is active, under the client's own retention settings. For leavers, a configurable period after they leave, with a suggested default the client must confirm. After cancellation, the Closed export window, then deletion, unless the client buys Records Keeper.
- Learner notes (section 18): private to the learner. Deleted when the learner's account is deleted. When a staff member leaves, they get a prompt to download their notes, then the notes are deleted after 90 days (assumed).
- Event logs used for stats and leaderboards: detailed events kept for 13 months, then aggregated or anonymised, so long-term trends survive without personal detail (assumed).
- Error logs and technical logs: 30 to 90 days (section 15.5).
- Battle Room results: kept 90 days for personal and host summaries, then aggregated (assumed, section 32.8). XP and badges earned in battles follow the XP ledger.
- Feedback: app and module feedback kept for 2 years, then anonymised (assumed). Replies to module feedback follow the feedback item.
- Support tickets: 2 years after closure, then anonymised. Screenshots and other attachments deleted 90 days after the ticket closes (assumed, section 25.9).
- Uploaded certificates: approved files follow the training records above. Rejected and superseded files are deleted after 90 days (assumed, section 27.7).
- Security and permission audit logs: 2 years (assumed). Billing audit events follow billing records.
- Billing records and invoices: these are the provider's own records, not client training data. Keep them as long as tax law requires (commonly 6 years in the UK, VERIFY with HMRC guidance).
- Backups: rotate so deleted data is gone from backups within 35 days (assumed).
- Trial accounts: deleted 60 days after the trial ends without conversion (assumed).

Client admin Data and retention page:

- Shows the retention settings, what is kept and for how long, the scheduled deletion dates, and the account state.
- Export all data as a ZIP (CSV and JSON plus certificate PDFs) at any time, and request early deletion with step-up 2FA (section 22.6).
- A plain-language summary of what happens on cancellation.

### 24.7 Keeping provider costs under control

- The biggest running costs are usage-based: AI calls, SMS and WhatsApp, and translation. These stop first (no overage in Past due, off from Limited).
- Compute-heavy jobs pause from Read-only: leaderboard and competition recalculation, analytics, scheduled reminders and auto-assign rules.
- Read-only and Closed accounts should cost very little: text records for a typical setting are small, and archive storage is cheap (VERIFY with real hosting costs once a backend is chosen).
- The maximum exposure for one non-paying client is about 30 days of normal service plus a small storage cost for the export window. Price packages so that bad debt at this level is covered.
- Deletion is automatic at the end of the schedule, so lapsed clients do not accumulate forever.
- The provider dashboard (section 15) adds a dunning view: clients by state, amounts outstanding, retry outcomes, recovery rate, days until each next state, and clients approaching deletion.

### 24.8 Communication and UX

- Staff never see payment wording. Admins see one calm, persistent banner per state, with the date of the next change and a Fix now button. Only people with billing permission see amounts.
- Emails go to the billing contact and Account Owner, with a secure payment-update link. Tone is helpful, not threatening.
- Every state change is logged in the client activity log and the provider audit log.
- A status page in the client admin shows a simple timeline of where the account is and what comes next.
- Accessible and simple, following sections 6 and 16.4.

### 24.9 Data model

- Subscription status gains: Active, Past due, Limited, Read-only, Closed, Deleted, plus Paused and Trial. Each status records the date it started and the date of the next scheduled change.
- A DunningPolicy (provider-level, configurable) holds the timings and the feature rules for each state, so they are config rather than code.
- Entitlements (section 20.6) are computed from the package, active add-ons and the account state, so one function decides what works.
- RetentionPolicy: per client, with the provider's defaults and the client's choices. A scheduled job flags records for deletion and writes a deletion log.

### 24.10 Demo and PoC scope

- A Simulate failed payment button in the presenter or provider panel, combined with fast-forward time (section 9), walks a demo client through Past due, Limited, Read-only and Closed. The banners, locked cards, staff message, exports and Fix now button change at each step.
- Show reactivation: pay in the mock payment page and watch everything return instantly.
- Show the Data and retention page with an export ZIP built on the device and the scheduled deletion dates.
- Build Pack milestone M4, with the provider billing views.

### 24.11 Tradeoffs and risks

- A longer grace period recovers more payments and goodwill, but costs more and delays the signal. A shorter one saves cost but risks losing clients over a bank error.
- Letting staff keep training during Limited means the client has less pressure to pay. Admin-side restrictions and the approaching read-only date provide the incentive without putting compliance at risk.
- Keeping data longer helps clients but increases cost and data protection risk. The Records Keeper plan makes the client choose and pay for it.
- Deletion is irreversible, so warnings, a provider hold option and clear dates are essential.
- All timings and the deletion approach need legal review and must appear in the terms of service and processor agreement.

## 25. Customer support tickets

Customers need a simple way to raise support issues, tagged by feature and issue type, with screenshots to help triage. Tickets come through to the provider admin to review and handle, and both sides see responses, updates, statuses and messages. Provider admins must be able to easily create, update and archive the feature names and issue types, and review what people type when they choose Other, so they can add new options or update existing wording.

Design reasoning only, no new external research. Section 25.10 covers build-versus-buy.

### 25.1 Tickets versus feedback

- Feedback (section 19.1) is quick and needs no answer: app feedback goes to the provider, and module feedback goes to client admins, who may reply but do not have to.
- A support ticket is two-way and tracked: something is wrong or a question needs an answer, with a status, a conversation and a resolution.
- The feedback sheet offers Need a reply? Raise a support ticket instead, and provider admins can convert a feedback item into a ticket, or link the two.

### 25.2 Who can raise tickets and who can see them

- Client admins raise tickets from the Help area or the header menu. Permission: Raise support tickets, and a separate View all of my organisation's tickets (section 22.5, under Feedback and help). Defaults (assumed): every client admin can raise tickets and see their own. The Account Owner and Group Admins can see all the organisation's admin tickets.
- Staff can raise tickets too, from Help in the staff app (assumed, and a client setting can turn this off). Staff tickets are private between the staff member and the provider by default, consistent with section 19.1, unless the staff member chooses Share with my manager.
- Ticket raising is available in every account state until deletion (section 24.4), because customers in dunning may need help with billing or exports.
- Multi-site: tickets record the site, and Group Admins can filter by site (section 14).

### 25.3 Raising a ticket (customer side)

Goal: under a minute, on a phone, without knowing any jargon.

1. Help first: a search box suggests matching FAQs as the person types (section 19.2). If one answers the question, they can stop. If not, Raise a ticket.
2. Feature: a searchable picker of feature names with icons, grouped by area (for example Learning, Quizzes, Notes, Competitions, Battle Room, Calendar, Certificates, Reports, Billing, Login, Themes). The context of the current screen preselects the most likely feature, which the person can change. The last option is Other, which asks for a few words.
3. Issue type: a short picker, for example Something isn't working, I can't sign in, Question or how-to, Content or quiz mistake, Billing or payment, Request a feature, Accessibility problem. The last option is Other, with a few words.
4. How much does this affect you? I can't use the app, Something is broken but I can work around it, or Just a question. This sets the starting priority.
5. Title and description, with plain prompts (What happened? What did you expect?).
6. Screenshots (section 25.4).
7. Submit: a confirmation with a ticket number, a typical response time for their package (section 25.8), and a link to My tickets.

Context attached automatically (as in section 19.1): screen, feature area, module and lesson ids if relevant, role, client and site ids, app version, device and browser, account state, and links to any recent errors from the same session (section 15.5). The person sees what is attached and can remove it.

### 25.4 Screenshots and attachments

- Up to 5 images per message (placeholder), common image formats, with a size limit per image (placeholder 10 MB). Images are compressed on the device before upload.
- On a phone: choose from the gallery or take a photo. On desktop: drag and drop, paste from the clipboard, or choose a file.
- Optional Capture this screen button that takes a picture of the app's current page from inside the app (needs a library, VERIFY quality and privacy).
- Privacy tools before sending: a simple blur or box tool to hide names, children's photos or other personal details, plus a reminder not to include children's information. Image location and camera metadata (EXIF) are removed.
- The provider sees attachments inline with zoom. Viewing attachments is a permission (section 22.3) because they may contain personal data.
- Optional alt text for screen reader users.

### 25.5 Ticket conversation and statuses (both sides)

- Statuses shown to customers: Received, In progress, Waiting for your reply, Resolved, Closed. Reopened when the customer replies after resolution. Internal statuses can be more detailed (for example Investigating, Waiting on engineering) and map to the customer-facing ones.
- A message thread shows messages from both sides with names, times and attachments, and status changes as small timeline events (for example Status changed to In progress by Support, 10:42).
- Customers can reply, add screenshots, mark as resolved, reopen, and rate the help when resolved (a simple thumbs up or down plus an optional comment).
- Resolved tickets close automatically after 7 days with no reply (assumed), with a notice before closing.
- Notifications: in-app (section 21.3 notification centre) with an unread badge on My tickets, and email for replies and status changes. Customers can turn off email but not in-app notices.
- My tickets: a list with status chips, last update, unread markers and filters (Open, Resolved, All). Cards on phone, table on desktop.

### 25.6 Provider ticket inbox (provider side)

- A queue with filters and saved views: status, priority, client, site, package, feature, issue type, assignee, age, Other entries, unread, and response targets at risk. Search across titles, messages and ticket numbers.
- Ticket detail: the conversation, the attached context, client information (package, account state, health score, section 15.4), linked errors and logs, linked feedback, and the client's other open tickets.
- Actions: assign to a team member or take it, change status and priority, re-tag the feature and issue type, add internal notes that the customer never sees, use saved replies (canned responses) with placeholders such as the customer's first name, merge duplicates, link to other tickets, bulk actions, and tags.
- Response targets by package (placeholders, section 25.8), shown as a countdown, with a warning before a target is missed.
- Reporting: tickets by feature, issue type, client, package and week; time to first response; time to resolution; reopen rate; satisfaction; and the top Other entries. Ticket volume and satisfaction feed the client health score (section 15.4) and the product roadmap.

### 25.7 Managing feature names and issue types (provider side)

A Support settings page with two lists, Features and Issue types, each fully editable:

- Create: name, short description shown as help text in the picker, icon, area or group (for features), display order, and optional translations (section 21.4).
- Update: rename or reword at any time. The item keeps its id, so existing tickets and reports stay consistent and simply show the new wording.
- Aliases: other words people use for the same thing (for example Login, Sign in, PIN). Aliases make the picker's search match the customer's own language.
- Archive: hidden from new tickets, kept on existing ones with an Archived label, and restorable. Delete is allowed only if the item has never been used.
- Merge: combine two items, moving all their tickets to one.
- Reorder with move up and move down buttons, and preview the customer picker as it will look.
- Changes are recorded in the audit log (section 22).

Reviewing Other entries:

- An Other entries to review tab lists the free-text answers typed when customers chose Other, grouped by similar wording (case, spacing and simple similarity), with a count, the last time seen, example tickets, and a badge when a phrase is trending (placeholder: 5 times in 30 days).
- Actions for each group: Create a new feature or issue type from this wording (prefilled), Map to an existing item (optionally adding the phrase as an alias), Rename an existing item to use this wording, or Ignore.
- When creating or mapping, the provider can re-tag the matching past tickets in one step, so reports become accurate.
- Each entry has a review status (Unreviewed, Mapped, Created, Ignored), so nothing is reviewed twice.
- Later option: the AI Assistant (section 20.7) could suggest groupings, but the provider always decides.

Seeded defaults: about 15 features grouped by area and the 7 issue types in section 25.3, both editable.

### 25.8 Permissions, packaging and response targets

- Provider permissions (add to section 22.3, Support area): view tickets; reply; assign; change status and priority; add internal notes; view attachments (sensitive); delete or redact attachments (sensitive); merge tickets; manage saved replies; manage features and issue types; view support reports. Scope can be all clients or selected clients, for account managers.
- Client permissions (section 22.5, Feedback and help): Raise support tickets, View all of my organisation's tickets, and Allow staff to raise tickets (organisation setting).
- Packaging: support tickets are in every package (section 20.2). Response targets are placeholders, for example 2 working days for Essentials, 1 working day for Standard, and same working day for Group with priority support (section 20.3). Urgent tickets (I can't use the app) are prioritised in every package. State targets as targets, not guarantees, unless written into a contract.

### 25.9 Data model and retention

- Ticket: id, number, client id, site id, raised by, raiser role (admin or staff), shared with manager flag, feature id or Other text, issue type id or Other text, title, description, impact, priority, status (customer-facing and internal), assignee, tags, context, linked error ids, linked feedback id, created, updated, first response at, resolved at, closed at, satisfaction.
- TicketMessage: id, ticket id, author, side (customer or provider), body, internal note flag, attachment ids, created.
- Attachment: id, message id, file reference, type, size, redacted flag, uploaded by, created.
- SupportFeature and IssueType: id, name, description, icon, area (features), order, status (active or archived), aliases, translations, created and updated.
- OtherEntry: normalised text, group id, count, first seen, last seen, ticket ids, review status, outcome.
- Retention (add to section 24.6, placeholders): tickets and messages kept for 2 years after closure, then anonymised. Attachments deleted 90 days after the ticket closes. Internal notes follow the ticket. Tickets are deleted with the client's data at the end of the Closed state (section 24.3), except where a ticket is needed for a legal claim.

### 25.10 Build versus buy

- Building it inside the app keeps one login, automatic context (screen, errors, account state), tight links to the health score and the Other review, and a consistent UX.
- An established helpdesk product could provide email-to-ticket, response targets, saved replies and reporting out of the box (VERIFY options and costs), but adds a second system, another processor of personal data and less context.
- Recommendation: build the simple in-app version for the PoC and launch, and keep the data model compatible with a helpdesk integration later if volume grows.

### 25.11 Demo and PoC scope

- Customer side: Help, FAQ suggestions, the Raise a ticket form with feature and issue type pickers, Other with free text, screenshot upload with the blur tool, My tickets and the ticket thread.
- Provider side: the ticket inbox, ticket detail with context and internal notes, saved replies, status changes, and the Support settings page with Features, Issue types and the Other entries review.
- Demo flow: as a client admin, raise a ticket about competitions with a screenshot and Other as the issue type. Switch to the provider app, see it in the inbox, reply, set it to In progress and add an internal note. Switch back and see the notification, status and reply. Then open Other entries to review, see a seeded phrase that has appeared several times, and turn it into a new issue type, re-tagging the past tickets.
- PoC storage: tickets and messages are stored on the device. Screenshots are compressed and stored in IndexedDB as images, with a size cap to stay within browser storage limits (VERIFY). Seed about 20 tickets across clients, with several repeated Other phrases. Clearly labelled demo data.
- Build Pack milestones M3 (customer side) and M4 (provider inbox and support settings).

### 25.12 Tradeoffs and risks

- Too many feature names make the picker hard to use, and too few make reports vague. Keep about 15 features grouped by area, use aliases, and let the screen context preselect the right one.
- Other can become a dumping ground, which is why it has its own review queue.
- Screenshots may contain personal data, so the blur tool, metadata removal, permissions and short attachment retention matter.
- Response targets create expectations. Start modest and measure before promising.
- A second channel (feedback plus tickets) can confuse people, so the feedback sheet and the help area point clearly to the right one.

## 26. Provider support operations

Five things a provider needs to run and support clients day to day, found missing in a review of the brief: onboarding new clients, announcements and release notes, recovering a client's account, handling data subject requests, and incident and maintenance messages. Design reasoning only, no new external research. Legal points are marked VERIFY.

### 26.1 Client onboarding and provisioning

- A New client wizard in the provider app: organisation name, industry pack (section 12), package and add-ons (section 20), trial or paid and trial length, billing contact, and sites (section 14). Entitlements are set from the package (section 20.6).
- Invite the Account Owner by email with the role preset and 2FA required (sections 22.5 and 22.6). Optionally invite other admins at the same time.
- Starter content: the pack's default modules, categories, auto-assign rules, reminder policy, FAQs and themes are switched on automatically. The client can change them later.
- Optional staff import from a CSV template, with validation and a preview before anything is created (section 21.1).
- An onboarding checklist visible to both the client and the provider, with progress: invite staff, check reminder settings, assign first training, set up a competition, and export a first training matrix. Steps tick themselves off when done.
- The provider sees onboarding progress per client, stalled onboarding is flagged in the client list, and it feeds the health score (section 15.4).
- Self-serve sign-up with a trial is a later option (section 20.6). The PoC shows the provider-led wizard.

### 26.2 Announcements and release notes

- An announcement composer in the provider app: title, short message, optional link, audience (all clients, by package, by industry pack, selected clients, and client admins or staff), channel (in-app banner, notification centre, and email for admins), schedule and expiry, and a preview.
- A What's new page in both apps lists release notes, linked to the You said, we did changelog (section 19.1). Content updates, such as a new version of a provider module after an EYFS change, appear here with a link to the module (section 5.1).
- Staff-facing announcements are rare, neutral in tone and never about billing (section 24.8).
- Banners are dismissible and never block learning. Read counts per announcement are shown to the provider.
- Permissions: a Communications area in section 22.3, with sending to all clients marked as sensitive.

### 26.3 Client account recovery

The Account Owner might lose the phone with their authenticator app, or leave the organisation without handing over.

- First line: the person uses their recovery codes (section 22.6). If another admin holds the Manage team and roles permission (section 22.5), they can help with other admins, but nobody inside the client can reset the Account Owner.
- Otherwise the person starts a recovery request from the sign-in screen (Can't access your account?) or through a support ticket (section 25).
- Identity checks before any change: a call back to the phone number or email already on record, confirmation from another named client admin, and a documented checklist. Never reset on the strength of an email alone (VERIFY with security advice).
- Dual approval: two provider team members must approve (a sensitive permission in section 22.3), followed by a cooling-off period (placeholder 48 hours) during which every client admin is notified and can object.
- Outcome: reset the Account Owner's 2FA so they enrol again, or transfer the Account Owner role to another named admin. Fully audited and shown in the client's activity log.

### 26.4 Data subject requests

- For training data the client is the controller and the provider is the processor (section 24.6), so a staff member's request to see, correct or delete their data normally goes to their employer. The provider helps through the tools below and passes on any request it receives directly (VERIFY with an adviser).
- Client admin tools: export everything about one person (training records, completions, certificates, notes only if the person agrees, feedback and tickets they raised), and erase or anonymise a person. Erasure checks first for records the client must keep as compliance or inspection evidence, and shows what will be kept and why.
- Provider tools: a data request log with type (access, correction, erasure, other), requester, client, received date, due date (commonly one month under UK GDPR, VERIFY), status, notes and evidence of completion. Reminders before the due date.
- For the provider's own data (billing contacts, provider team accounts) the provider is the controller and handles requests directly.

### 26.5 Incident and maintenance messages

- A system status indicator in all three apps: Normal, Degraded, Maintenance, Incident, with a short message.
- Scheduled maintenance notices sent in advance through announcements (section 26.2), with a banner during the window.
- Incident updates: the provider posts updates (Investigating, Identified, Monitoring, Resolved) that show in the apps and are emailed to client admins for major incidents. A public status page is a later option.
- Personal data breach process: assess, contain, record in a breach log, tell affected clients (the controllers) without undue delay, and support them with any notification to the ICO, which is commonly required within 72 hours where the breach is reportable (VERIFY). Message templates are prepared in advance.
- Permissions: an Incidents area in section 22.3, with posting an incident visible to all clients marked as sensitive.

### 26.6 Data model

- OnboardingChecklist: client id, steps with done flags and dates, started, completed.
- Announcement: id, title, body, link, audience filter, channels, publish at, expires at, created by, read count.
- ReleaseNote: id, title, body, date, linked feedback ids, linked module versions.
- RecoveryRequest: id, client id, subject user id, requester, reason, checks done, approvals (two provider user ids), cooling-off ends at, outcome, status.
- DataRequest: id, client id or provider, type, requester, subject, received at, due at, status, notes, evidence.
- Incident: id, severity, status, title, updates with times, affected areas, started, resolved.

### 26.7 Demo and PoC scope

- Provider app: the New client wizard that creates a demo client with sites and an onboarding checklist; an announcement composer that shows a banner in the client app; a recovery request with two simulated approvals and a cooling-off countdown that fast-forward time can skip; a data request log that uses the existing exports; and a status toggle that shows a maintenance banner in every app.
- Client app: the onboarding checklist, the What's new page, and the person export and erase tools.
- Build Pack milestone M4. All simulated on the device and clearly labelled.

### 26.8 Tradeoffs and risks

- Account recovery is a common route for attackers, so strict checks and dual approval matter more than speed.
- Too many announcements become noise. Keep them rare and targeted.
- Erasure and retention can conflict with a client's duty to keep evidence. The client decides, and the tool shows the consequences.
- Breach handling and request deadlines are legal duties. Take advice and write the process down before launch.

## 27. External training evidence: certificate upload and approval

Staff often complete required training outside the app, for example the free DfE and NSPCC early years safeguarding course, a face-to-face paediatric first aid course, a food hygiene course, or a local authority safeguarding course. Staff upload a photo, screenshot or PDF of the certificate, and anyone with permission approves it, so it counts toward compliance. This makes the Requirements model in section 12.3 work for training the app does not teach. Design reasoning only, no new external research.

### 27.1 Principles

- One general feature for any certificate earned elsewhere, in every industry pack (for example CSCS cards in construction later), not a DfE-only feature.
- An upload is not compliance. It counts only once someone with permission approves it.
- Nobody can approve their own evidence. Every decision is recorded in the audit log.
- Approving should take seconds for a manager, and resubmitting should be easy for staff.
- Uploaded certificates are personal data, so access, storage and retention are controlled (section 27.7).

### 27.2 Which requirements accept external evidence

- Each requirement (section 12.3) lists the evidence it accepts: a module in the app, an external certificate, or either.
- For external certificates, the requirement can also hold: accepted providers or course names (for example the DfE early years safeguarding course, or paediatric first aid courses meeting EYFS Annex A), a link to the external course, whether an expiry date must be entered or is calculated from the renewal period, and a short checklist for the approver.
- The nursery pack sets sensible defaults. Paediatric first aid must be a full course meeting Annex A and renews every three years (EYFS 3.37), so it accepts external certificates only. Safeguarding accepts either the app's module or an external certificate. The DfE's free early years safeguarding course, developed with the NSPCC and launched in July 2026, has five interactive modules of about an hour each, a quiz after each module, and a certificate on completion (NSPCC and Social Care Today, July 2026). VERIFY whether the certificate can be downloaded and whether the course meets the Annex C criteria; if there is no download, a screenshot of the completion screen is the fallback. Food hygiene accepts either.
- Client admins can add their own accepted providers or turn external evidence on or off for a requirement, within what the pack allows.

### 27.3 Staff upload flow

1. From My compliance (section 16.2), each requirement that accepts external evidence has an Upload certificate action next to Start training. A requirement with a linked external course also shows Go to course, which opens it in a new tab.
2. Choose a file: take a photo, choose from the gallery, or pick a PDF. On desktop, drag and drop or paste. Images are compressed on the device and location metadata is removed. Size and type limits are placeholders: images and PDF only, up to 10 MB.
3. Enter the details: course or provider (picker from the accepted list, or Other), date completed, expiry date if the certificate shows one, and a certificate number or verification code if there is one. The expected expiry is shown when it is calculated from the renewal period.
4. Submit. The requirement shows Awaiting check, reminders for that requirement pause, and approvers are notified.
5. The person sees the outcome in My compliance and the notification centre: Approved (the requirement turns Current), Needs a better copy (with the approver's note and a Resubmit button), or Rejected (with the reason and what to do next).

Admins can also upload evidence on someone's behalf from their person record (section 5), for example a paper certificate. It still needs approval by a different person, unless the client has only one admin (section 27.5).

### 27.4 Approval queue (client admin)

- An Evidence to check queue on the dashboard and as its own page: who, which requirement, when submitted, how long it has waited, and the site. Filters by site, requirement and age. Items waiting longer than a set time (placeholder 3 working days) are highlighted.
- The review screen shows the file (zoom for images, an inline viewer for PDFs) beside the details the person entered, the requirement's checklist (name matches, course matches the requirement, provider accepted, date sensible, expiry correct), and any verification code with a note on how to check it with the provider where that is possible.
- Decisions: Approve (the approver can correct the dates first), Ask for a better copy (with a note), or Reject (with a reason from a short list plus free text). Bulk approve is allowed only for items the approver has opened.
- On approval: an Evidence record is created with the completed and expiry dates, the requirement turns Current, the next renewal reminder is scheduled, and the person record shows the certificate with who approved it and when.
- Approved paediatric first aid certificates feed a printable list of staff with a current first aid certificate, which EYFS 3.40 says providers should display or make available to parents.
- The certificate is included in the training matrix export and the person export (sections 5 and 26.4), so an inspector can see the evidence.

### 27.5 Permissions and safeguards

- Client permissions (section 22.5, Training evidence category): Upload evidence for others, and Approve training evidence (sensitive, with scope). Default roles (assumed): Account Owner and Group Admin approve for everyone in scope; Site Manager approves for their site; Supervisor approves for their own site (assumed, as the user suggested supervisors); Trainer and Viewer cannot approve.
- Nobody can approve evidence they uploaded or that is about themselves. A client with only one admin can allow self-approval for the Account Owner's own certificates, flagged in the audit log and shown on the evidence (assumed).
- Every upload, decision, date change and deletion is audited, with the reason. Approved evidence cannot be edited silently: a correction creates a new version with the change recorded.
- Anyone who approves fake evidence is accountable through the audit log. The app makes it clear that approving means the approver has checked the certificate.
- Provider permissions (section 22.3): the provider can view uploaded evidence only through the audited, time-limited view-as-client mode (section 15.6). It is not visible in normal provider screens.

### 27.6 Effects elsewhere

- Requirement status (section 12.3): Awaiting check pauses reminders and shows as amber with an icon and the words Awaiting check. It does not count as compliant. If the requirement expires while evidence waits, it shows as overdue with a note that evidence is waiting.
- Competitions (section 13.4): Beat the Expiry counts external refreshers by their completed date once approved, so a refresher done elsewhere before expiry still qualifies.
- XP (section 16.1): a small fixed XP award on approval, never on upload, so uploading cannot be gamed.
- Stats (section 5.2): requirement completion counts approved external evidence. The provider can see anonymous counts of external uploads per requirement as a signal of which modules the app should add.
- Account states (section 24.4): staff can upload evidence while they can sign in. Approving is a write action, so it stops in Read-only. Evidence files stay exportable until deletion.

### 27.7 Storage, privacy and retention

- Files are personal data. They are visible only to the person, approvers in scope and admins with the person record permission.
- Approved certificates are compliance evidence and follow the training records retention in section 24.6. Rejected and superseded files are deleted after a short period (placeholder 90 days). Location metadata is always removed.
- Production: store files in access-controlled storage with malware scanning and short-lived links (VERIFY provider). In the PoC, files are compressed and stored in IndexedDB within the attachment cap.

### 27.8 Data model

- Requirement gains: acceptsExternal, acceptedProviders (names and optional course links), expiryMode (fromCertificate or fromRenewalPeriod) and approverChecklist.
- EvidenceSubmission: id, clientId, siteId, personId, requirementId, uploadedBy, fileAttachmentId, providerName, completedAt, expiresAt, certificateRef, status (awaitingCheck, needsBetterCopy, approved, rejected, withdrawn), reviewerId, reviewedAt, decisionNote, rejectionReason, evidenceId (once approved), createdAt.
- Evidence (section 12.3) records the submission it came from and who approved it.

### 27.9 Demo

- Mark Taylor's paediatric first aid is overdue in the seed data. In the demo he uploads a photo of his new certificate from My compliance. Priya sees it in Evidence to check, compares it with the details, approves it, and Mark's status and the first aiders list for parents turn current.
- Seed two more submissions: one awaiting check for several days (highlighted) and one marked Needs a better copy.

### 27.10 Tradeoffs and risks

- Screenshots and photos can be faked. Approval with a checklist, verification codes where they exist, accountability and the audit log reduce the risk but do not remove it.
- The approval queue adds work for managers, so it is kept fast, visible and limited to people in scope.
- Accepting external evidence could reduce use of the app's own modules. That is fine for compliance, which is the client's real goal, and the anonymous upload counts show which courses to build next.

## 28. Calendars

Staff and client admins each get a calendar showing what is coming up. It is built entirely from data the app already holds, so it is a new view rather than new data. Design reasoning only, no new external research.

### 28.1 Principles

- Agenda first: a list grouped by Today, This week, Next week and Later is the default, because month grids are cramped on phones and hard for screen readers. A month view is a secondary option.
- Every item leads to an action (start training, upload a certificate, open a competition, assign a refresher).
- Status is never colour alone: each item type has an icon and a label (section 6).
- Nothing is entered by hand in the PoC. Items are derived from requirements, assignments, competitions, themes, announcements and account data, so the calendar is always consistent with the rest of the app, including after Fast-forward time.
- Times are shown in the Europe/London time zone. Most items are all-day.

### 28.2 Staff calendar

Reached from the Coming up strip on Home and from Progress (section 16.2). Default range is the next 90 days, with a link to see further.

Item types:

- Training due dates (assignments and group deadlines such as induction).
- Renewal and expiry dates for each requirement, with the date to start the refresher.
- Certificates awaiting check (section 27).
- Competition start and end dates, and the date winners are announced (section 13).
- Scheduled battles the person is invited to (section 32.2).
- The weekly goal, as a gentle marker on the current week only (section 16).
- Provider maintenance windows and important announcements (section 26).
- Personal markers such as the start and end of a leave pause, so the person can see that reminders are paused (section 21.3).

Actions: open the item, add a single item to the phone's own calendar, or download all upcoming items as a calendar file (.ics). The file contains only the item title and date, never other people's information.

### 28.3 Client admin calendar

Reached from the main navigation. Filters by site (section 14), team, person, requirement and item type. Respects permissions and scope (section 22.5).

Item types:

- Staff expiries and renewals, grouped by requirement and week so clusters stand out (for example 4 safeguarding expiries in the week of 9 November), with a tap-through to the people.
- Assignment and group deadlines, and the dates auto-assign rules are expected to create refreshers (section 21.2).
- Certificates awaiting check, with how long they have waited (section 27).
- Competitions: start, end, and the date to record winners (section 13).
- Scheduled battles in scope (section 32.2).
- Scheduled themes (section 19.4) and scheduled announcements.
- Staff leave and return dates, and new starters' start dates.
- With billing permission only: plan renewal, invoice due dates, add-on trial end dates, scheduled price changes (section 23.11), and the next account state change if a payment has failed (sections 23 and 24).
- Provider maintenance windows (section 26.5).

Planning tools:

- Select a week or a cluster and Assign refresher to everyone expiring in it, using the assign flow in section 5.
- A first aiders forecast: the number of staff with a current paediatric first aid certificate, per site, for each coming week, with a warning if it is forecast to fall below a threshold the client sets. EYFS requires at least one current first aider on the premises and on outings at all times (EYFS 3.37). This is a count of certificates, not a rota check, which the app does not have.
- Export the filtered view as a calendar file or a printable list.

### 28.4 Provider calendar (optional, later)

A similar view for the provider of trial end dates, renewals, dunning state changes, scheduled announcements and maintenance is useful but not required for the PoC. Mention only.

### 28.5 Data and technical notes

- A domain function `calendarItems(actor, range, filters)` derives items from existing records and applies permissions and scope. Items are not stored.
- Calendar files (.ics) are generated on the device in the PoC. In production, a private subscription link that the person can revoke could keep phone calendars updated, but it carries privacy risk if shared, so it is a later option (VERIFY approach and security).
- Packaging: calendars are in every package (section 20.2).

### 28.6 Demo

- As Jade: the Coming up strip on Home, then the full agenda, add her refresher to her phone calendar.
- As Priya: the team calendar shows the cluster of three safeguarding expiries. Select the week and assign the refresher to all three, then show the first aiders forecast dipping until Mark's new certificate is approved (section 27.9).

### 28.7 Tradeoffs and risks

- A calendar can duplicate Home and the dashboard. Keep Home to the next few items and the calendar for planning ahead.
- Month views can overwhelm on a phone, which is why the agenda is the default.
- Calendar files on personal phones leave the app's control, so they hold only titles and dates.

## 29. Luxury retail pack (second full demo)

The PoC includes a second, fully built industry pack for luxury retail, alongside nurseries, so the demo can be shown to luxury retail prospects and so it proves the engine really is industry-agnostic. Research for this section was done on 20 October 2026; legal points are marked VERIFY and need a legal review before any real client relies on the content. Nothing here is legal advice.

### 29.1 What luxury retail clients care about

Two things at once: compliance, and brand excellence.

- Compliance: fire safety, health and safety, first aid, data protection for client records, retail crime and staff safety, payment fraud, and for some stores anti-money laundering and sanctions rules on luxury goods (sections 29.4 and 29.5).
- Brand excellence: vendor sources on luxury training (directional, both selling their own products) say client advisors must master each new collection from the moment it reaches the boutique, tell the house's story and heritage, follow a selling ceremony (welcome, discovery, product story, close, farewell), practise clienteling (building lasting relationships with each client beyond the transaction), keep discretion with high-profile clients, and deliver the same standard in every boutique and market. Training follows the collection calendar, and advisors have no desk and little admin time, so short mobile lessons between clients suit them.
- Onboarding speed matters: new advisors and seasonal temporary staff (for example before Black Friday and Christmas) need to be confident before they reach the floor.

### 29.2 Terminology and structure

- Site: store, with types flagship, boutique and concession (a staffed space inside a department store). Team: department (for example Leather goods, Ready-to-wear, Fine jewellery and watches, Client services). The engine terms stay neutral (section 12.8).
- Job roles (pack defaults): Store Director, Assistant Store Manager, Department Manager, Client Advisor, Senior Client Advisor, Client Relationship Manager or personal shopper, Cashier or Client Services, Stock and Operations Associate, Visual Merchandiser, Alterations Specialist, Concierge, Seasonal Advisor, and Nominated Officer (the person responsible for anti-money laundering reporting, where relevant).
- Oversight bodies (VERIFY each): HMRC, which supervises high value dealers under the money laundering rules; the UK trade sanctions regulator for luxury goods prohibitions (a 2024 legal article named the Office for Trade Sanctions Implementation, OTSI, as the new trade sanctions body; VERIFY its current role); local authority environmental health for health and safety in shops (VERIFY); the fire and rescue authority for fire safety; and the ICO for data protection. In practice, most audits come from head office, brand compliance teams and insurers.
- Inspector-ready exports become audit-ready exports: the same training matrix and evidence, labelled for an HMRC supervision visit, a head office compliance audit or an insurer.
- Personal phones: some luxury brands do not allow personal phones on the shop floor (VERIFY with prospects). Shared-device mode on a back-of-house tablet (section 21.1) and short lessons on breaks cover this.

### 29.3 Site attributes and per-site requirements

- A new engine feature: sites carry pack-defined attributes, and requirements can apply only to sites with a given attribute. For luxury retail: store type (flagship, boutique or concession), and whether the store is registered as a high value dealer.
- This matters because HMRC registration as a high value dealer is per business with a fee for each listed premises, and some retailers choose a written policy of not accepting high value cash at all instead (section 29.5). The same client can have different requirements at different stores.
- Concessions inside department stores may also need to follow the host store's own rules (fire evacuation, security), handled as client-authored modules for that site (section 5.1).

### 29.4 Requirements (pack defaults, placeholders)

Each line gives who it applies to, renewal, evidence and the source. Renewal periods are placeholders unless the law sets one, and the client can change them.

1. Store induction: everyone, once, before working on the floor, app module. Includes emergency procedures and the store's own rules.
2. Fire safety and evacuation: everyone, at induction and when risks change, refresher placeholder every 12 months, app module plus the store's own evacuation plan as a client module. The Regulatory Reform (Fire Safety) Order 2005, article 21, requires adequate safety training when people are first employed and when they face new or increased risks, repeated periodically where appropriate, during working hours. It sets no fixed interval.
3. Fire warden: named staff, placeholder every 3 years, external certificate (section 27).
4. Health and safety, including manual handling of stock and safe use of steps and ladders in stockrooms: everyone, placeholder every 3 years, app module (VERIFY the relevant regulations and guidance).
5. First aid: the people named in the store's first aid needs assessment, external certificate, placeholder every 3 years (VERIFY). HSE says employers must assess their first aid needs; the minimum is an appointed person to take charge of arrangements, who needs no formal training, and some small low-risk workplaces need only a first aid box and an appointed person. There are no fixed numbers of first aiders. The calendar's first aiders forecast (section 28.3) works per store.
6. Anti-money laundering for high value dealers: relevant employees (client advisors, client services, managers and the nominated officer) at stores registered as high value dealers, placeholder every 12 months, app module. Under the Money Laundering Regulations 2017, relevant employees must be made aware of the law on money laundering, terrorist financing and data protection, and regularly trained to recognise and deal with suspicious transactions (VERIFY wording and any HMRC guidance for dealers).
7. High value cash policy: everyone at stores that do not accept high value cash, placeholder every 12 months, short app module. HMRC describes a written policy against accepting high value cash payments, with staff made aware of it, as good practice.
8. Sanctions awareness for luxury goods: client-facing staff, placeholder every 12 months, app module (VERIFY current rules before writing).
9. Data protection and clienteling: everyone with access to client records, placeholder every 12 months, app module (UK GDPR, and consent rules for marketing messages; VERIFY).
10. Retail crime, staff safety and conflict: everyone client-facing, placeholder every 12 months, app module. Covers theft, robbery and smash-and-grab response, de-escalation, incident reporting, and the new offence of assaulting a retail worker (section 29.5).
11. Payment and refund fraud and card security: cashiers, client services and advisors, placeholder every 12 months, app module (VERIFY card security guidance).
12. Accessible and inclusive service: everyone, placeholder every 2 years, app module (Equality Act 2010, VERIFY).
13. Brand standards and product knowledge: everyone client-facing, assigned with each collection launch, client-authored modules (section 29.6). Not a legal requirement, but central for luxury clients.

### 29.5 Legal points behind the content (VERIFY before writing modules)

- High value dealers: a business must register with HMRC before it accepts or makes cash payments of 10,000 euros or more (or the equivalent in any currency) for goods. This covers a single payment or several linked payments for one transaction, including payments split to stay under the limit. Cash means notes, coins or traveller's cheques, including cash a customer deposits straight into the business's bank account. A business only paid large amounts by card or cheque does not need to register. An annual fee is paid for each listed premises.
- HMRC's supervision handbook lists high value dealer risks such as cash arriving through third parties or couriers, unrecorded cash sales, and stores accepting cash without being registered, which it links to poor staff training or unclear policies, controls and procedures.
- Sanctions on luxury goods: a 2024 article by barristers at 2 Hare Court describes the UK prohibition on exporting luxury goods to, or for use in, Russia, and on making them available to persons connected with Russia. Its examples include handbags and travel goods priced over 250 pounds per item, and it notes that a person ordinarily resident in Russia, even on holiday in the UK, may count as connected. Breaches can bring criminal liability, and civil penalties can be imposed without proof of intent. Red flags include customers with many cards, unusual identification, reluctance to give information, out-of-character transactions and several purchases just below thresholds. This is a secondary source from 2024, so the rules must be checked against current government guidance before any module is written (VERIFY).
- Retail worker protection: the Crime and Policing Act 2026 creates a standalone offence of assaulting, threatening or abusing a retail worker in the course of their employment, modelled on Scottish law in force since 2021, and repeals the provision that had treated shop theft of goods worth 200 pounds or less differently, so all shop theft is treated with consistent seriousness. A May 2026 law firm summary gives no commencement dates (VERIFY when each part comes into force). It suggests retailers review incident reporting and staff training.
- Fire safety: see requirement 2 in section 29.4.

### 29.6 Brand content and the collection calendar

- Provider-authored modules cover the compliance requirements in section 29.4 (written to the shorter standard for the PoC).
- Client-authored brand modules show off the Module Builder (section 5.1): The house story, The selling ceremony, Clienteling and discretion, Caring for leather goods, and one module per collection launch.
- Collection launches: a collection module group (section 17.1) with a launch date in the calendar (section 28). An auto-assign rule assigns it to everyone client-facing on the launch date with a short due date (section 21.2).
- Content must never name real brands, real clients or recognisable high-profile people. Scenarios use fictional names.

### 29.7 How the features map to luxury retail

- Competitions (section 13): a Product Knowledge Challenge on the new collection (Mastery Month template), Closed-Book Challenge for product knowledge, and Team Showdown between stores. No competition uses sales figures: the app has no sales data, and rewarding sales would conflict with the principles in section 13.1.
- Calendar (section 28): collection launches, the annual anti-money laundering refresh cluster, and the seasonal temporary staff wave before Black Friday and Christmas.
- Multi-site (section 14): flagship, boutiques and concessions compared side by side, with per-site requirements (section 29.3). The Sites board ranks stores nationally and globally, for example on Collection readiness after a launch.
- Stores outside the UK: a global house has stores in many countries. In the PoC, the fictional house has two overseas stores that receive brand modules only; the UK compliance requirements apply only to sites whose country is the UK. Running the app for staff outside the UK raises different employment, data protection and data transfer rules (VERIFY before any real use).
- External evidence (section 27): first aid and fire warden certificates, and certificates from a brand's own academy.
- Module feedback (section 19.1): advisors flag product details that are out of date after a launch.
- Multilingual (section 21.4): international teams, keeping in mind that translation is not the same as adapting content for a market.
- Themes (section 19.4): the client's own colours and logo matter more to luxury clients than to nurseries, so the Group package branding options are a selling point.
- Privacy: client records belong to the client's own systems; the app never stores customer names in training content, notes or feedback, and staff are reminded of this.

### 29.8 Data model additions

- Site gains attributes: a map of pack-defined attributes (for luxury retail: storeType, and hvdRegistered as true or false).
- Requirement.appliesTo gains siteAttributes, so a requirement can apply only at matching sites.
- IndustryPack.terminology gains labels for the audit export (Inspector-ready for nurseries, Audit-ready for retail) and for site and team types.
- No other engine changes: everything else is content, configuration and seed data.

### 29.9 Effect on scope and risks

- Two full packs double the content work and the seed data, and add a demo track. The Build Pack adds a separate milestone for the retail pack, after the nursery story works end to end.
- Legal content (anti-money laundering, sanctions, the new retail worker offence) carries more risk than the brand content. It is checked against current official guidance when written, and ships with a Draft label for each client's compliance team to review (decided 22 October 2026). In the client app, a person who can manage modules can mark a legal-topic provider module as Reviewed by our organisation (recorded in the activity log, and it removes the label for their staff), duplicate it and adapt the copy, or write their own module. The provider should still take legal advice before marketing these modules as compliant (VERIFY).
- Luxury prospects judge on polish and brand feel. The theme builder and a fictional luxury brand in the demo help, but real brand names, logos and trade dress must never be used.
- General (non-luxury) retail remains a later pack: it shares the compliance core but adds age-restricted sales and much higher volumes.

### 29.10 Tailoring for a heritage, craftsmanship-led house

The first luxury prospect is a heritage house built on craftsmanship, named privately by the user. The demo is tailored to what such a house values, while its brand stays fictional and clearly original.

- The fictional house (Maison Elvaro in the Build Pack) centres its training on craft: materials and how pieces are made by hand, the stories of its artisans and workshops, care and repair of pieces over their lifetime, the selling ceremony, discretion with clients, explaining limited availability gracefully, and handling exceptional, very high-value pieces.
- Departments reflect a multi-craft house: Leather goods and saddlery, Silk and textiles, Ready-to-wear, Jewellery and watches, Home and tableware, Fragrance and beauty.
- Engagement stays tasteful: no badges or celebrations that feel like a game show, quiet progress rings, and competitions about knowledge of the craft, never about sales.
- The luxury pack has its own prize suggestion list suited to such a house (section 13.3), for example an afternoon with the alterations or repair team, lunch with the Store Director, a place at a collection preview, an extra paid half day, or a charity donation in the winner's name.
- The fictional brand must not imitate any real house: no real names, logos, product names, signature colours, packaging, typefaces or store addresses, in the app, the content or the documents.

### 29.11 Prospect confidentiality and branding in demos

- Never write a prospect's or client's real name in the repository, the brief, the Build Pack, seed data, content, commits or issue titles. The repository is public (section 9). Refer to "the first luxury prospect" instead. A local, git-ignored list of protected names can be checked by a pre-commit hook (Build Pack section 12.2).
- A prospect's own branding may appear only live, during a meeting, with their permission, using assets they supply: their team types their organisation name (section 30) and applies their logo and colours in the theme builder (section 19.4). This is stored only on the presenter's device, is cleared by Reset demo or a Clear prospect branding control, and is never committed or published.
- If permission is not given, the demo uses the fictional house throughout.
- Private research about a prospect lives in separate pitch notes kept outside the repository.

## 30. Organisation name and billing details

Client admins with permission can change their organisation's name as shown to admins and staff. The provider sees each change and decides whether the billing details should change too, because the name a client wants to show (for example a store or trading name) often differs from the legal name on invoices. Design reasoning only, no new external research.

### 30.1 Two separate names

- Display name: what admins and staff see in the apps (header, welcome screen, emails, certificates, exports and the staff app's About screen). Owned by the client.
- Billing name and details: the legal or invoicing name, billing address, VAT number if any, and billing contact. Used on invoices and receipts. The billing name is controlled by the provider; clients can see it and request changes.
- A short name (optional) for small screens, and the logo, which stays in the theme builder (section 19.4).

### 30.2 Client side

- Organisation profile in client settings: display name (2 to 60 characters, placeholder limits), optional short name, a live preview of how staff will see it, and a note that invoices use the billing name.
- Permission (section 22.5, Settings and billing): Edit organisation name. Default holders (assumed): Account Owner and Group Admin.
- Every change is recorded in the client activity log with old name, new name, who and when. Staff see the new name straight away.
- Certificates already issued keep the name they were issued under. Exports use the current name, with "formerly ..." shown for 90 days after a change (placeholder).
- Billing details: people with View billing see the billing name and details. People with Manage plan and payment can edit the billing contact directly (section 23) and send a request to change the billing name, address or VAT number, which the provider reviews.

### 30.3 Provider side

- Every display name change appears in a Profile changes queue and on the client's Overview tab (section 15.3), with old and new names, who changed it, when, and the current billing name side by side. The client list shows a small Name changed flag until it is reviewed, and a Billing name differs badge when the two names differ.
- Review options: Keep billing name (the usual case, for example a trading name), Update billing name to match (applies to future invoices only; issued invoices never change), or Ask the client to confirm their billing details (sends a message to the billing contact or opens a support ticket, section 25).
- Billing detail change requests from clients appear in the same queue: Approve, Edit before approving, or Decline with a reason.
- Provider permissions (section 22.3, Clients and Billing areas): review profile changes; edit billing name and details (sensitive); revert a display name (sensitive, for example if it misleads or impersonates another organisation, with a message to the client).
- All decisions are audited.

### 30.4 Data model

- Client gains displayName, shortName and nameHistory (old, new, changedBy, changedAt, reviewStatus: pendingReview, billingKept, billingUpdated, clientAsked, reverted).
- BillingProfile: clientId, billingName, address, vatNumber, billingContactEmail, updatedBy, updatedAt.
- BillingChangeRequest: id, clientId, requestedBy, proposed fields, status (pending, approved, declined), reviewer, reason.
- Invoices store the billing name and address as they were at issue.

### 30.5 Demo

- In the luxury retail tour, the prospect (with permission) types their own organisation name in the client app and sees it on the staff app straight away (section 29.11). In the provider tour, the change appears in Profile changes beside the billing name, and the presenter chooses Keep billing name.
- In the nursery data, Oak Tree Nurseries has a seeded pending change (to "Oak Tree Nurseries Group") for the provider tour.

### 30.6 Tradeoffs and risks

- A free-text name can be misused to impersonate another organisation. The provider review queue and the revert permission handle this.
- Changing invoice names needs care for tax records, so issued invoices never change and the billing name stays under provider control.

## 31. Learn more links on answers

When staff see the explanation for an answer, especially a wrong one, a Learn more link takes them to an official resource that explains the point in more detail, where one exists. Client admins can optionally add their own source material, such as their policy document. Design reasoning only, no new external research.

### 31.1 Where links appear

- In the answer feedback after each question, below the explanation. Shown for wrong answers by default, and for right answers too if the module setting allows (default on).
- On the results screen, in a Review what you missed list: each missed question with its explanation and links, so staff can follow up after the quiz.
- At the end of a lesson, as Further reading (optional, set per lesson).
- Never as a pop-up, and never blocking progress.

### 31.2 What a link looks like

- Descriptive text, not just "Learn more": for example "Learn more: first aid on outings, EYFS paragraph 3.37 (GOV.UK)". Screen readers hear the same description, plus "opens in a new tab".
- A small label for the type of source: Official guidance, Legislation, Regulator, or From your organisation. An external link icon and the website name (for example gov.uk) so people can see where they are going.
- A locator where helpful: the paragraph, section or page (for example "paragraph 3.37, page 30"). For PDF documents a page anchor can open the right page in many browsers (VERIFY behaviour on phones).
- If the resource is only in English and the person uses another interface language, the link says "(in English)" (section 21.4).

### 31.3 Who adds links

- Provider modules: the provider adds official links to each question and lesson where available, for example the EYFS framework on GOV.UK, HSE guidance, HMRC guidance or legislation.gov.uk. Content rule: every provider question that has an official source gets at least one Learn more link, and the source reference and the link must agree.
- Client admins, optional: with permission, they add their own material to any module they can see, including provider modules they cannot edit. They can add a web link, or upload a document (PDF, up to a placeholder 10 MB) such as their safeguarding policy or cash policy. These appear under From your organisation, after the official links. Client additions are a client-level layer, like categories (section 17.1), so the provider module itself is unchanged and a new provider version keeps the client's links where the question still exists.
- Client-authored modules: the Module Builder has link fields for every question and lesson.
- Permission (section 22.5, Modules and Module Library category): Add learning links and documents. Default holders (assumed): Account Owner, Group Admin, Site Manager (for their site) and Trainer.

### 31.4 Rules and safeguards

- Links must use https. The app shows the destination domain and opens links outside the app (a new tab or the phone's browser), never inside a frame.
- Provider links are checked: in production a scheduled job tests links and flags broken ones in the provider content library; in the PoC a manual Check links button reports which links look unreachable (simulated).
- Client links are the client's responsibility. The admin sees a short reminder to link only to official or approved material, and every change is recorded in the client activity log.
- Uploaded documents count against the attachment cap in the PoC and follow the client's retention settings (section 24.6).
- Closed-book attempts (section 18.4): Learn more links are hidden until the attempt ends, then shown on the results screen, so they cannot be used to look up answers mid-quiz. Open-book attempts show them as normal.
- No XP is given for opening links, so they cannot be farmed (section 16.1).
- Offline: links show "Available when you are online". Uploaded client documents can be cached for offline reading after first open (assumed).

### 31.5 Stats

- Opening a link is recorded as an anonymous count per question and link. Client admins see "Learn more opened" in question insights (section 5.2), a hint about where staff want more help. The provider sees counts across clients for provider modules, to spot questions that need a clearer explanation.

### 31.6 Data model

- Question and Lesson gain learnMore: a list of links, each with id, title, url or attachmentId, publisher, kind (official, legislation, regulator, organisation, other), locator, language, showFor (wrong only, or all answers), and lastCheckedStatus.
- ClientLinkOverlay: clientId, siteId (optional), moduleId, questionId or lessonId, links, addedBy, addedAt.
- Link opens are recorded as learning events with the link id (no extra personal detail in provider views).

### 31.7 Tradeoffs and risks

- Official websites change addresses. Link checks and showing the publisher and locator reduce the damage when a link breaks.
- Links mid-quiz can become an answer lookup, which is why closed-book attempts hide them until the end.
- Client documents may go out of date. They follow the module feedback flow (section 19.1), so staff can flag them.

## 32. Battle Room (live quiz battles)

Battle Room is a short, live quiz session (for example 10 questions) in the style of popular classroom quiz games. A host gathers colleagues into a room and everyone answers the same questions at the same time on their own phone. Staff can set one up themselves, and client admins such as managers and supervisors can host one for their teams. Hosts can invite people from their own site or from the organisation's other sites. There are two formats: Free for all, where every player competes individually against everyone else, and Team v team. Design reasoning only, no new external research.

### 32.1 Decisions

- Two scoring modes chosen by the host: Accuracy mode and Speed mode (section 32.4).
- Two formats chosen by the host: Free for all (individual players against each other) and Team v team (section 32.3).
- An optional Raise the stakes setting for either mode, which deducts points for wrong answers and for not answering, instead of giving zero (section 32.4).
- Rewards outside the room: a small, capped amount of XP and Battle Room badges only. No effect on standing leaderboards, the Sites board, competitions or compliance.
- PoC: live play is simulated against seeded colleagues, because a static site has no real-time server (section 32.11).

### 32.2 Hosting and inviting

- Who can host: staff, if the client allows it (Allow staff to host battles, on by default, assumed), and client admins with the Host battles permission (section 22.5, Competitions and prizes category).
- Who can be invited: staff hosts can invite colleagues at their own site and, if the client allows cross-site battles (on by default for multi-site clients, assumed), colleagues at the organisation's other sites. Admin hosts can invite anyone within their permission scope. Battles never mix different clients.
- The invite picker shows only display name, site and department, so staff never see other sites' personal records. Search by name, site or department, or pick a whole team or site.
- Ways to join: an invitation in the notification centre (section 21.3), a room link, or a QR code or short room code shown on the host's screen. Codes expire when the room closes.
- Where it lives: a Battle Room button on the staff Compete tab (section 16.2), and an Engage menu item with battle settings for client admins. Invitations and scheduled battles also appear in the notification centre and calendar.
- Invitations are opt-in. People can accept or decline, nobody is penalised for declining, and people on leave are not shown.
- Room size: 2 to 50 players (placeholder, limited by package, section 32.10).
- Scheduling: a battle can be started now or scheduled; scheduled battles appear in the calendar (section 28) with a reminder.

### 32.3 Room settings (chosen by the host)

- Question source: one module, a category, a module group, or Mixed refresher. Questions come only from modules the players have already completed, so the battle is recall practice rather than a test of new material. Questions in any live closed-book competition are excluded so answers cannot leak (section 18.4).
- Number of questions: 5 to 20, default 10.
- Time per question: 10 to 60 seconds, default 20 in Accuracy mode and 15 in Speed mode (placeholders).
- Scoring mode: Accuracy or Speed.
- Raise the stakes: off by default.
- Format: Free for all (the default), where every player competes individually against everyone else on one scoreboard; or Team v team, with teams by site, by department, or random teams of similar size. A Team v team battle needs at least two players per team (placeholder).
- Standings between questions: show the top 3 and each player's own position, or hide standings until the end.
- The lobby shows every player the mode, whether Raise the stakes is on, the number of questions and the timer, so people know the rules before they start. Anyone can leave at any time.

### 32.4 Scoring (placeholder values, configurable by the provider)

Accuracy mode (the default):

- Correct answer: 1,000 points. Wrong answer: 0. No answer before the timer ends: 0 (unless Raise the stakes is on).

Speed mode:

- Correct answer: 500 points plus up to 500 more for answering quickly. The speed bonus is measured against each player's own time limit, so someone with extra time (section 32.5) is not penalised for using it.
- Wrong answer: 0. No answer: 0 (unless Raise the stakes is on).

Raise the stakes (either mode):

- Wrong answer: minus 500 points.
- No answer before the timer ends: minus 250 points. Sitting out is no longer free, but it costs half as much as a wrong answer, so a player who is unsure still has a safer choice than guessing. This rewards knowing the answer and staying engaged.
- Players with extra time (section 32.5) only lose the 250 if their own longer timer runs out.
- A player's total never goes below zero (assumed).
- The lobby and each question show a clear Raise the stakes label.

Both modes:

- Ties are shared.
- Free for all: each player's own total decides their position.
- Team v team: each player still earns points individually, and the team score is the average per team member, so teams of different sizes compete fairly. Players see their team's position and their own contribution.
- No streak multipliers or random bonuses (section 16.1).

Speed mode is a deliberate, opt-in exception to the rule that nothing rewards speed (section 13.1). It applies only inside the room. XP, badges, standing leaderboards, competitions and compliance never use speed or battle scores.

### 32.5 Fairness, accessibility and wellbeing

- Extra time: each person can have a private extra time setting (for example plus 50 or plus 100 per cent), set by themselves or by an admin as a reasonable adjustment. Nobody else can see it.
- Read-aloud reads each question and its options (section 21.4), and Simple view and large text work in battles (section 19.3).
- Questions show in each player's own interface language where a translation exists.
- Only the podium (top 3) is shown to everyone. Every other player sees their own position privately. There is never a last-place screen.
- Team v team takes the sting out of individual ranking and suits mixed-confidence groups. Free for all suits people who want to test themselves against colleagues; the same top-3 and private-position rules apply.
- Hosts see a short reminder that battles are optional and for fun.

### 32.6 Running it in a real workplace

- Packs supply a host checklist shown before a battle starts. Nursery pack: check staff-to-child ratios and supervision are maintained, and run battles in staff meetings, during breaks or when children are not present (EYFS 3.43 to 3.57). Luxury retail pack: back of house only, never on the shop floor or in front of clients.
- Battles never pause or interrupt mandatory training, and they are never required.

### 32.7 Live flow

1. Lobby: players join and see the rules; the host sees who has joined and can remove someone.
2. Countdown, then each question appears for everyone at once with the timer.
3. Answers lock when the timer ends or everyone has answered.
4. Reveal: the correct answer, how many chose each option (without names), and the short explanation. Learn more links (section 31) are collected for the end, so players do not leave mid-battle.
5. Standings: top 3 plus own position, if enabled.
6. Final podium, then a personal summary for each player: score, correct answers, and the questions they missed with explanations and Learn more links.
7. Host summary: which questions most players got wrong. Admin hosts can assign a refresher to the people who missed them in one tap (section 21.2).

Host controls: pause, skip a question, remove a player, end early. If a player disconnects, they can rejoin within the same question and keep their score.

### 32.8 Safety, privacy and anti-cheating

- Names show as display name or nickname with site (section 13.1). No free-text chat: only a small set of preset emoji reactions, to avoid moderation and safeguarding problems.
- People who hide themselves from leaderboards appear as "A colleague" on the podium and standings.
- Production anti-cheating: the server holds the correct answer until the reveal and timestamps each answer on receipt, one device per person per room, and answers after the timer are rejected. Notes are always locked during battles (section 18).
- Battle results are kept for a short period for summaries (placeholder 90 days), then aggregated (section 24.6).

### 32.9 Rewards

- XP: a small fixed amount per correct answer, the same in both modes, capped per battle and per day (placeholders: 5 XP per correct answer, at most 50 per battle and 100 per day from battles). XP never goes down, even with Raise the stakes.
- Badges: First battle, Battle regular (10 battles), Podium finish, and Team victory.
- Battle results do not appear on standing leaderboards or the Sites board, and do not count towards competitions or compliance.

### 32.10 Permissions, packaging and account states

- Client settings: Allow staff to host battles, Allow cross-site battles, maximum room size, and whether Speed mode and Raise the stakes are available (all on by default, assumed).
- Packaging (placeholders, section 20): Essentials, 2 battles a month with up to 10 players; Standard, unlimited battles with up to 30 players; Group, up to 50 players and cross-site battles. Real-time connections cost money in production, so limits protect the provider.
- Account states (section 24.4): battles work in Past due; from Limited, no new battles can be started.
- Provider usage metrics include battles hosted, players per battle and repeat hosting (section 15.3).

### 32.11 Technology

- Production needs a real-time service: a persistent connection from each phone to a server that sends each question at the same moment, collects answers with server timestamps, handles reconnection, and scales to many simultaneous rooms (VERIFY options and costs: a self-hosted WebSocket service or a managed real-time service).
- A big-screen mode (questions on a staff-room TV or laptop while players answer on phones) is a production feature, not in the PoC.
- PoC: the host plays live against simulated colleagues from the seed data. Each simulated player answers with a probability based on their history in that module, and with realistic, varied response times. The room is labelled Simulated players. Optionally, two browser tabs on the same device can join the same room for a more realistic demo (VERIFY browser support for cross-tab messaging).

### 32.12 Data model

- BattleRoom: id, clientId, hostUserId, siteIds, mode (accuracy or speed), raiseTheStakes, format (freeForAll or teamVsTeam), teamRule, questionSource, questionIds, timePerQuestionSeconds, showStandings, simulated (PoC only), status (scheduled, lobby, live, ended, cancelled), scheduledAt, startedAt, endedAt, joinCode.
- BattleParticipant: roomId, userId, siteId, teamId, displayName, hiddenFromLeaderboards, extraTimePercent, joinedAt, leftAt, totalScore, finalPosition.
- BattleAnswer: roomId, questionId, userId, optionId, correct, answeredAtMs, timeLimitMs, points.
- Battle XP uses the existing XP ledger with its own entry type and caps (section 16.5).
- Client settings gain battle settings (allow staff to host, allow cross-site battles, maximum room size, Speed mode and Raise the stakes availability). Each person's private extra time setting lives in their preferences. Entitlements gain battles per month, maximum players and cross-site battles (section 20.6).

### 32.13 Tradeoffs and risks

- Speed mode can encourage rushing. It is opt-in, labelled, and has no effect outside the room.
- Raise the stakes can feel harsh for less confident staff, especially now that not answering also costs points. It is off by default, shown clearly in the lobby with both deductions, and scores never go below zero.
- Live sessions take staff away from children or clients, hence the host checklist and the optional nature of battles.
- Real-time infrastructure adds cost and complexity in production. Package limits and a simulated PoC keep this contained until clients show they want it.

## 33. Sources

- Open questions review (22 October 2026): NSPCC, free early years safeguarding training (nspcc.org.uk, July 2026); Social Care Today, free safeguarding training launched for early years staff (socialcare.today, 22 July 2026); GitHub Docs, What is GitHub Pages? (docs.github.com/en/pages).

- Luxury retail pack (section 29): GOV.UK, Money Laundering Regulations: high value dealer registration (gov.uk/guidance/money-laundering-regulations-high-value-dealer-registration); HMRC Economic Crime Supervision Handbook ECSH51600, high value dealer money laundering risks (gov.uk/hmrc-internal-manuals/economic-crime-supervision-handbook/ecsh51600); Osborne Clarke on the Money Laundering Regulations 2017 training requirement (osborneclarke.com); legislation.gov.uk, Regulatory Reform (Fire Safety) Order 2005, article 21; HSE, first aid: what employers need to do (hse.gov.uk/firstaid/what-employers-need-to-do.htm); Browne Jacobson, Crime and Policing Act 2026 for retailers (brownejacobson.com, May 2026); 2 Hare Court, sanctions in the luxury goods sector (2harecourt.com, May 2024); Beedeez and Attensi on luxury sales training (vendor blogs, directional).

- Failed payments and retention: Stripe docs on automatic retries (docs.stripe.com/billing/revenue-recovery/smart-retries); Kinde guide on failed payments and involuntary churn (kinde.com); ICO guidance on the storage limitation principle (ico.org.uk); EYFS paragraph 3.98 on retaining children's records. Other dunning guides found but not read: Chargebee, Maxio, DealHub, HubiFi, Fungies.

- Roles and permissions (titles only, not read in depth): Frontegg, Stytch, Oso, Cerbos and Microsoft Azure RBAC best-practice articles.
- Packaging and AI pricing (vendor blogs and reports, directional): getmonetizely.com AI pricing models 2026; research.stripo.email SaaS pricing trends 2026.
- Frontline training platform expectations (vendor sites, directional): opus.so best mobile LMS for frontline teams; 5mins.ai frontline platforms; mangoapps.com; ispringsolutions.com; doinstruct.com; zensai.com.
- Gamification pitfalls (directional, mostly blogs and a case study): arxiv.org/abs/2203.16175 (Duolingo gamification misuse case study), androidauthority.com (XP boost article), uxdesign.cc (good, bad and ugly of Duolingo gamification), mattmecham.substack.com (one year streak), pcworld.com, screenwiseapp.com.
- Designing for older adults: Design Guidelines of Mobile Apps for Older Adults, JMIR mHealth and uHealth, 2023 systematic review (mhealth.jmir.org/2023/1/e43186); OzCHI 2024 paper Design for Older People; thisisglance.com guide; uxdesign.cc designing for older audiences checklist.
- Multi-industry strategy: vertical versus horizontal SaaS articles from devsquad.com, embarque.io, upstackstudio.com and livmo.com (directional only).
- EYFS statutory framework PDF and GOV.UK landing page (links in section 2).
- Market and product pages reviewed: nurseryinabox.com, cheqdin.com, openeducat.org, nurseryspace.co.uk, get-otii.com, mandatorytraining.co.uk (ComplyPlus), nationalnurserytraining.com, eyalliance.org.uk, gemadvisoryservice.com, eypeople on getapp.com.
- Pricing: hubbatraining.ezycourse.com, ovivio.com (NoodleNow), nmt-magazine.co.uk (CareTutor), ndna.org.uk (course bundles).
- Engagement claims: vendor blogs (arist.co, brasstacks.works, mobietrain.com, 5mins.ai, talentlms.com). Directional only.
- Ofsted examples: files.ofsted.gov.uk inspection reports and complaint outcomes (2025-2026).
- Touch target guidance: Apple Human Interface Guidelines, Google Material Design, WCAG 2.2 (SC 2.5.5 and 2.5.8).
