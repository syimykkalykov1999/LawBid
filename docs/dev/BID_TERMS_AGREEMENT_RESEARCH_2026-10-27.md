# Условия оплаты в ставке + договор с подписями (исследование, 2026-10-27)

Статус: только исследование, код не менялся. Не юридическая консультация: перед запуском нужен US-юрист (минимум NY).
Пометки: [ИСТ] = нашёл в источнике при поиске 27.10.2026; [ЗНАНИЕ] = из общих знаний, в этом поиске не перепроверено, проверить по первоисточнику.

---

## РЕЗЮМЕ ДЛЯ ВЛАДЕЛЬЦА (по-русски, простыми словами)

1. **Что хотим.** В ставке адвокат выбирает вид оплаты: фиксированная сумма, процент от выигрыша, почасовая, аванс + ежемесячные платежи, "уточним позже" или смесь. После принятия ставки приложение само собирает PDF-договор, оба рисуют подпись пальцем, PDF уходит обоим и навсегда прикреплён к делу.
2. **Рисованная подпись в США законна.** Федеральный закон ESIGN и закон штатов UETA признают электронную подпись, в том числе нарисованную на экране, если видно: человек хотел подписать, согласился работать электронно, подпись можно привязать к нему, документ сохранён. Суды смотрят в первую очередь на намерение подписать [ИСТ, но источники в основном сайты e-sign-вендоров].
3. **Что делает подпись "доказуемой в суде".** Не картинка, а журнал: время, IP, устройство, согласие "я хочу подписать электронно", хеш (SHA-256) итогового PDF. Всё это мы пишем в базу и в сам PDF (последняя страница "Протокол подписания").
4. **Нью-Йорк особенно строг.** Правило Part 1215: если гонорар ожидается от $3 000, нужно письменное соглашение (письмо-engagement), с описанием услуг, гонорара, порядка выставления счетов и права на арбитраж споров по гонорарам (Part 137). Без него суды отказывали адвокату во взыскании гонорара [ИСТ]. Значит, наш PDF полезен именно адвокатам, но в него надо включить эти пункты.
5. **Процент от выигрыша (contingency)** требует отдельных строгих условий: письменно, подписано клиентом, указан процент, кто платит расходы и до или после вычета процента [ЗНАНИЕ, NY Rule 1.5(c)]. В некоторых делах (уголовные, семейные) процент запрещён. Поэтому "процент" включаем только с этими обязательными полями и предупреждением.
6. **Самое важное для площадки: не брать долю с гонорара адвоката.** Правило 5.4(a): юристам нельзя делиться гонораром с не-юристами. Ассоциация адвокатов Нью-Йорка в 2024 (мнение 1271) признала нарушением, когда онлайн-сервис с торгами брал 7.5% от гонорара [ИСТ]. Сервис, который берёт фиксированную плату за рекламу и не "рекомендует" адвокатов, безопаснее [ИСТ, частично]. Наша схема (оплата вне платформы) тут сильная, но договор не должен упоминать никаких комиссий платформы и не должен говорить, что платформа "рекомендует/проверяет" адвоката.
7. **Платформа не сторона договора.** В PDF: стороны только клиент и адвокат; платформа названа лишь как "технический сервис, на котором стороны нашли друг друга и подписали", без гарантий, не даёт юридических советов, не отвечает за исполнение.
8. **Технически просто и дёшево.** PDF делает библиотека (pdf-lib или pdfkit) в фоне через очередь (BullMQ), подпись это PNG из Flutter-пэда, файл лежит в S3 с блокировкой от удаления/изменения (Object Lock), хеш в базе. Один договор примерно 100-400 КБ, цена хранения копейки. Всё за админ-выключателем, по умолчанию ВЫКЛ.
9. **Что НЕ делаем сейчас:** сертифицированная криптоподпись PAdES (дорого и не обязательна по закону), headless Chrome (тяжело для Fargate).
10. **Главные вопросы вам** внизу (8 штук да/нет). Самые важные: включаем ли "процент" и "почасовую" сразу; нужен ли юрист-ревью шаблона до запуска; хранить договор бессрочно или N лет.

### ДОБАВЛЕНИЕ по уточнению владельца и по коду (важно, меняет план)
- **В коде УЖЕ есть почти всё нужное.** Вкладка дела "Docs" (`SigningTab`) умеет: оба участника подписывают PDF, подпись рисованная или напечатанная, согласие, время, IP, хеш SHA-256, итоговый PDF (оригинал + страница подписей + протокол) сохраняется новым файлом дела; цепочка хешей в журнале дела (`CaseJournal`, хранится 5 лет). Библиотека там `pdf-lib`. Значит НЕ строим вторую систему: наш новый код делает только (а) структурированные условия оплаты в ставке и (б) генерацию текста договора как обычного PDF-файла дела, который затем идёт в уже существующий поток подписания.
- **Платформа не сторона и не свидетель.** В PDF слова только такие: "приложение записало ход обмена"; никаких "заверено", "сертифицировано", "нотариально", "платформа подтверждает". Протокол называем "Запись событий в приложении" (activity record), а не "certificate".
- **Одна карточка "Договор"** в экране дела: сверху краткая сводка (вид оплаты, сумма/"уточняется", статус подписей), ниже сам PDF. Один и тот же документ открывают и клиент, и адвокат. Подходящее место: вкладка "Docs" (там уже подписание); карточку закрепить вверху этой вкладки, плюс виден на Обзоре. PDF хранится как обычный файл дела (модель `File`, назначение `case_attachment`), отдельная модель файлов не нужна.
- **Дословные тексты** всех предложений и контр-предложений с временем уже хранятся в `BidOffer` (append-only, поле `message`, `created_at`); в договор копируем дословно, в снимок (snapshot) кладём копию.

---

# ТЕХНИЧЕСКОЕ ПРИЛОЖЕНИЕ (English)

## 0. Scope and constraints

- LawBid: US marketplace, clients post cases, attorneys bid. In-app payments LOCKED OFF; money moves outside the platform. Platform = venue only.
- Deliver: (a) structured payment terms inside a bid; (b) auto-generated engagement/fee agreement PDF after acceptance, both parties draw signatures in app, PDF e-mailed to both and pinned to the case permanently.
- Everything behind an admin feature switch, default OFF (see section 5).
- Stack assumptions: NestJS API on AWS Fargate, BullMQ (Redis), Postgres, S3, Flutter mobile (+ web). Low load.
- Not legal advice. Items marked [ЗНАНИЕ] must be verified by counsel.

## 1. How others do it

### 1.1 Marketplaces (contract terms)
- **Upwork**: two contract types. Hourly: time logged through the Upwork app, billed weekly, optional weekly hour limit, payment protection for tracked hours. Fixed-price: pay per milestone through escrow, protection only for funded milestones, 14-day client review window (approve / revise / dispute). Switching type depends on whether the contract has already been funded [ИСТ: https://support.upwork.com/hc/en-us/articles/211063418 , https://www.upwork.com/resources/fixed-price-vs-hourly-rate ; accessed 2026-10-27; fee percentages only from third-party blogs, unverified].
- Takeaway for LawBid: because payment is off-platform, we do NOT need escrow/milestone enforcement. We only need a structured, immutable description of what was agreed. Model "milestone/installment" as schedule entries that are informational (no money movement).
- **Fiverr**: packages (Basic/Standard/Premium) with fixed price and delivery time, custom offers with milestones [ЗНАНИЕ, not re-fetched]. Same takeaway.

### 1.2 Legal-practice software
- **Clio Draft**: built-in federally compliant e-signature (US only); signature packages auto-expire after two weeks if unsigned; signed copy filed to matter [ИСТ: https://help.clio.com/hc/en-us/articles/24385283808539 ]. Copy: expiry window for unsigned agreements (e.g. 14 days) and "signed copy attached to the matter".
- Typical fee-letter element list from state bars: type of billing (hourly / flat / contingency / retainer), rate basis, expenses, scope of services [ИСТ: SC Bar form https://www.scbar.org/media/zqybpzrb/new_client_engagement_and_fee_agreement.pdf ; NYSBA https://nysba.org/what-should-your-engagement-agreement-include/ ].
- DocuSign + Clio engagement-letter workflows are common third-party patterns [ИСТ: vendor blogs, low reliability].
- Lawmatics, LawPay: engagement + e-sign + payments in one flow [ЗНАНИЕ]; I found no primary docs in this search. Not needed since payments are off.
- **Avvo / LegalMatch** (lead marketplaces): attorneys pay for leads/ads; no engagement document is generated by the platform [ЗНАНИЕ]. NY Bar Op. 1132 (2017) found Avvo's "marketing fee" per legal service problematic as payment for a recommendation [ИСТ: https://www.abajournal.com/news/article/new_york_ethics_opinion_lawyers_avvo ]. Important: this is exactly why LawBid must keep its own revenue model free of fee percentages and "recommendation" language.

### 1.3 Signature pads in mobile apps
- Standard UX (DocuSign, Adobe Sign, Clio): user reviews the document, ticks "I agree to sign electronically", draws signature (or types), taps Sign; later a signed PDF and a "certificate of completion" are produced.
- Flutter packages: `signature` (6.x) has `toPngBytes()`, exports the drawn area, transparent background by default with optional background [ИСТ: https://pub.dev/packages/signature/changelog ]. `hand_signature` exports PNG/SVG via `control.toImage()`, smoother pressure-based strokes, transparency not confirmed [ИСТ: https://pub.dev/packages/hand_signature ]. `flutter_signature` also has `toPngBytes()`. Recommendation: `signature` (simple, PNG with alpha); evaluate `hand_signature` only if stroke quality is a complaint. Verify package versions and licences at implementation time.

### 1.4 Fields a legal fee agreement needs (union of NY/SC/NYSBA lists)
Parties and contacts; date; scope of representation (and what is excluded); fee type + amount/rate/percentage; what expenses/costs and who pays; retainer/advance and whether refundable; billing frequency and payment due dates; conflicts/communication/termination terms; client right to discharge; fee-dispute arbitration right (NY Part 137); contingency specifics (below); attorney licence state/number (our addition); signatures and dates. Our PDF supplies these from structured data plus the attorney's free text.

## 2. US legal requirements (verify with counsel)

### 2.1 ESIGN / UETA
- ESIGN (federal, 15 U.S.C. 7001 et seq.) and UETA (adopted in nearly all states; NY has its own ESRA, State Technology Law art. 3) give electronic signatures and records the same legal effect as wet ink; a drawn touchscreen signature qualifies when it shows intent to sign. Core elements across sources: intent to sign, consent to do business electronically, attribution to the signer, record retention/reproducibility [ИСТ: vendor white papers, e.g. https://www.esignly.com/electronic-signature/e-sign-act-an-overview-of-electronic-signatures-in-global-and-national-commerce-law.html , https://webiis08.mondaq.com/unitedstates/contracts-and-commercial-law/1671424/white-paper-validity-of-electronic-signatures-in-the-united-states-of-america ; accessed 2026-10-27]. These are secondary and marketing-grade sources; primary text not verified in this session.
- Courts reportedly focus mostly on intent to sign [ИСТ: same white paper, vendor's characterisation, unverified].
- Consumer-consent rule (ESIGN 7001(c)): applies when a law requires information be provided "in writing" to a consumer; NY Part 1215 arguably triggers it. Safe practice: show a short e-consent disclosure (right to paper copy, how to withdraw consent, hardware/software needed, how to get a copy) and record the click [ЗНАНИЕ]. Cheap to do, so do it.
- ESIGN/UETA excluded categories (wills, certain family-law and court documents, etc.) [ЗНАНИЕ]; matter types such as probate/wills/family are where an e-signed engagement might still be fine but check state rules; flag via a counsel review item.

### 2.2 Audit trail (evidence package)
Log per signature event: signer user id, legal name as typed, role, timestamp (UTC, server time), IP, user agent/device id, app version, geolocation NOT required (avoid; privacy), consent checkbox text version + accepted flag, document hash that was displayed (SHA-256 of the unsigned PDF/canonical JSON), signature PNG hash, event sequence (sent, opened, consent given, signed), and the final document hash. Principle from sources: sent/viewed/signed/downloaded events with timestamps and signer details form the audit trail [ИСТ: https://www.esignly.com/electronic-signature/the-definitive-guide-to-esignature-audit-trails-ensuring-legal-defensibility-and-compliance.html ].
- Authenticate signer immediately before signing (re-auth: biometrics / OTP via existing 2FA). This strengthens attribution at near-zero friction.

### 2.3 New York Part 1215 (letter of engagement)
- Effective 2002-03-04. Applies when fee is expected to be $3,000 or more; need a written letter of engagement, or a signed written retainer agreement. Letter must explain services, fees, billing practices, and the right to arbitrate fee disputes under Part 137. Exceptions include fee under $3,000, repeat same-type services previously paid by the client, domestic relations matters under Part 1400 [ИСТ: summaries at https://nysba.org/what-should-your-engagement-agreement-include/ and NY court decisions e.g. https://www.nycourts.gov/REPORTER/3dseries/2004/2004_24495.htm ; the official page nycourts.gov/legal-professional/letters-engagement returned 403 to fetch, so official text NOT read].
- Consequence: courts have denied or reduced fees for non-compliance (e.g. Feder, Goldstein v. Ronan; secondary summary at https://newyorklegalethics.com/?p=1184 ) [ИСТ].
- "To be clarified later" fee type: for NY matters expected >= $3,000, an agreement that leaves fees entirely open is weak against Part 1215. Product answer: allow the type but print a prominent notice that a complete fee agreement must be signed before substantial work (and offer an "amend terms" flow producing version 2 of the agreement).

### 2.4 Contingency fees
- NY Rule 1.5(c): contingent fee must be in a writing signed by the client stating method, percentage(s) (including variations by stage: settlement, trial, appeal), expenses deducted, whether expenses are deducted before or after the percentage, and that client remains liable for expenses; Rule 1.5(d): contingency barred in criminal defense and certain domestic-relations matters [ЗНАНИЕ]. NY also has court rules for personal injury contingency schedules (22 NYCRR 603.7 and 691.20 and parallel in other departments; NY Judiciary Law 474-a for medical malpractice caps) [ИСТ partial: 603.7 mentioned in search; others ЗНАНИЕ].
- ABA Model Rule 1.5(c)-(d) is the template most states follow; state variations exist (caps, closing statements, court approval for minors/wrongful death) [ЗНАНИЕ].
- Product answer: the percentage term requires fields: percent per stage, expense treatment (before/after), who bears expenses if no recovery, plus "not available for criminal/family matters" validation tied to the case category (block selection in those categories). Add a state flag so disclaimers vary by jurisdiction; start with NY + generic "other states".

### 2.5 Fee splitting and platform as venue (what the agreement must NOT say)
- NY Rule 5.4(a): lawyers cannot share legal fees with non-lawyers. NYSBA Op. 1271 (2024-08-20): paying an online bidding service owned by non-lawyers 7.5% of the agreed fee is fee-sharing under 5.4(a), and also an impermissible payment for a recommendation under 7.2(a); collecting from the client first does not avoid it [ИСТ: https://nysba.org/ethics-opinion-1271-sharing-of-legal-fees-with-non-lawyer/ , PDF https://nysba.org/app/uploads/2024/08/Opn-1271-with-letterhead.pdf ]. The service was said to be fine on 7.2 if matching were mechanical and non-discretionary [ИСТ].
- NYSBA Op. 1294 (2026-03-11) on lead generators exists and references the 1271 caution about recommendation language [ИСТ via ezel.ai https://ezel.ai/ethics-opinions/nysba/1294-solicitation-advertisement-lead-generators ; full text not read, read it].
- Other states: Tennessee Formal Op. 2018-F-165 (marketplace where clients post projects and lawyers quote): lawyer's payment may not depend on number of contacts/hires (7.2(c)) or fees generated (5.4) [ИСТ: https://ezel.ai/ethics-opinions/tnbpr/2018-f-165-legal-services-marketplace-website ]. D.C. Op. 342 (2007) flat access fee OK, share of fees not OK [ИСТ].
- ABA 2012 comment [5] to Model Rule 7.2: payment to a lead generator OK only if it does not recommend the lawyer and is consistent with 5.4 [ИСТ]. I found no 2025 ABA formal opinion in this search.
- **Implications for the agreement text and product (checklist):**
  1. Agreement MUST NOT mention any platform fee, commission, subscription, success fee, or any payment to/from the platform tied to the legal fee. No clause "Platform receives X% of fee".
  2. Agreement MUST NOT say the platform "recommends", "vets", "endorses", "verifies the quality of" or "selects" the attorney. Say only that the parties found each other through a software service operated by [Company], which does not provide legal services.
  3. Platform is not a party, not a guarantor, not a payment agent; no money passes through it; disputes are between client and attorney. Bar-style disclaimer: platform does not control the attorney's professional judgement (5.4(c)/(d) spirit).
  4. Platform may not edit the substance of the attorney's terms (only render them); keep the attorney's text verbatim, to avoid the platform "practising law" or influencing judgement.
  5. Revenue model for the platform (outside this doc) should stay flat/advertising/subscription, not percentage of fee, not varying with fee size. Counsel to confirm for NY and the top states.
  6. Do not show platform logo as "approved by"; the top-left logo is acceptable as document branding if the footer says "Generated by [LawBid] software; LawBid is not a party and does not provide legal services." Counsel to approve the logo placement (a prominent platform logo on a fee agreement could be read as endorsement; consider small logo plus disclaimer).
  7. Avoid platform-set fee ranges or "recommended price" in the bid UI: mechanical, non-discretionary display only.
- Unauthorized practice of law (UPL) risk: auto-generated documents from structured user input generally OK if the platform doesn't tailor legal advice; keep template neutral and attorney-supplied [ЗНАНИЕ].

### 2.6 State variation (summary)
NY (Part 1215, 1.5, 603.7); CA (Bus. & Prof. Code 6147/6148: written fee agreement for contingency and for non-contingency over $1,000, with specific required statements) [ЗНАНИЕ]; NJ (R.1:21-7 contingency caps), FL (Rule 4-1.5 contingency schedule and signed statement), TX (written contingency required by Rule 1.04(d)) [ЗНАНИЕ, all to verify]. Plan: generic baseline template + per-state "addendum block" table (state, case-category rule, required clauses) maintained by counsel, not hard-coded in app logic. Start with NY + a catch-all.

## 3. Technical options

### 3.1 PDF generation
| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **pdfkit** | Authoring from scratch, streams, native PNG/JPEG (alpha), custom TTF via fontkit, flow text layout (wrapping, page breaks) | Imperative layout, manual page-break math for tables | **Recommended** for a text-heavy agreement |
| **pdf-lib** | Edit/fill existing PDFs, embed PNG/JPG, pure JS, easy to append a page to an existing PDF | Needs `@pdf-lib/fontkit` for custom fonts (registerFontkit), no automatic text flow (manual line wrap) | Good for stamping signatures onto a pre-rendered template; weaker for long free text |
| Headless Chromium (puppeteer) | HTML/CSS layout | ~300+ MB image, high RAM per render, slow cold start on Fargate | **Avoid** |
Source for pdf-lib vs pdfkit positioning: https://npm-compare.com/pdf-lib,pdfkit , https://documenso.com/blog/introducing-libpdf-the-pdf-library-typescript-deserves (secondary/machine-generated pages, verify by spike). No source I found tested Cyrillic specifically; do a 1-day spike with both [ИСТ gap].
- Suggested flow (two-stage, keeps the document frozen before signing):
  1. On acceptance, render **agreement.v1 unsigned PDF** from a canonical JSON snapshot (case summary, bid text, terms, history); compute `unsigned_sha256`.
  2. Each party signs against that hash. After both sign, render the **final PDF**: same content + signature PNGs + signing certificate/audit page; compute `final_sha256`.
  Do not regenerate the body between the stages; render deterministically from the stored snapshot JSON (store snapshot in DB/S3 too) so the evidence is reproducible.
- Library choice for the final step: pdfkit single-pass rendering (body + signatures + audit page) is simplest; since the body is deterministic from the snapshot there is no need to edit PDFs. Keep pdf-lib as fallback.

### 3.2 Fonts (Latin + Cyrillic)
- Embed (subset) a TTF with Latin+Cyrillic coverage, e.g. Noto Sans or Roboto/PT Sans (SIL OFL / Apache licences; verify on embedding) - the product is US so Latin first, Cyrillic needed because users may write bids/summaries in Russian. Include Regular + Bold (+ Italic optional). Bundle in the Docker image (~500 KB each). Standard 14 PDF fonts do not cover Cyrillic. Also embed in PDF/A mode if aiming for archival (pdfkit supports PDF/A subset flags; verify) so the document renders identically in 20 years.
- For other scripts (CJK, Arabic) users could paste: fall back to Noto fallback or reject with a clear message; decide later.

### 3.3 Signature capture
- Flutter: `signature` package pad -> `toPngBytes()` (transparent PNG, cropped to strokes) -> upload as multipart/base64 to API with the consent flag. Limit size (e.g. <= 200 KB, max 1200x600 px), validate PNG magic bytes, re-encode server-side (sharp) to strip metadata. Also store a vector stroke array (points + timestamps) as JSON for forensic value: optional, small (few KB); it helps rebut "pasted image" claims [ЗНАНИЕ practice, used by DocuSign-like biometrics options].
- Also require typed full legal name next to the drawn signature (printed in PDF under it).
- Web version: same package concept via canvas (e.g. `signature_pad` JS) - same endpoint.

### 3.4 Hashing and sealing
- Minimum viable: SHA-256 of the final PDF stored in DB (`agreements.final_sha256`) plus in append-only `signature_events`. Optional: hash chain (each event stores hash of previous event) for tamper evidence.
- Optional stronger seal: PAdES / PDF digital signature with an AWS KMS-held key (platform "seal" certificate, not a signer). Costs: KMS key ~$1/month + $0.03/10k requests (verify current), certificate from a trusted CA (AATL) for Adobe green check is the real cost (hundreds of USD/year, verify). Not legally required under ESIGN/UETA; defer to phase 2. Alternatives: RFC 3161 timestamp from a free/paid TSA; or anchor the daily hash root into a second place (e.g. S3 Object Lock manifest) - cheap and enough.
- The audit page inside the PDF prints: document id, SHA-256 of unsigned content, signer names/roles/timestamps/IPs, consent text version. State clearly that the hash of the final file is stored by the platform (a file cannot contain its own hash).

### 3.5 Storage / immutability
- S3 bucket with **Object Lock enabled at creation** (cannot be enabled on existing buckets; versioning is turned on automatically and cannot be disabled) [ИСТ: https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html ]. Compliance mode: no one, including root, can delete or shorten retention; governance mode: users with `s3:BypassGovernanceRetention` can. Recommendation: start in **governance** mode, default retention e.g. 7 years (owner decision), move to compliance mode after counsel confirms retention period (it is irreversible and also blocks deletion for GDPR/CCPA-style erasure requests; legal hold alternative: `PutObjectLegalHold` for disputes).
- Pricing not retrieved in this session; PDF ~100-400 KB, 1M agreements = ~0.1-0.4 TB, a few $/month in S3 Standard-IA/Glacier IR [rough; verify with AWS calculator]. Lifecycle: Standard -> Glacier Instant Retrieval after 90 days.
- Separate bucket (e.g. `lawbid-agreements`), SSE-KMS, block public access, access only via presigned GET URLs (5-minute expiry) issued after authorisation check (party to the case or admin). Do not reuse the existing media bucket.
- "Pinned inside the case forever": store the S3 key in `agreements`; case timeline shows an "Agreement (signed)" card. Account deletion: keep agreement under legitimate-interest/legal-claims basis; counsel to confirm privacy-policy wording.

### 3.6 Generation job (BullMQ)
- Queue `agreement-render`: jobs `render-unsigned(agreementId)` and `render-final(agreementId)`; idempotent via jobId = `${agreementId}:${stage}`; attempts 5, exponential backoff; concurrency 1-2 per task (CPU-light, memory ~100-200 MB with pdfkit).
- Steps: load snapshot JSON -> render -> hash -> `PutObject` with `ObjectLockMode` + `ObjectLockRetainUntilDate` and `ChecksumSHA256` header -> update row in a transaction -> enqueue e-mail jobs (existing mail provider) -> push notification + case timeline event.
- Request path: HTTP handler only validates, stores the signature event + PNG, and enqueues. UI shows "Generating..." state via existing realtime/polling.
- Size budget: unsigned ~50-150 KB (fonts subset), final +2 PNGs (<=100 KB each after re-encode) + audit page => typically < 400 KB; hard cap 2 MB; reject bid/text longer than limits (e.g. offer text 5,000 chars, case summary 3,000 chars) to bound page count (<= 8 pages).
- E-mail attachments: send the final PDF as attachment (small) plus a link; also available in-app.

## 4. Data model sketch

### 4.1 Bid payment terms JSON (stored in `bids.payment_terms` JSONB, validated by zod/JSON Schema server-side)
```json
{
  "version": 1,
  "currency": "USD",
  "type": "flat | percentage | hourly | retainer_installments | tbd | mixed",
  "flat":        { "amount_cents": 250000 },
  "percentage":  {
    "stages": [ { "stage": "pre_suit|settlement|trial|appeal", "percent_bp": 3333 } ],
    "expenses": { "treatment": "deducted_before|deducted_after", "client_liable_if_no_recovery": true }
  },
  "hourly":      { "rate_cents": 35000, "estimate_hours_min": 10, "estimate_hours_max": 20, "cap_cents": null, "billing_increment_min": 6 },
  "retainer":    { "advance_cents": 300000, "refundable": true, "held_in_trust": true },
  "installments":[ { "due": "2026-11-15", "amount_cents": 50000, "label": "Month 1" },
                   { "recurrence": "monthly", "count": 10, "amount_cents": 50000, "start": "2026-12-15" } ],
  "tbd":         { "reason": "Scope to be defined after document review", "deadline_days": 14 },
  "expenses_note": "Court fees and filing costs paid by client at cost.",
  "notes": "Free text up to 1,000 chars"
}
```
Rules: `type` selects which sub-objects are required; `mixed` = any combination of the sub-objects present (e.g. retainer + hourly, or flat + percentage bonus). Amounts as integer cents, percentages as basis points (3333 = 33.33%). All percentages 0 < p <= 10000; sums of installments must equal the stated total if a total is given. Contingency stage list required when `percentage` is used. Case-category guard (criminal / domestic relations) blocks `percentage`. Store `computed_total_cents` (nullable) for the "amount" shown in summaries; null => print "To be clarified".
Counter-offers: reuse the same schema; each counter-offer is a new `bid_term_versions` row (see below) so the agreement history can list every version.

### 4.2 Tables (Postgres)
- `bid_term_versions(id, bid_id, version_no, author_user_id, author_role, terms jsonb, message text, created_at)`: append-only history of offers/counter-offers.
- `agreements(id, case_id, bid_id, term_version_id, status enum[draft_rendering|awaiting_signatures|partially_signed|fully_signed|expired|voided|superseded], template_version, snapshot jsonb, snapshot_sha256, unsigned_pdf_key, unsigned_sha256, final_pdf_key, final_sha256, client_user_id, attorney_user_id, client_signed_at, attorney_signed_at, expires_at, object_lock_until, supersedes_agreement_id, created_at)`. Unique(`bid_id`, `version`) and one active agreement per bid.
- `agreement_signatures(id, agreement_id, signer_user_id, role enum[client|attorney], typed_name, signature_png_key, signature_png_sha256, strokes jsonb null, signed_at, ip inet, user_agent, device_id, app_version, consent_text_version, consent_accepted bool, reauth_method, signed_doc_sha256)`.
- `agreement_events(id, agreement_id, seq, type enum[created|rendered|sent|opened|consent_given|signed|declined|expired|voided|final_rendered|emailed|downloaded], actor_user_id, payload jsonb, ip, user_agent, created_at, prev_hash, event_hash)`. Append-only (revoke UPDATE/DELETE for the app role; hash chain for tamper evidence).
- `feature flags`: `admin_settings` key `agreements.enabled` (default false), `bid_terms.advanced_enabled` (default false: when off, bids keep the current single-amount field), `agreements.require_for_accept` (default false), `agreements.retention_years`, `agreements.lock_mode` (governance|compliance). Admin toggles audited. When OFF: no UI, endpoints return 404, queue consumer idle.
- Amendments: a change of terms after signing creates a new agreement version (`supersedes_agreement_id`); never edit signed documents.
- State machine: accept bid -> `draft_rendering` -> `awaiting_signatures` (both can sign in any order; second signature triggers final render) -> `fully_signed`. Expire unsigned after 14 days (Clio uses 2 weeks) -> `expired`, parties notified, bid acceptance rolls back or stays per owner decision. Declined signature -> `voided` + event.

### 4.3 API sketch
`POST /bids/:id/terms` (version), `POST /bids/:id/accept` (creates agreement), `GET /agreements/:id` (status + presigned URL when allowed), `POST /agreements/:id/consent`, `POST /agreements/:id/sign` (typed name + PNG + consent flag + re-auth proof), `POST /agreements/:id/decline`. Rate-limit and idempotency key on `sign`.

## 5. Agreement template structure (content)
1. Header: logo (small, top-left), title "Agreement between Client and Attorney", agreement id, date, version.
2. Parties: client name/contact; attorney name, firm, bar state + number (from profile).
3. Case summary: category, what the client posted (verbatim excerpt, truncated with "full text on file"), amount or "To be clarified".
4. Attorney's offer: verbatim text; scope; **Payment terms** rendered from JSON as a human-readable block (type-specific wording; contingency block with all 1.5(c) fields; hourly rate/estimate; retainer and installments table; "to be clarified" notice).
5. Negotiation history: table of offers/counter-offers/acceptance with timestamps.
6. Standard clauses (counsel-drafted): scope limits, communication, client's right to discharge, expenses, fee-dispute arbitration notice (NY Part 137 block when NY), no guarantee of outcome, governing law, electronic signature consent, entire agreement.
7. Platform notice: "LawBid is a software venue. It is not a party to this agreement, does not provide legal services or advice, does not recommend or evaluate attorneys, does not receive any portion of fees, and does not process payments between the parties." (counsel to approve wording; must not contradict revenue model).
8. Signature block x2: drawn PNG, typed name, date/time.
9. Signing certificate page: events, IPs, hashes, consent text version.
Language: English legal text; free-text parts as typed by users.

## 8. Owner clarifications and what the repo already has (checked 2026-10-27)

### 8.1 Repo findings (apps/api, apps/mobile)
- `Bid` already has `fee_type` enum {fixed, hourly, free_consultation, contingency}, `amount_cents`, `percent_bps` (contingency; amount 0), `message` (<= 2000 chars), `round_count`, `turn`. `BidOffer` is the append-only negotiation history: `round_no`, `from_role`, `fee_type`, `amount_cents`, `percent_bps`, `message`, `status`, `created_at`. This already captures raw offer/counter-offer text with timestamps (requirement 3). New payment-terms JSON should extend these (add `payment_terms jsonb` nullable on `Bid` and `BidOffer`; old columns stay as the "headline" amount so existing UI and filters keep working). Needed new fee types: retainer_installments, tbd, mixed (enum additions, behind switch).
- Signing already exists: `CaseSignRequest` (case_id, title, source_file_id, source_sha256, status, final_file_id, final_sha256, declined_by, completed_at) + `CaseSignature` (signer role, signed_name, method drawn|typed, image_png bytes, doc_sha256, ip, user_agent, signed_at). Service `apps/api/src/modules/cases/tools/case-signing.service.ts` (PNG max 150 KB, pdf-lib, `renderSignaturePages`, `verify` recomputes hashes and journal chain). Mobile: `apps/mobile/lib/features/cases/tools/signing_tab.dart` (tab "Docs": e-signature requests + template documents), `signing_sheets.dart`.
- `CaseJournal`: append-only, hash-chained per case, retain_until = +5 years. Use it for agreement events (offer made, countered, accepted, agreement generated, signed) instead of a new events table.
- `File` model has `sha256`, `s3_key`, `FilePurpose.case_attachment` (case documents, private bucket). The PDF fits as an ordinary case file; no new file model.
- Case workspace tabs (`workspace_view.dart`): Overview (phone only), Files, Tasks, Updates, Activity, Time, Docs. Best fit for the single "Contract" card: top of **Docs** tab (signing is there), with a compact copy of the card on Overview. The same `CaseSignRequest`/file id is opened by both parties, so it is literally one document.
- Gaps vs this research: signature stored as bytes in DB (fine at this scale; cap 150 KB), no S3 Object Lock on case files, no consent-text version column, no e-sign consent disclosure text (add), no typed-name-plus-drawn requirement (method is drawn OR typed). Not hard blockers.

### 8.2 Revised implementation plan (smaller than sections 3-4 suggest)
1. Payment terms: `payment_terms jsonb` on `Bid` and `BidOffer` (schema in 4.1), zod validation, behind `bid_terms.advanced_enabled` (default OFF).
2. On accept (flag `agreements.enabled` OFF by default): BullMQ job renders the agreement PDF with the existing pdfkit helper `apps/api/src/modules/cases/tools/pdf-common.ts` (`startPdf`, embeds Inter-Variable.ttf; pdf-lib is used by `signing.pdf.ts` to merge signature pages; verify Inter covers Cyrillic) from a snapshot JSON, saves it as a `File` (case_attachment), creates a `CaseSignRequest` with `source_sha256`. Parties sign with the existing sheet. Final PDF = existing `final_file_id`.
3. New table only for the agreement metadata: `case_agreements(id, case_id, bid_id, offer_round_no, sign_request_id, snapshot jsonb, snapshot_sha256, template_version, status, created_at)`; status mirrors the sign request. The "tables" in 4.2 (`agreement_signatures`, `agreement_events`) are NOT needed: use `case_signatures` and `CaseJournal`.
4. Optional later: S3 Object Lock bucket for final agreements (3.5), consent text version, require drawn signature.

### 8.3 Wording rules from the owner (platform = recorder, not party, not witness)
- Document header/footer and protocol page use: "Record of exchange in the LawBid app. LawBid is not a party to this agreement and is not a witness. It has only recorded the messages, offers, counter-offers, acceptance and signatures below as they occurred in the app, with the times shown. LawBid does not certify, notarize, verify or guarantee them or the identity, licence or conduct of either party."
- Forbidden words in all generated text: certify/certified, notarized, attested, verified (about parties), endorsed, recommended, guaranteed, "official", "witness".
- Negotiation history table prints verbatim: round, who, timestamp (UTC and US Eastern for readability), fee terms, original message text unaltered (no translation, no truncation; if over page limits, continue on extra pages; cap already 2000 chars/offer). Snapshot stores the same text plus its SHA-256, so later edits to the app UI cannot change it.
- Honest limit: because the platform records and does not certify, evidentiary weight in court rests on authentication by the parties (testimony, device/IP logs, hash chain). Counsel should confirm this "recorder" framing is the right trade vs ESIGN attribution needs (it is: attribution is shown by log data, not by a platform claim).

## 6. Risks and open questions (yes/no for the owner)

Risks: (a) fee-sharing/UPL perception if wording or revenue model slips; (b) NY Part 1215 and contingency rules make "to be clarified later" and percentage terms legally sensitive; (c) immutability vs privacy deletion requests; (d) PDF is only as strong as the audit trail; (e) auto-generated legal text may be treated as practising law if the platform fills legal blanks; (f) Cyrillic/other fonts and very long texts; (g) abandoned unsigned agreements.

Open questions:
1. Should we pay a US attorney (NY first) to review the template, platform-notice wording and revenue model before the switch is ever turned on? (recommended: yes)
2. Is the platform's own revenue guaranteed to be flat/advertising/subscription, never a percentage of attorney fees? (needed for the 5.4 position)
3. Launch with all fee types, or first flat + hourly + retainer, and add "percentage" only after counsel sign-off? (recommended: second)
4. Should the platform logo appear top-left as you asked, in small size with the "not a party / not an endorsement" disclaimer in the footer?
5. Must the agreement be signed before the case continues (accept gets blocked until both sign), or is it optional/recommended? (default: optional)
6. Unsigned agreement expires after 14 days: OK?
7. Retention: keep forever with 7-year Object Lock (governance mode first), then decide compliance mode: OK?
8. Phase 2 certified PAdES seal (extra cost, not legally required): skip for now?
9. (new) Reuse the existing in-app "Docs" signing flow for the agreement (one "Contract" card at the top of the Docs tab, same file opened by both), instead of building a separate one? (recommended: yes)
10. (new) Is it OK that the PDF never says "certified/verified/witnessed" and only says LawBid recorded what happened in the app, even though this gives it less weight than a notarized document?
11. (new) Keep the current simple bid fee types as the default and show the richer terms only when the admin switch is ON?

## 7. Sources (accessed 2026-10-27)
- https://nysba.org/ethics-opinion-1271-sharing-of-legal-fees-with-non-lawyer/ (Op. 1271, 2024-08-20)
- https://nysba.org/app/uploads/2024/08/Opn-1271-with-letterhead.pdf
- https://ezel.ai/ethics-opinions/nysba/1294-solicitation-advertisement-lead-generators (Op. 1294, 2026-03-11, secondary)
- https://www.abajournal.com/news/article/new_york_ethics_opinion_lawyers_avvo (Avvo, Op. 1132, 2017)
- https://ezel.ai/ethics-opinions/tnbpr/2018-f-165-legal-services-marketplace-website (Tenn. 2018-F-165)
- https://nysba.org/what-should-your-engagement-agreement-include/ ; https://newyorklegalethics.com/?p=1184 ; https://www.nycourts.gov/REPORTER/3dseries/2004/2004_24495.htm (Part 1215)
- https://www.esignly.com/electronic-signature/the-definitive-guide-to-esignature-audit-trails-ensuring-legal-defensibility-and-compliance.html ; https://webiis08.mondaq.com/unitedstates/contracts-and-commercial-law/1671424/white-paper-validity-of-electronic-signatures-in-the-united-states-of-america (e-sign, vendor/secondary)
- https://help.clio.com/hc/en-us/articles/24385283808539 (Clio Draft e-sign)
- https://support.upwork.com/hc/en-us/articles/211063418 ; https://www.upwork.com/resources/fixed-price-vs-hourly-rate (Upwork)
- https://pub.dev/packages/signature/changelog ; https://pub.dev/packages/hand_signature (Flutter pads)
- https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html (S3 Object Lock)
- https://npm-compare.com/pdf-lib,pdfkit (secondary)

Gaps to close before build: read official Part 1215 and Rule 1.5 text; read NYSBA 1294 in full; 1-day pdfkit vs pdf-lib spike with Cyrillic and PNG alpha; confirm S3 and KMS prices; counsel review.
