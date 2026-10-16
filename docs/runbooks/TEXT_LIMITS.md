# Text limits (admin → Настройки → «Лимиты ввода»)

Owner 2026-10-15. One list of how many characters each free-text field takes.
The server is the source of truth; the app takes the same numbers from the
public bootstrap (`app_config`, keys `limits.*`, `post.max_chars_*`) and shows
a counter in the field (`n/limit`; in the chat field it appears near the
limit). A change applies in about 30 seconds, without a release.

| Field | Key | Was (app / server / database) | Now (default = was) | Admin may set |
|---|---|---|---|---|
| Chat message | `limits.chat_message_chars` | 2000 / 2000 / – | 2000 | 1–10 000 |
| Comment (post, reel, case) | `limits.comment_chars` | 1000 / 1000 / 1000 | 1000 | 1–5000 |
| Brief (text post) | `post.max_chars_brief` | 3000 (app never saw the admin value) / admin / 5000 | 3000 | 1–5000 |
| Caption with photo, video, files | `post.max_chars_media` | 2200 / admin / 5000 | 2200 | 1–5000 |
| Post / reel title | `limits.post_title_chars` | 120 / 120 / 120 | 120 | 1–300 |
| Case title | `limits.case_title_chars` | 120 / 120 / 120 | 120 | 1–300 |
| Case description | `limits.case_description_chars` | 5000 / 5000 / 5000 | 5000 | 1–20 000 |
| Offer message | `limits.bid_message_chars` | 2000 / 2000 / 2000 | 2000 | 1–10 000 |
| Counter-offer message | `limits.counter_message_chars` | 500 / 500 / – | 500 | 1–2000 |
| Review text | `limits.review_chars` | 1000 / 1000 / 1000 | 1000 | 1–5000 |
| Dispute / completion note | `limits.dispute_chars` | 1000 / 1000 / – | 1000 | 1–5000 |
| Note with files (workspace) | `limits.workspace_note_chars` | 1000 / 1000 / 1000 | 1000 | 1–1000 |
| Case update (workspace) | `limits.workspace_update_chars` | 5000 / 5000 / 5000 | 5000 | 1–20 000 |
| Message to support | `limits.support_message_chars` | 4000 / 5000 / 5000 | 5000 | 1–20 000 |
| Attorney bio | `limits.bio_chars` | 300 / 300 / 300 | 300 | 1–1000 |

How it is enforced: request validators read the number at the moment of the
request (`@MaxTextChars` in `apps/api/src/common/app-settings`), characters are
counted the way a person counts them (an emoji is one). The database checks
that used to stop at the old numbers were widened to the "Admin may set"
maximum (migration `20261015220000_text_limits`), so a limit can be raised.

Rate limits that already live in the same editor (not new): posts per day,
comments per hour, messages per minute, likes, follows, searches, reports,
video uploads, stickers, support tickets and messages (`rate_limit.*`), invites
(`invites.*`), upload sizes (`files.*`, `video.*`).

Not in the list (still fixed in code, and bounded): names (50), cities (80),
firm names, planner task titles and notes, DMCA form fields, partner and
payroll notes, admin-only fields. Every request string now has a cap; the last
unbounded ones (tokens, identifiers, dates, cursors) got one in the same change.
