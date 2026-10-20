# Facts for the in-app «Справочник» (verified in code, 2026-10-18)

Paths: API = apps/api/src/modules, app strings = apps/mobile/lib/core/l10n/strings.

## Before a bid is accepted
- Only VERIFIED attorneys see open cases (cases/policies/case-access.policy.ts:73-82). Tiers: participant / prospect (licensed in a case state) / browser — ANY verified attorney may see any open case (owner decision 2026-10-04). Blocks hide both ways. Paused cases leave feed/search.
- Visible: title, full brief, practice, states, city, budget, urgency, cover, counts, client online/last seen (only if the client allows). Counts only: number of photos/files, length of private details. Never: client name, avatar, username, contacts.
- Private details + photos/files: only the owner and the accepted attorney (services/case-photos.service.ts:122-150).
- Case comments: visible to everyone who sees the case; the client is anonymous to attorneys.
- Chat before acceptance allowed: client shown as «Клиент по кейсу»; contact info in messages masked; photos/documents blocked (CHAT_ATTACHMENTS_LOCKED).

## On acceptance (bids/acceptance/bid-acceptance.service.ts:200-320)
- Case → in progress; other bids rejected_auto (+ notification); accepted chat contacts_unlocked; other attorneys' chats read-only; contact_disclosures row (fields, IP, device).
- Photos + private details to the accepted attorney (no subscription check). Contacts only via GET /cases/:id/contacts, needs active subscription/trial.
- Client closes the case: active bids rejected (case_closed), chats read-only.

## Assistants (assistants/assistant-duties.ts)
- Duties: calls, chats, files, cases, bid_drafts, posts, tasks, profile, bids, publish; start with none. Granting ANY duty requires the attorney's liability consent (terms 2026-10-01, stored with IP/UA): attorney takes full responsibility; LawBid is not a law firm; state ethics rules on supervising non-lawyer staff apply; revocable.
- With `cases`: case details incl. private details of won cases; with `chats`: all the attorney's chats (labelled «Assistant of …»).
- GAP: GET /cases/:id/contacts has no duty check (any active assistant). Owner asked (fix?).

## Files, chat, staff
- Signed links: case/chat files 1 h (private bucket); verification docs 5 min; only clean (scanned) files.
- Chat message bodies AES-256-GCM encrypted at rest in production (common/secrets/message-body-cipher.ts). No user delete/edit of messages.
- Staff: admin/support case view includes private details; moderation reads reported content; data-subject/legal exports decrypt messages; verification docs only for verifiers, audited. → «не видим даже мы» is NOT true (owner asked A1/A2).

## Rules
- No phones/emails/URLs in case title, brief, city, case comments, reviews (contact-detector). Not checked in private details, bids, posts.
- Paying outside the platform: warning for unverified attorneys; case payments go directly to the attorney's Stripe account, LawBid takes no share.
- Stale cases: question after 2/4/7/30/30 days silence (very urgent…flexible), pause after 1/2/3/4/14 more days, archive 30 days after pause; asked 9:00–21:00 client time; only the client's actions count.
- Account deletion: 14 days grace, then anonymization (messages → [deleted], files removed, open cases archived, in-work cases closed); legal records kept 5 years.
- Reports: post, comment, user, message, case, review, case_comment, client_review, sticker_pack; auto-hide at 3 reports. Blocks are symmetric.
- Before the first case the client consents that contacts go to the attorney whose bid they accept.

## Form texts that do not match the code
1. «видят только адвокаты вашей области права и штата» — false (any verified attorney). Owner asked B1/B2.
2. «Ваше имя, контакты, фото и документы получит только адвокат, чей бид вы примете» — also the attorney's assistants (with duties) and staff; contacts need the attorney's subscription.
