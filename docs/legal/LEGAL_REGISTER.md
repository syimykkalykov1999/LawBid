# LawBid Legal Register

Prepared 2026-10-25 by an AI research assistant. **This is not legal advice and I am not a lawyer.** It is a map of the laws that touch a platform like LawBid, checked against the code in this repo, with gaps and fixes. A New York / Illinois licensed attorney must confirm every item marked "LAWYER".

---

## Краткое резюме по-русски (для владельца)

**Что это.** Реестр законов, которые касаются LawBid, что с нами по коду, где дыры и что чинить. Я не юрист. Всё, что помечено LAWYER, должен подтвердить настоящий адвокат (NY или IL).

**Главное по этике адвокатов (самый опасный блок, потому что нас будут проверять именно так):**
1. Нью-Йоркская коллегия (NYSBA) в 2024 и 2026 годах прямо разобрала платформы «ставки адвокатов» и «лид-генераторы». Правило простое: **платить за доступ к клиенту можно (подписка, пакет ставок, «кредиты за контакт»), если платформа не «рекомендует» адвоката, отбирает по нейтральным и раскрытым правилам и плата не зависит от того, наняли адвоката или нет, и не от суммы гонорара.** Процент с гонорара = запрещён (Opinion 1271, август 2024). Слова «проверенный, лучший, рекомендуем, топ» от имени платформы = «рекомендация» = опасно (Opinions 1132, 1213, 1271).
2. Наша модель в основном проходит: плата за подписку плоская, комиссия 0, клиент сам выбирает. **Обязательно держать комиссию 0% или плоской, не процент.** Если когда-нибудь возьмём процент с гонорара, это прямое нарушение правила 5.4 для адвоката.
3. Опасные места в тексте и интерфейсе (не меняю UI, только перечисляю): слово «verified» у адвоката, любые «Top/Best/Recommended», ранжирование «по качеству», платный «boost» без пометки «Реклама / Attorney Advertising». Лучше формулировка: «Лицензия сверена с реестром штата на дату X. LawBid не рекомендует адвокатов».
4. «Лучший ответ» в юридических вопросах: **у нас его выбирает автор вопроса (код legal-qa.service.ts markBest), а не платформа. Это хорошо, это не рекомендация платформы.** Надо подписать «выбрано автором вопроса, не мнение LawBid, не юридический совет».
5. Чаты: у нас тела сообщений лежат на сервере в открытом виде (поле body_original «Server/moderation/legal only»). Админ технически может читать. Для привилегии адвокат-клиент это риск (клиенту надо честно сказать, кто и когда может читать; доступ только по необходимости и с журналом). Нужно проверить, что каждое чтение админом пишется в audit log.

**Топ-10 рисков (по убыванию):**
1. Слова «verified / top / best / recommended» и платный boost без пометки рекламы: адвокаты нарушают правила 7.1/7.2, мы получаем жалобы коллегии и иски. LAWYER.
2. Любой процент от гонорара (если когда-то включим): прямое нарушение 5.4. Держать 0%.
3. Отзывы (FTC 16 CFR 465): штраф до ~$53 тыс. за каждое нарушение (цифра FTC 2026, проверить); нельзя платить/давать награды за отзывы, нельзя прятать негативные по тональности, нельзя запрещать отзывы в условиях (Consumer Review Fairness Act).
4. Автопродление подписок (NY GBL 527-a, California ARL, ROSCA): иски клиентов и генпрокурора; в Калифорнии иски идут пачками. Нужны явное согласие, письмо-подтверждение, отмена тем же способом, напоминание.
5. Чат/привилегия: админ читает чаты, нет явного раскрытия и журнала; перевод идёт через Google (третья сторона). Нужна политика доступа и текст в Privacy/Attorney Terms. LAWYER.
6. SDK-трекеры (Firebase, Sentry) и калифорнийский CIPA/wiretap иски: $5,000 за нарушение в исках; нужен cookie/SDK-баннер и честное описание.
7. Нет возрастного барьера в коде (только строка «18+» в Terms). COPPA-риск при случайной регистрации ребёнка: штраф FTC до ~$53 тыс. на каждый случай. Добавить галочку 18+ и удаление при обнаружении.
8. DMCA: нет зарегистрированного agent в Copyright Office (в тексте заглушка). Без регистрации теряем защиту «safe harbor» (17 USC 512(c)(2)). Регистрация стоит $6, делается за 10 минут.
9. Take It Down Act (с 19 мая 2026 FTC уже проверяет): нужен канал «убрать интимные фото без согласия» и срок удаления 48 часов. REPORT Act: сообщать о CSAM в NCMEC. Проверить, что у нас есть процесс.
10. Проект «шаблоны документов» и любые AI-ответы: риск «неразрешённой юридической практики» (Judiciary Law 478/484/495). Только общая информация, без индивидуальных советов от платформы. LAWYER.

Отдельно: SMS (Twilio) только коды входа, это не маркетинг, риск TCPA низкий, пока не шлём рекламу. Платежи через Stripe Connect: мы не держим деньги клиентов, значит лицензия money transmitter не нужна (LAWYER подтвердить), но «Stars» и все балансы надо проверить, чтобы не было вывода денег. Если Stars (подарки) превращаются в деньги, это уже другой режим.

---

## How to read this register

- **Source status**: `FETCHED` = I read the text in this session (2026-10-25) from the URL shown; `SEARCH` = confirmed via search summaries of primary or law-firm sources, not the official text; `KNOWLEDGE` = from my training (cutoff mid-2026), **not re-verified now, must be checked**. The NY Rules PDF at nycourts.gov returned HTTP 403 to my fetch, so NY rule text below is `KNOWLEDGE` unless a NYSBA opinion quoting it is cited.
- **Date accessed** for every URL: 2026-10-25.
- **Risk**: H / M / L. **Money exposure** is a realistic order of magnitude, not a prediction.
- **LAWYER** = a real lawyer must confirm before relying on it.

## 0. What LawBid is (facts from the code)

| Fact | Evidence |
|---|---|
| Operator text: SiMA LLC, Illinois LLC dba LawBid; governing law Illinois, AAA consumer arbitration, class waiver, 30-day opt-out | `apps/api/assets/legal/terms.en.md` s.20-21 |
| 13 legal doc types, versioned drafts/published, 10 locales (en, ru, es, fr, de, it, pt, nl, pl, uk), acceptance tracking | `apps/api/src/modules/legal-documents/legal-documents.constants.ts`, `legal-acceptance.*` |
| Short legal texts (case form, unverified attorney, support, partner disclosure) + DMCA agent + incident contact + strikes threshold are admin-editable in `app_config` key `legal.settings`, **only en and ru** | `modules/legal/legal.settings.ts` |
| DMCA agent is a placeholder until registered | `assets/legal/dmca_policy.en.md` line 9; `legal.settings.ts` |
| Client posts matter; attorneys bid; client picks; chat/call/video; assistants send "on attorney's behalf" | `modules/cases`, `bids`, `chat`, `calls`, `assistants` |
| Public legal Q&A; **the asker** marks the best answer (`markBest`, `q.author_id !== user.sub` is forbidden) | `modules/legal-qa/legal-qa.service.ts` ~line 415 |
| Chat message bodies stored plaintext: `body_original` "Server/moderation/legal only" | `apps/api/prisma/schema.prisma` model Message |
| Call/video via Cloudflare SFU / LiveKit; **no call recording code found** in `modules/calls`, `consultations` (API side; mobile not checked) | grep "recording/egress" returned nothing |
| Translation via Google Cloud Translation API (message text leaves our servers) | `modules/translation/translation.service.ts` line 76, 186 |
| Stripe Connect client to attorney payments; `application_fee_amount` supported but owner uses 0 | `modules/case-payments`, `billing/stripe-payment.provider.ts` line 1033 |
| Stars = gifts (`Gift`, `GiftSend`), purchased via one-time pay page; no payout code found | `modules/stars` |
| Paid boosts (`promotions`), bid-packs, subscriptions (attorney, assistant seat, client) | `modules/promotions`, `bid-packs`, `plans`, `subscriptions` |
| SMS: login OTP only (Twilio) | `modules/auth/auth.service.ts` ~1120-1165; `config/env.schema.ts` |
| Outreach module imports NY attorney registry leads | `modules/outreach/ny-registry.source.ts` |
| Partner/referral program with rewards, W-9 | `assets/legal/partner_terms.en.md`, `modules/partners`, `referrals`, `rewards` |
| Data export, account deletion, anonymization, legal-lookup + legal-export for government requests, retention 90 days | `modules/privacy`, `admin-data-requests` |
| Admin actions use `AuditLogService.record` (users); **chat-read audit not confirmed** | `modules/admin-users/admin-users.service.ts`; no admin chat module found by grep |
| No date-of-birth / age-gate fields found | grep of auth, users, schema |
| No OFAC screening code found (`admin-sanctions` = account bans, not OFAC) | `modules/admin-sanctions` |
| Mobile SDKs: firebase_core/messaging/app_check, sentry_flutter | `apps/mobile/pubspec.yaml` |
| Trust levels / "verified" wording, partner rules say "never say an attorney is verified" | `terms.en.md` s.3; `partner_terms.en.md` item 4 |

---

## PART A. Lawyer ethics as applied to the platform

Key principle: **these rules bind the attorneys, not LawBid**, but a platform that causes attorneys to break them loses attorneys, gets bar complaints, and can face UPL / aiding-violation theories (NY Rule 8.4(a) "knowingly assist or induce another"). Our Attorney Agreement s.3 already says "no fee splitting", "your profile is your advertising". That is the right frame.

### A1. ABA Model Rules (baseline)

| Rule | Requirement | Where we stand | Gap / fix | Risk |
|---|---|---|---|---|
| 1.6 confidentiality (and 1.6(c) reasonable efforts) | Lawyer must make reasonable efforts to prevent unauthorized access to client info; using a third-party platform is fine if reasonable (ABA Formal Op. 477R secure comms, 498 virtual practice, KNOWLEDGE) | Chat stored plaintext, admin technically can read, translation via Google, moderation scans | Document who can read and when; log reads; contract with processors; offer "do not translate/AI" per chat; tell attorneys honestly (Attorney Terms s.4 draft) | M-H, LAWYER |
| 1.18 prospective clients | A person who consults about retaining a lawyer gets duties of confidentiality; NYSBA 1294 (Mar 2026) warns lawyers about conflicts when users reveal significant info before a conflict check | Case posts and bids reveal facts before conflict check; `bids/conflict` folder exists | Case form text (admin-editable `caseCreate`) must warn "do not post confidential details; attorney has not agreed to represent you"; attorneys' bid UI should let them decline on conflict. Fix text only | M |
| 5.3 supervision of nonlawyers | Lawyer must supervise assistants | Assistant seats let non-lawyer assistants send messages "on behalf" | Attorney Terms must say the attorney is responsible for assistants and must not let them give legal advice; LawBid labels assistant messages (check UI shows "sent by assistant", `Message` has an assistant flag per OQ-048) | M |
| 5.4(a) fee sharing; (d) nonlawyer owning/directing | Lawyer may not share legal fees with a nonlawyer; nonlawyer may not direct professional judgment | Flat subscriptions; Stripe Connect fee = 0. Op. 1271 (Aug 2024) held that a bidding platform keeping a % of fee violates 5.4(a) | **Never** set `application_fee_amount` as a percent of a legal fee. Add a hard guard + admin warning (TODO P-ETH-3). Flat per-seat fees fine | H if % used, else L, LAWYER |
| 5.5 UPL | Lawyer may not assist UPL; nonlawyer may not practice law | See A4: document templates, AI, Q&A | LawBid texts "not a law firm, no advice" exist; need review of templates/AI | M-H, LAWYER |
| 7.1 communications | No false or misleading communication about lawyer or services | Profiles, bids, reviews, badges are lawyer advertising | See A3 | M |
| 7.2 payment for recommendations | Lawyer may not pay anyone to recommend or obtain employment, except reasonable cost of advertising and certain referral services | Subscriptions, bid-packs, boosts are payments to LawBid | See A2 | M-H |
| 7.3 solicitation | No live person-to-person solicitation of prospective clients | Attorney bids on client-posted cases are responses to a client-initiated request (not solicitation, NYSBA 1049 (2015), 899 (2011), 1294 (2026)) | Attorney must not message clients who did not post a case or ask (check follow-up / chat-initiation rules: can an attorney open a chat with any client?). Fix in code review (P-ETH-4) | M |

URLs: ABA Model Rules index https://www.americanbar.org/groups/professional_responsibility/publications/model_rules_of_professional_conduct/ (KNOWLEDGE; not fetched).

### A2. NYSBA opinions on matching, bidding and lead platforms (the core analysis)

All SEARCH-confirmed; 1294 and 1271 summaries FETCHED from nysba.org.

| Opinion | Date | Holding relevant to us |
|---|---|---|
| NYSBA 1131 | 2017 | Marketing fees to an online matching service do not violate 7.2(a) if matching is by **mechanical, non-discretionary factors** |
| NYSBA 1132 (Avvo) | 2017 | Avvo's ratings and descriptions amounted to **recommendation**, so fees were a prohibited payment for recommendation |
| NYSBA 1213 | Jan 2021 | A service that **vouches** for the lawyer's credentials/competence and recommends the "best lawyer" cannot be paid by the lawyer (7.2(a); also 5.4(a) questions) |
| NYSBA 1271 | Aug 20, 2024 | Bidding platform owned by nonlawyers that keeps part of the fee violates **5.4(a)**; its vetting claims = recommendation, so paying to join violates **7.2(a)**; "the bidding format does not change this" |
| NYSBA 1294 | Mar 11, 2026 | Online lead-generator for employment lawyers **is permissible** if: (1) platform **does not recommend** the lawyer and states it does not endorse any lawyer; (2) lawyers are selected by **neutral, disclosed criteria applied mechanically**; (3) payment does **not vary with retention or fee amount** (credits per contact qualify); users give clear, conspicuous informed consent, separately for sharing contact info; not solicitation (7.3) and the lawyer's follow-up is not an ad (7.1 label not needed) |
| NYSBA 1049 | 2015 | Responding to an online request for a lawyer is not solicitation; describing services to obtain retention is advertising (7.1) |
| NYSBA 899 | 2011 | Lawyers may give general answers on interactive sites; may not solicit there (7.3) |
| NYSBA 1052 | 2015 | A modest credit for a client rating a lawyer was not a prohibited recommendation payment, but lawyer must not coerce or write the review |

URLs: https://nysba.org/ethics-opinion-1294-solicitation-advertisement-lead-generators/ ; https://nysba.org/ethics-opinion-1271-sharing-of-legal-fees-with-non-lawyer/ ; https://nysba.org/ethics-opinion-1213/ ; https://nysba.org/app/uploads/2015/03/Opn-1049.pdf ; https://nysba.org/ethics-opinion-899/ . Accessed 2026-10-25. 1131/1132/1052 only via search summary (`SEARCH`): search nysba.org for the numbers and read in full (TODO).

**Answers to the questions asked:**

1. **Paid subscription for attorneys = permissible advertising cost?** Yes if flat, not tied to results, and LawBid does not recommend/vouch (Op. 1294, 1131). Risk rises with each "verified / vetted / top / trusted" statement by LawBid (Op. 1132, 1213, 1271). Today `terms.en.md` s.3 has a "Trust levels" ladder and the UI shows "verified". **Fix**: describe it as "license checked against the state registry on [date]", never "vetted/recommended/best". M, LAWYER.
2. **Bid model and bid-packs = paying for referrals?** A bid-pack is a prepaid credit to respond to a client-initiated request, like the "credits per contact" that Op. 1294 accepts. It becomes a problem if (a) price depends on case value or outcome, (b) platform ranks or recommends bidders by its own quality judgment, (c) LawBid takes any % of fees (Op. 1271). Keep pack price flat and unrelated to case value. If bid cost varies by case category/size, document it as cost of the lead, not value of the fee. M, LAWYER.
3. **Paid boost = advertising?** Yes, it is advertising purchased by the lawyer; permitted as "reasonable cost of advertising" if it is labeled as paid/sponsored to consumers and does not claim quality. Fix: label "Sponsored / Attorney Advertising" (NY Rule 7.1 requires the "Attorney Advertising" label on advertisements, `KNOWLEDGE`); never mix paid rank into a ranking that is described as relevance or quality; disclose ranking criteria in Advertising Disclosure draft. No UI change by me; flag for owner. M-H, LAWYER. (FTC also: 16 CFR 255 and the "native advertising" policy, KNOWLEDGE.)
4. **Client subscriptions?** Clients are not bound by attorney ethics rules; subscription for client features is a consumer product (consumer-protection rules apply, Part B). Risk: if it buys priority in front of attorneys it must not look like LawBid recommending. L-M.
5. **Legal Q&A "best answer" OK?** Because the **asker** picks it, it is the asker's opinion, not LawBid's vouching. Attorneys answering general questions is OK under NYSBA 899 if they do not solicit; the answer must not create an attorney-client relationship or give individualized advice without caution. Fix: label "Chosen by the person who asked. Not a LawBid recommendation. General information, not legal advice." Do not use "best answer" counts to auto-generate "Top attorney" badges. Aggregated "N best answers" shown on a profile is a **testimonial-like claim**; allow only as factual count with the same label. M, LAWYER.
6. **Ratings/badges like "Top attorney"?** High risk if awarded by LawBid by its own judgment (Op. 1132: rating scale = recommendation; also NY Rule 7.4 limits "specialist/expert" claims, KNOWLEDGE). Badges based on **objective, disclosed, mechanical facts** (years licensed from registry, number of reviews, response time) are safer. Avoid superlatives. Never use "Top", "Best", "Super", "Elite". H if present, LAWYER. (Check `attorney-trust`, `client-badge`, `profiles` for badge names; I grepped only briefly.)
7. **Reviews**: clients rate lawyers. NY Rule 7.1 treats client testimonials as advertising when the lawyer uses them; NYSBA 1052 says client-written reviews are not the lawyer's ad if not coerced. Lawyer replies to negative reviews must not reveal confidential information (Rule 1.6; NYSBA reply-to-review opinions, `KNOWLEDGE`). Fix: warn text next to the reply field (admin-editable) and in Attorney Terms.
8. **Contact masking** (`contact_masked`): LawBid hides phone/email in chat. Defensible as anti-circumvention of platform and safety; but a contract term that bars attorney and client from dealing outside the platform could be seen as restricting the client's choice of counsel / lawyer's right to practice (NY Rule 5.6(a), `KNOWLEDGE`). Fix: no "non-circumvention fee" or exclusivity on legal fees; state in Attorney Terms that clients may hire the attorney outside the platform. M, LAWYER.
9. **Client funds / advance fees**: attorney receives payment via Connect; unearned fees belong in an attorney trust (IOLTA) account (NY Rule 1.15, `KNOWLEDGE`); NY Rule 1.5(d)(4) bars nonrefundable fees for some matters; Part 1215 requires a written engagement letter (22 NYCRR 1215, `KNOWLEDGE`). Attorney Agreement s.3 already says IOLTA; add engagement-letter reminder. M.
10. **Lawyer Referral Service status**: If LawBid ever "matches" and "recommends", it may be treated as a lawyer referral service, a regulated category in many states (NY has court-approved rules for not-for-profit referral services, `KNOWLEDGE`). Our design (client chooses; no recommendation) avoids this. Keep it that way and say so in the disclosure.

### A3. NY Rules of Professional Conduct 7.1-7.5 (22 NYCRR 1200) `KNOWLEDGE`, to verify at https://www.nycourts.gov/legacypdfs/rules/jointappellate/NY-Rules-Prof-Conduct-1200.pdf

- 7.1(a)-(b): no false, deceptive or misleading advertising; testimonials need a "Prior results do not guarantee a similar outcome" disclaimer; "Attorney Advertising" label; advertisements must include office address and be retained (3 years; 1 year for computer-accessed ones) - LawBid cannot do this for the attorney, but must give each attorney a profile field for the required info and a way to export their profile history (TODO).
- 7.2: no payment for recommendations (see A2).
- 7.3: solicitation limits including the 30-day moratorium after accidents (personal injury), and labels on solicitations.
- 7.4: specialization claims restricted ("specialist", "expert").
- 7.5: firm names.
- Where we stand: only a sentence in Attorney Agreement s.3 ("you must add any label"). **Gap**: product gives attorneys no field/automatic label for "Attorney Advertising" and the required disclaimers. **Fix**: admin-editable per-state disclaimer text shown on public profiles/posts/boosts (NY default), plus Attorney Terms duties. No UI change by me; flagged as a product decision. M, LAWYER.

### A4. UPL: NY Judiciary Law §§ 478, 484, 495 and solicitation §§ 479, 482 `KNOWLEDGE`

- §478: only licensed attorneys may practice law; §484: only admitted attorneys may appear/give legal advice for others; §495: corporations may not practice law or hold themselves out as practicing law; §479/§482: soliciting legal business / runners/ referral practices (verify exact content of §482 with a lawyer; the owner's brief lists it).
- Exposure: UPL in NY is a misdemeanor (§485) plus injunction; typical platform risk is a state AG or bar complaint, and customer class actions that the "service" is illegal.
- Where we stand: texts say not a law firm. **Risk items in code**: `document-templates` module (forms/templates; generic forms alone are usually not UPL, individualized completion with advice can be), machine translation of legal messages, any AI that answers legal questions, "support" staff answering legal questions, moderator edits to attorney answers. **Fix**: templates marked as generic forms, no "which form is right for you" recommendations; support scripts never give legal advice; AI features disclaimer; LAWYER to review templates. M-H.

### A5. ABA formal opinions

- 465 (2013): group coupons / Groupon: lawyer may use deal sites if fee sharing and 7.2 problems are avoided, requires clear disclosures. Applies by analogy to bid-packs/boosts. `KNOWLEDGE`.
- 477R (2017) secure communications; 498 (2021) virtual practice; 483 (2018) data breach duties of lawyers. `KNOWLEDGE`.
- 501 (2022) on solicitation of prospective clients through online/ automated "pay-to-play"? Not certain of the number's subject; I believe 501 concerns **solicitation of prospective clients in 7.3 context (2022)**; verify before citing. `KNOWLEDGE, UNVERIFIED`.
- 511 (2024) lawyer use of confidential info in firm; 512 (July 29, 2024): generative AI: competence, confidentiality (informed consent before putting client info into a self-learning tool), communication, candor, supervision, fees. SEARCH-confirmed. https://www.americanbar.org/ (opinion PDF; not fetched).
- 2025-2026 ABA opinions on lead generators or online platforms: **my search found none**; the NYSBA 1294 (Mar 2026) is the freshest primary authority. State by state differ (NJ, CA, TX, FL have their own). LAWYER should list states we operate in.
- Application: Attorney Terms must tell attorneys not to put privileged info in AI/translation features unless they accept the vendor terms (Op. 512), and we need a "translate off" per conversation (TODO).

### A6. NY AI guidance

NYSBA Task Force on AI report (Apr 2024) and NYC Bar Formal Op. 2024-5 on generative AI `KNOWLEDGE`; courts' AI policy. Duty on attorneys: competence, supervise AI, protect confidentiality, check output; for platforms: disclose AI use, no unsupervised legal advice.

---

## PART B. Consumer protection

| Law | Requirement | Where we stand | Gap / fix | Risk and money | Lawyer? |
|---|---|---|---|---|---|
| FTC Act §5, 15 USC 45 https://www.law.cornell.edu/uscode/text/15/45 `KNOWLEDGE` | No unfair or deceptive acts; claims must be substantiated | Marketing claims ("verified", "get bids in minutes") | Substantiate; keep evidence; no fake counters/urgency | M; civil penalty up to $53,088 per violation (FTC 2026 figure from SEARCH on Take It Down; verify exact number) for rule violations; §5 alone: injunction | Y |
| **FTC Rule on Consumer Reviews and Testimonials**, 16 CFR 465 `FETCHED` https://www.ecfr.gov/current/title-16/part-465 | 465.2 no fake reviews; 465.4 no buying reviews or conditioning compensation on sentiment; 465.5 insider reviews disclosed; 465.6 company-controlled "independent" review sites; 465.7 review suppression (no unfounded legal threats; may not claim displayed reviews are most/all if negatives hidden by sentiment); 465.8 fake social indicators (followers, likes) | `reviews`, `client-reviews`, `review-moderation.service.ts`, `rewards`, `follows` | (a) confirm moderation uses neutral criteria (defamation, fake, off-topic), **not star value**; (b) no reward/credit for reviews (check `rewards` module covers staff only: it is staff rewards, ok); (c) attorneys must be banned from buying/asking incentivized reviews; Attorney Terms clause; (d) no admin-added or seeded reviews (demo module must not leak into prod); (e) display line "Reviews are moderated for legal reasons only" (admin-editable); (f) detect fake followers | H-M; up to ~$53k per violation, per fake review in theory; FTC actions are rare but real | Y |
| **Consumer Review Fairness Act**, 15 USC 45b https://www.law.cornell.edu/uscode/text/15/45b `KNOWLEDGE` | Form contracts may not restrict honest reviews or impose penalties for them | `terms.en.md`, `client_agreement.en.md`, `attorney_agreement.en.md` | Draft Terms include an express statement; remove any "non-disparagement" clauses (check attorney agreement; found none by quick read, not exhaustive) | L-M; FTC/AG enforcement | Y |
| NY GBL §349 (deceptive acts) and §350 (false advertising) https://www.nysenate.gov/legislation/laws/GBL/349 `KNOWLEDGE` | Private right: actual damages or $50 (349) / $500 (350), treble up to $1,000 / $10,000 for willful, plus attorney fees | Same as above | Same | M; class actions possible | Y |
| **NY GBL §527-a** automatic renewal https://www.nysenate.gov/legislation/laws/GBL/527-A `KNOWLEDGE`; 2025 "click to cancel" bills S5615 / A3928 are **pending; not confirmed enacted** `SEARCH` | Clear disclosure of terms before purchase, affirmative consent, acknowledgment with cancellation method, online cancellation if signed up online, reminder for long terms | `terms.en.md` s.9 says renewal terms shown at checkout, confirmation email, online cancel | **Verify in code**: checkbox/affirmative consent for each subscription type, acknowledgment email content, cancellation path in app, renewal reminder email for annual plans (`billing`, `subscriptions`, `admin-email-templates`). Admin-editable renewal notice text | M-H; statutory penalties and AG; class suits | Y |
| **California Automatic Renewal Law**, Bus. & Prof. Code §17600 et seq., amended by AB 2863 (effective Jul 1, 2025) https://leginfo.legislature.ca.gov/faces/codes_displayText.xhtml?lawCode=BPC&division=7.&title=&part=3.&chapter=1.&article=9 `KNOWLEDGE` | Express affirmative consent, save consent record 3 years, easy cancel same medium, price-change notice, annual reminder | Same | Same + record of consent in DB (check `legal_acceptance` / subscription records), reminder, "cancel" ease | H if CA users; plaintiffs' bar active; subscription purchased through Apple IAP is governed by Apple's billing flow, so risk is mostly web/Stripe purchases | Y |
| **ROSCA**, 15 USC 8401-8405 https://www.law.cornell.edu/uscode/text/15/chapter-110 `KNOWLEDGE` | Online negative option: clear disclosure of all material terms before collecting billing info, express informed consent, simple cancel | Same | Same | H; FTC uses it (Amazon $2.5B settlement 2025 `KNOWLEDGE`); civil penalty per violation | Y |
| **FTC Negative Option ("click-to-cancel") Rule**, 16 CFR Part 425 amendments | **Vacated entirely by the Eighth Circuit, July 8, 2025 (Custom Communications v. FTC, No. 24-3137)**; I found no 2026 restart `SEARCH` (Fenwick/GT Law summaries) | n/a | Do not rely on the rule; rely on ROSCA + state ARLs. Still design to click-to-cancel standard as it is best practice | Watch | no |
| Refunds / "refund" doc | State rules; app store rules | `refund.en.md` exists | Keep consistent with Apple/Google refund routing | L | |
| Pricing / fees disclosure (junk fees) | FTC Rule on Unfair or Deceptive Fees (16 CFR Part 464, effective May 12, 2025, live-event tickets and short-term lodging only) `KNOWLEDGE` | Not applicable; state laws (CA SB 478, MN, others) require all-in prices | Show total price with taxes before checkout | L | |

---

## PART C. Privacy and security

### C1. Comprehensive privacy laws

- **CCPA/CPRA** (Cal. Civ. Code §1798.100 et seq.) https://leginfo.legislature.ca.gov/faces/codes_displayText.xhtml?lawCode=CIV&division=3.&title=1.81.5.&part=4.&chapter=&article= `KNOWLEDGE`. Applies if the business (a) has annual gross revenue above about $26.6M (CPI-adjusted from $25M, verify), or (b) buys/sells/shares personal info of 100,000+ consumers or households, or (c) derives 50%+ of revenue from selling/sharing. **A startup is likely below all thresholds now.** `privacy.en.md` nonetheless promises CCPA rights. That is fine but then it is a **promise** and must be honored (FTC §5 / GBL 349). Penalties: $2,663 per violation / $7,988 intentional or minors (2025 adjusted, verify); private right for breaches: $107-$799 per consumer per incident (2025 adjusted, verify). New CPPA regulations on risk assessments, cybersecurity audits and automated decision-making phase in from Jan 1, 2026 (verify).
- **Other states**: roughly 20 comprehensive state laws in effect by 2026; Indiana, Kentucky, Rhode Island effective Jan 1, 2026; Alabama, Oklahoma 2027; Vermont 2028 `SEARCH` (MultiState / Osano trackers; **verify each**). Most have thresholds (typically 100,000 residents) with some lower (Texas applies to anyone not a small business under SBA definitions; Nebraska similar). Most treat **precise geolocation, children's data and data revealing "legal" matters?** not as sensitive by default; legal matters are not listed in most statutes but are practically sensitive. **New York has no comprehensive privacy statute enacted as far as I know (NY Privacy Act not passed) - verify.**
- **Where we stand**: Privacy Policy covers rights, no sale/share, GPC statement. **Gaps**: (1) SDKs (Firebase Cloud Messaging, App Check, Sentry) are processors/third parties - disclose; (2) states' universal opt-out and sensitive-data consent (Colorado, Connecticut, etc.) if thresholds reached; (3) data-protection assessments; (4) appeal process described (yes). **Fix**: draft Privacy Policy lists categories, retention and SDKs; keep an internal data map (TODO P-PRIV-1). M, LAWYER.

### C2. NY SHIELD Act, GBL §§ 899-aa, 899-bb `SEARCH` (amendment) / `KNOWLEDGE` (rest)

- 899-aa: notify affected NY residents **within 30 days after discovery** (amended Dec 2024; removed the "most expedient time" and scoping delay), and notify NY AG, Department of State, State Police (and DFS for covered financial entities); consumer reporting agencies when >5,000 NY residents `KNOWLEDGE`. Law enforcement delay allowed.
- 899-bb: "reasonable safeguards": administrative, technical, physical. Penalties: up to $20 per failed notice (cap $250,000) and civil penalty up to $5,000 per violation under 899-bb `KNOWLEDGE`.
- Where we stand: `legal.settings` has an incident contact; `docs/SECURITY_TODO.md` exists; audit log and journal integrity exist. **Gap**: no written incident-response plan with the 30-day clock, no breach-notice templates (TODO P-SEC-1). M, LAWYER.
- All 50 states have breach laws with different timelines (e.g. 30 days in several; 45/60 elsewhere). Create a table by state when the user base spreads; for now rule: **notify all affected people within 30 days of discovery** as one standard.

### C3. Children, teens

- COPPA 16 CFR Part 312; amended rule compliance date **April 22, 2026**; requires written retention policy and security program for operators subject to it `SEARCH`. COPPA applies to under-13 only if the service is directed to children or has actual knowledge. LawBid is 18+.
- **Gap**: no age gate or DOB in code (greps). Terms state 18+. **Fix**: checkbox "I am 18 or older" at sign-up (admin-editable text), policy to delete accounts found to be minors, no marketing to minors. (UI change needed - flagged, not done.) M. FTC exposure up to $53,088 per child (verify) is theoretical for 18+ products with reasonable gating.
- NY Child Data Protection Act (GBL art. 45, eff. June 20, 2025) and SAFE for Kids Act (GBL art. 42) apply to services directed at minors or with actual knowledge `KNOWLEDGE`; mostly N/A. Texas/Utah app-store age-verification laws `KNOWLEDGE`: litigation status unclear, verify.
- State laws on social media for minors (CA SB 976, NY SAFE for Kids, FL HB 3, etc.) apply to "addictive feeds" for minors; we are 18+, and with an age gate they are N/A. Feed/reels/stories raise the question only if minors can register.

### C4. Attorney-client privilege and platform access

- Privilege protects confidential communications; use of an intermediary needed to facilitate the communication generally does not waive it (Kovel-type reasoning) but **a platform that reads or uses message content for its own purposes weakens the "reasonable expectation of confidentiality"**; courts have found waiver where users communicated on systems with no privacy expectation (employer email cases). `KNOWLEDGE`, LAWYER.
- Facts: messages plaintext on server; `body_original` for "server/moderation/legal only"; moderation scans (`media-moderation`, `moderation`); admin tools: `admin-users`, `admin-cases`, `admin-content`; government lookup tools (`legal-lookup`, `legal-export`) produce evidence archives.
- **Gaps**: (1) no published rule "who at LawBid can read messages, when, with what approval"; (2) not confirmed that every admin read of a conversation is audit-logged with a reason; (3) automated moderation and Google translation not described as a risk for privileged content; (4) the draft policies say "we do not read your messages except to (a) enforce rules after a report, (b) prevent imminent harm / CSAM, (c) respond to valid legal process, (d) fix technical problems with consent".
- **Fixes**: need-to-know access (role flag), mandatory reason field, immutable log (journal exists), quarterly access review, chat-read count in admin dashboard; encryption of `body_original` at rest with application-level keys (TODO P-PRIV-3); per-chat "disable translation/AI" (product decision); user-facing text in Attorney Terms/Client Terms/Privacy (drafts include it). H, LAWYER.

### C5. ECPA / Stored Communications Act, wiretap, recording

- ECPA/Wiretap Act 18 USC 2510 et seq.; SCA 18 USC 2701 et seq. https://www.law.cornell.edu/uscode/text/18/part-I/chapter-119 `KNOWLEDGE`. Providers to the public may not disclose contents except as allowed (consent, service provision, legal process 2702/2703). **Gov requests need warrant for content** (SCA 2703); our legal-export module must require a warrant or user consent for message content (check `legal-export.service.ts` policy; TODO P-PRIV-4). Provider may access to protect rights/property (2511(2)(a)(i)).
- Recording of calls/video: **not implemented** (no recording code found). Keep it that way unless added with consent. Federal: one-party consent (18 USC 2511(2)(d)). **All-party consent states: California (Penal Code 632), Florida (Stat. 934.03), Illinois (720 ILCS 5/14-2, eavesdropping with all-party for private conversations), Washington (RCW 9.73.030), Pennsylvania (18 Pa.C.S. 5704), plus Maryland, Massachusetts, Montana, New Hampshire, Connecticut (civil), Delaware, Oregon (in-person)** `KNOWLEDGE`. NY: one-party (Penal Law 250.05). Because a call may involve parties in different states, rule: **never record without an audible/visible notice and explicit consent of all participants** (draft Terms). Users may record each other: Terms forbid recording without consent.
- **CIPA (Cal. Penal Code 631/638.51) website/SDK wiretap lawsuits**: statutory damages $5,000 per violation; cases against pixels, session replay, chat. For a mobile app with Sentry (breadcrumbs, session replay?) and Firebase this is a live plaintiff theory. Fix: check Sentry config has no session replay or screen/text capture, scrub PII (TODO P-PRIV-5); disclose SDKs; for the website, load analytics only after consent. M-H.
- Illinois angle: operator is an Illinois LLC. **BIPA** (740 ILCS 14) exposure if we use face/voice biometric identifiers (selfie liveness for verification? `privacy.constants.ts` and `client-badge` mention biometric/selfie terms; I did not confirm). If any face match/voiceprint: written consent policy needed; $1,000 negligent / $5,000 reckless per person. LAWYER and code check (TODO P-PRIV-6).

### C6. Attorneys' personal data from NY registry (outreach)

Using public registration data for B2B outreach is allowed but subject to CAN-SPAM (below) and the registry's terms. Judiciary Law §468-a registrations are public; confirm terms of use of the data source (`ny-registry.source.ts`). L-M.

---

## PART D. Communications

| Law | Requirement | Where we stand | Gap / fix | Risk | Lawyer |
|---|---|---|---|---|---|
| **TCPA**, 47 USC 227; 47 CFR 64.1200 https://www.ecfr.gov/current/title-47/chapter-I/subchapter-B/part-64/subpart-L/section-64.1200 `KNOWLEDGE` | Autodialed/prerecorded calls and texts to cell phones need prior express consent; marketing texts need prior express **written** consent; $500 per message, up to $1,500 if willful; huge class exposure | Only login OTP SMS (Twilio). OTP/authentication texts are generally treated as informational messages the user asked for; consent is inferred when the user gives the number to receive the code (FCC 2015/2012 rulings, `KNOWLEDGE`) | Do **not** send promotional SMS on that consent. Separate opt-in for any marketing SMS. Keep STOP/HELP handling (Twilio auto) and logs of consent | L now; becomes H once marketing SMS exists ($500-$1,500 per text × class) | Y |
| FCC revocation-of-consent rule, 47 CFR 64.1200(a)(10) | Honor revocation by any reasonable means within **10 business days**; the "revoke-all" portion delayed to **Jan 31, 2027** by DA 26-12 (Jan 6, 2026) `SEARCH` (Burr/BHFS summaries; read the FCC order) | STOP handled by Twilio | Handle "stop", "unsubscribe", "quit", "end", "cancel" replies; apply to all texts from same number | L | Y |
| Quiet hours: 47 CFR 64.1200(c)(1): no telemarketing calls/texts before 8am or after 9pm recipient local time `KNOWLEDGE`; NY telemarketing law (GBL art. 29-H, Do-Not-Call registry; Telemarketing Sales Act) | Same | No marketing SMS; if added, enforce quiet hours by area code | L | Y |
| NY telemarketing rules (GBL §§ 399-p, 399-z) `KNOWLEDGE` | DNC list, disclosures, recording notice | Not telemarketing now | Keep out of cold calling. Outreach to attorneys by phone is B2B but cell phone TCPA still applies | L | Y |
| **CAN-SPAM**, 15 USC 7701 et seq.; 16 CFR 316 https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business `KNOWLEDGE` | Commercial email: accurate headers, no deceptive subject, physical postal address, opt-out honored within 10 business days, up to $53,088 per email (FTC adjusted figure, verify) | SES for transactional email; `outreach` module sends to attorneys scraped from registry | Footer with postal address + one-click unsubscribe in outreach/marketing templates (`admin-email-templates`); suppression list; separate subdomain; transactional vs marketing flags | M | Y |
| **Gmail/Yahoo bulk sender rules** (from Feb 2024, tightened 2025; Microsoft Outlook May 2025) `KNOWLEDGE` | SPF, DKIM, DMARC, one-click unsubscribe (RFC 8058) for marketing, spam rate < 0.3% | SES | Check DNS records and List-Unsubscribe headers in SES config (`infra`) | M (deliverability, not legal) | no |

---

## PART E. Platform liability

| Law | Requirement | Where we stand | Gap / fix | Risk / money | Lawyer |
|---|---|---|---|---|---|
| **Section 230**, 47 USC 230 https://www.law.cornell.edu/uscode/text/47/230 `KNOWLEDGE` | Platform not treated as publisher of third-party content; no protection for platform's **own** content, for federal criminal law, IP (except as DMCA), or content the platform helps develop | User posts, reviews, Q&A | Do not edit users' content substance (moderator edits to attorney answers or reviews could make us a "developer"); label AI-generated or LawBid-written material; keep "not our opinion" notices. Review/ratings summaries created by LawBid are our content | M | Y |
| **Defamation in reviews** | Reviewed lawyers may sue the reviewer; platform protected by 230; but LawBid's own statements or edits not. Subpoena requests to unmask reviewers | `reviews`, `review-moderation`, `legal-lookup` | Process for takedown requests for defamation (court order), process for subpoenas to identify users (notice to user first), policy text; 465.7 forbids using threats to suppress; lawyers threatening reviewers may violate 465.7 if the platform helps | M | Y |
| **DMCA §512**, 17 USC 512 https://www.law.cornell.edu/uscode/text/17/512 `KNOWLEDGE` | Safe harbor needs: designated agent registered with Copyright Office (§512(c)(2)) and renewed every 3 years; notice-and-takedown; counter-notice; repeat infringer policy (§512(i)) | `modules/legal/dmca.service.ts` implements takedown + strikes (`dmcaStrikesToSuspend`); `dmca_policy.en.md` text exists; **agent placeholder** | **Register agent** at https://dmca.copyright.gov/ ($6, renew every 3 years); put into `legal.settings.dmcaAgent` and the policy text; calendar renewal. Statutory damages $750-$150,000 per work if no safe harbor | H (for 10 minutes of work); contributory infringement exposure | no (owner can register; lawyer review optional) |
| **Take It Down Act** (Pub. L. 119-12, 2025; platform duties effective **May 19, 2026**) `SEARCH` FTC press release https://www.ftc.gov/news-events/news/press-releases/2026/05/ftc-begins-enforcing-take-it-down-act | Covered platforms must have a notice process for non-consensual intimate imagery (including AI deepfakes), give clear and conspicuous notice, and **remove within 48 hours** of a valid request and make reasonable efforts to remove identical copies; FTC enforces as unfair/deceptive practice (civil penalty per violation, ~$53,088) | `reports`, `moderation`, `media-moderation`; reels/stories/chat media | Dedicated report reason "intimate image without consent", 48-hour SLA with alerting, hash-based copy removal, documented notice in Community Guidelines (draft) and in-app. Does the SLA exist? Not confirmed (TODO P-PLAT-2) | H (FTC is actively enforcing; letters and portal since May 19) | Y |
| **REPORT Act** (Pub. L. 118-59, 2024) amending 18 USC 2258A | Providers must report apparent child sexual abuse material (and now child sex trafficking/enticement) to NCMEC CyberTipline; preserve reported content **1 year**; fines up to about $850k-$1M for knowing failures by larger providers (smaller: $600k/$850k) `KNOWLEDGE, verify` | `media-moderation` exists; I did not confirm NCMEC reporting | Register with NCMEC CyberTipline (ESP registration), report workflow, 1-year preservation; staff training; never forward the file by email | H when images/video upload is live | Y |
| State social media / minors laws | See C3 | 18+ gate | Age gate | L-M | Y |
| Government requests | 18 USC 2703, state subpoenas, NY CPLR 3120 | `legal-lookup`, `legal-export` | Written policy: validate legal process, notify users unless gagged, transparency report (draft in Privacy) | M | Y |

---

## PART F. Accessibility

| Law | Requirement | Status | Gap / fix | Risk | Lawyer |
|---|---|---|---|---|---|
| ADA Title III, 42 USC 12181 et seq. (public accommodations) | No statute text for web; courts split on whether apps/sites count; DOJ guidance 2022 says websites of public accommodations are covered; serial plaintiffs sue (NY SDNY/EDNY has the highest volume) `KNOWLEDGE` | `accessibility.en.md` statement exists | Audit the web app and mobile app against WCAG 2.1/2.2 AA, fix top issues, publish contact for accessibility feedback, keep a VPAT/ACR; test with VoiceOver/TalkBack. NY State/City human rights laws also apply (NYSHRL, NYCHRL: broader, damages) | M-H; demand letters $5-30k settlements, defense $25k+; NYC HRL damages | Y |
| DOJ Title II web rule, 28 CFR Part 35 Subpart H `SEARCH` | Applies to **state/local governments**, not private companies; WCAG 2.1 AA. DOJ interim final rule Apr 20, 2026 extended dates to Apr 26, 2027 (50k+ population) and Apr 26, 2028 (smaller) | Not directly applicable | Only relevant if we sell to government entities; WCAG 2.1 AA is the de facto benchmark | L | no |
| WCAG 2.2 AA (W3C Rec Oct 2023) | Benchmark | n/a | Target 2.2 AA | | |
| Video: captions/transcripts for calls and reels (CVAA for some video services, `KNOWLEDGE`) | | Reels/stories have captions? not checked | Provide captions option for reels; call transcripts only with consent (privacy) | L-M | |

---

## PART G. Payments and tax

| Topic | Rule | Where we stand | Gap / fix | Risk | Lawyer |
|---|---|---|---|---|---|
| Money transmission (FinCEN 31 CFR 1010.100(ff)(5); state licensing incl. NY Banking Law Art. XIII-B / 3 NYCRR Part 406? (`KNOWLEDGE`, verify); Illinois TOMA) | Receiving and transmitting funds for others requires a license unless an exemption applies (payment processor exemption, agent of payee exemption) | Stripe Connect: Stripe is the licensed entity; client pays attorney, platform never holds the attorney's funds; platform fee = 0 | Keep flow as direct/destination charges with Stripe holding funds; do not hold balances in `treasury`/`stars` that can be cashed out; document the "agent of payee"/processor exemption analysis; Stars must not be redeemable for cash | M; unlicensed money transmission is a federal felony (18 USC 1960) and state penalties; LawBid's design likely OK | **Y (high priority)** |
| 1099-K | OBBBA (Pub. L. 119-21, Jul 4, 2025) restored $20,000 and 200 transactions threshold retroactively; applies to 2025 and 2026 `SEARCH` (CPA Practice Advisor, Bankrate) | Stripe files 1099-K for Connect accounts, not LawBid; partner rewards: LawBid files 1099-NEC at $600 (threshold changes to $2,000 for payments after Dec 31, 2025 under OBBBA `SEARCH` Patriot/OnPay) | W-9 collection exists (Partner Terms). Process: 1099-NEC for partners ≥ $2,000 in 2026 (verify), TIN matching, backup withholding 24% when no W-9 | L-M | Y (CPA) |
| Sales tax on SaaS/subscriptions | NY taxes prewritten software including remotely accessed (Tax Law §1101(b)(6), TSB-M-09(…)) `KNOWLEDGE`; economic nexus after South Dakota v. Wayfair: NY $500,000 and 100 transactions; other states typically $100,000 or 200 transactions; digital goods (stars, virtual gifts) taxable in many states | Stripe Tax usage unknown; app-store purchases: Apple/Google are marketplace facilitators and collect tax | Turn on Stripe Tax for web purchases; register once thresholds reached; track by state; nexus review quarterly | M later, L now | Y (CPA) |
| App Store / Play payment rules after Epic v. Apple | Ninth Circuit (Dec 2025) largely upheld contempt: Apple cannot block or put friction on external purchase links; the commission on linked-out purchases is for the district court to determine; Supreme Court review pending (cert granted June 30, 2026 per search; status after that unverified) `SEARCH` (Fenwick, TechSpot, TheNextWeb). Google Play: Epic v. Google remedies in effect (alternative billing/links in US) `KNOWLEDGE` | Stripe on web, `one-time-pay-page` for stars/boosts | Digital goods (subscriptions, stars, boosts) consumed in app: US users may be linked to web checkout; confirm current Apple guideline 3.1.1/3.1.3 and Play policy before each release; keep both IAP and web paths flexible; avoid steering outside US | M (app removal risk) | no |
| Stripe Connect terms | Stripe Connected Account Agreement and prohibited businesses list (legal services are allowed with restrictions; check) | | Confirm legal services category allowed; attorney onboarding KYC by Stripe | L | |
| Stars/gifts as stored value | Gift card / stored value laws (escheat/unclaimed property, NY GBL §396-i gift certificates) `KNOWLEDGE` | Stars = gifts | Terms: no cash value, non-refundable; check unused balance escheat; consider limiting balance holding | L-M | Y |
| Refund/chargeback | Card network rules | `refund.en.md` | Keep | L | |

---

## PART H. Contracts: E-SIGN, arbitration, Terms enforceability

- **E-SIGN**, 15 USC 7001 et seq.; NY Electronic Signatures and Records Act (State Technology Law art. 3, §§301-309); Illinois UETA 815 ILCS 333 `KNOWLEDGE`. Electronic signatures valid for most contracts; consumer disclosure/consent rules for records required by law to be provided in writing (15 USC 7001(c)). Wills, family law documents and court papers are carved out. In-app signing in LawBid: if used for engagement letters between attorney and client, E-SIGN is fine; **LawBid is not the party**. Keep audit trail (time, IP, doc hash). Gap: confirm the signing feature keeps tamper-evident record (journal integrity exists). L.
- **Clickwrap enforceability**: courts enforce clear "I agree" with links to Terms, with notice and unambiguous assent (2d Cir.: Meyer v. Uber (2017); Starke v. SquareTrade (2019); Cal.: Berman v. Freedom Financial (9th Cir. 2022) - sign-in-wrap enforceability needs conspicuous notice) `KNOWLEDGE`. Where we stand: `legal-acceptance` module records acceptance per version with guard (`legal-acceptance.guard.ts`). **Gap**: confirm the sign-up screen shows the link text and a button saying "I agree" (UI frozen: only verify), store IP + user agent + doc version + hash + locale. L-M.
- **Arbitration / class waiver**: FAA enforces; AAA Consumer Rules; **mass arbitration risk**: AAA/JAMS fee schedules make LawBid pay filing + case fees per claimant (AAA consumer filing fee for business ~$375 + case management fee $... per case, `KNOWLEDGE`; AAA mass arbitration supplementary rules since 2024). If 1,000 users file, business fees can reach hundreds of thousands of dollars. **Mitigations**: bellwether/batching clause (in draft Terms), pre-arbitration dispute notice (exists, 30 days), opt-out (exists), mandatory individualized notice form, choose arbitration provider with mass rules, keep the carve-out for small claims. Also: California public injunctive relief (McGill v. Citibank, 2017); NY CPLR 7501 ff; Illinois law choice. The **governing law is Illinois** while the launch market is NY: NY consumers' GBL 349 rights cannot be waived; fine as the Terms preserve mandatory consumer law. M, LAWYER.
- **Attorney agreement**: arbitration with attorneys is common; check indemnity (agreement s.8: attorney indemnifies LawBid) is not unconscionable and not a way to shift ethics; NY GOL 5-322.1 unenforceable for own negligence in construction only (n/a). L.
- **Terms changes**: 14-day notice (exists). Adding clause for AI, recording and platform access means re-acceptance needed (guard exists).

---

## PART I. AI and translation

- No NY statute mandates a general AI disclosure for tools like ours `KNOWLEDGE` (NY GBL art. 47 covers AI companion models, effective Nov 2025; Utah AI Policy Act requires disclosure for regulated occupations on request; California AB 2013 / SB 942 and Colorado SB 24-205 (delayed to Jun 30, 2026, status after that unverified) are about developers/high-risk systems). FTC treats misleading AI claims as deceptive (Operation AI Comply, 2024). **Where we stand**: translation (Google API) and moderation (automated). **Fix**: disclosure "Translated by machine; may contain errors; do not rely on a translation for legal decisions; ask your attorney to confirm in the original language"; label translated messages as such (UI shows? flagged); no AI "legal advice" feature without LAWYER review; keep humans in the loop for bans (also needed for CA ADMT rules later).
- Liability for mistranslation: attorneys remain responsible for communication (Rule 1.4); LawBid disclaims warranty. Mistranslation in a legal context could found a negligence or UDAP claim against LawBid if we promote it as "accurate". Marketing must not say "perfect translation". Google Cloud Translation data usage: under Google Cloud terms customer data is not used to train (`KNOWLEDGE`, verify) - include in the Third-Party Services doc.
- NYSBA AI Task Force (2024), ABA 512 (above).

---

## PART J. Sanctions and export

- **OFAC**: US persons must not do business with SDN-listed persons or comprehensively sanctioned jurisdictions (Cuba, Iran, North Korea, Syria, Crimea/DNR/LNR regions). Strict liability civil penalties (IEEPA: greater of ~$377,700 or twice the transaction, 2025 figure, verify). 31 CFR Ch. V https://www.ecfr.gov/current/title-31/subtitle-B/chapter-V `KNOWLEDGE`. Where we stand: no screening module found; Stripe screens Connect attorneys and payers; Twilio/Apple/Google block embargoed countries. **Fix**: terms clause (users are not on lists/located in embargoed places), geo-block for embargoed regions at signup (country module exists: `countries`), screen partner payouts and any non-Stripe payouts (`admin-payroll` staff payroll?) against OFAC SDN list. L-M; LAWYER for policy.
- **Export controls**: encryption in a mass-market app qualifies under license exception ENC / self-classification (5D992) and Apple/Google export questionnaire; annual self-classification report if applicable `KNOWLEDGE`. L.

---

## PART K. Other items found while mapping

| Item | Why | Fix |
|---|---|---|
| FTC Endorsement Guides 16 CFR Part 255 (partners) | Partner program must disclose material connection; partners must not claim "verified" | Already in `partner_terms.en.md`; make it admin-editable in all locales; monitor |
| Referral rewards paid to **lawyer-partners** | Paying lawyers for client referrals triggers Rule 1.5(e)/7.2 for the lawyer; partners that are lawyers must not receive a share of legal fees | Partner Terms: partners who are lawyers may not receive reward tied to clients retained; rewards only for app signups, flat |
| Stripe Connect "0 fee" | Good under 5.4 | Guard (see A1) |
| Email retention and "journal" | Retention schedule vs legal holds | Privacy retention table; litigation hold process |
| Insurance | Cyber, E&O/media liability, D&O | Ask broker; costs ~$2-8k/yr small |
| Corporate | Illinois LLC vs NY operations: foreign qualification in NY; NY LLC publication requirement (LLC Law §206) applies to NY LLCs only | LAWYER/CPA |
| Trademark | Brand "LawBid" clearance | USPTO search (outside this register) |
| Records of NY "Attorney Advertising" for LawBid's own marketing to consumers | LawBid itself is not a lawyer so Rule 7.1 does not bind it, but its marketing for attorneys' services must follow FTC | Review marketing site copy |

---

## Source list (all accessed 2026-10-25)

FETCHED: ecfr.gov 16 CFR Part 465; nysba.org Ethics Opinions 1294 and 1271 (summaries returned by the fetch tool).
SEARCH: nysba.org opinions 1213, 1131/1132/1052/1049/899 (summaries); Eighth Circuit vacatur of FTC click-to-cancel (Fenwick, GT Law, BCLP, Dickinson Wright); FCC DA 26-12 revoke-all delay (Burr & Forman, BHFS, Kelley Drye); FTC press release on Take It Down Act enforcement (ftc.gov, May 2026) and law-firm alerts (Wiley, Orrick); OBBBA 1099-K and 1099-NEC (CPA Practice Advisor, OnPay, Patriot); DOJ Title II interim final rule Apr 20, 2026 (Plante Moran, JD Supra, 3Play); ABA Formal Op. 512 (LawNext, UNC library); Epic v. Apple (Fenwick, TechSpot, TheNextWeb, Courthouse News); NY GBL 899-aa amendment (Alston Privacy, Covington Inside Privacy, Constangy); COPPA amended rule April 22, 2026 (Hunton, White & Case, Davis Polk); state privacy law trackers (MultiState, Osano, Enzuzo); NY S5615/A3928 click-to-cancel bills (nysenate.gov).
KNOWLEDGE (to be checked): everything else, notably NY RPC 7.1-7.5, 5.4, 1.6, 1.15, 5.5 text; Judiciary Law sections; CCPA thresholds and dollar adjustments; CIPA, BIPA; TCPA damages; REPORT Act fines; money transmission analysis; state recording laws; mass-arbitration fee schedules.
