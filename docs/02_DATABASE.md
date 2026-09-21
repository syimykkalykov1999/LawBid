# LawBid — ТЗ, ФАЙЛ 2 из 6 (версия 1.0)
## База данных CockroachDB: схема, справочники практик и штатов, индексы, миграции

> Как пользоваться в Cursor: "Прочитай /docs/01_FOUNDATION_AUTH.md и /docs/02_DATABASE.md, реализуй этап 2.X. Не выходи за рамки этапа." После каждого этапа обязательны `prisma validate`, `prisma migrate dev`, тесты. Если таблица из этапов 1.3 отличается от описания здесь, **этот файл главнее**, разница выравнивается новой миграцией.

Связь с файлами: продуктовая логика кейсов и бидов описана в файле 4, ленты и чатов в файле 5, верификации в файле 3, подписки и админки в файле 6. Здесь только структура данных, правила целостности, индексы, справочники и миграции.

---

## 1. Общие принципы и соглашения

### 1.1 CockroachDB: обязательные правила
- Первичные ключи: только `UUID` с `DEFAULT gen_random_uuid()`. **Запрещены** последовательные `SERIAL`/`autoincrement` (создают hot-spots).
- Все даты: `TIMESTAMPTZ` (UTC). Деньги: `INTEGER` в **центах** (`*_cents`), валюта всегда USD.
- Транзакции короткие. Любая запись, затрагивающая несколько таблиц (принятие бида, торг, регистрация), выполняется через `withTxRetry()` (повтор при `40001 serialization_failure`, до 5 попыток с jitter).
- Индексы по монотонно растущим полям (`created_at`) на глобальных таблицах с высокой записью создаются **hash-sharded** (`USING HASH WITH (bucket_count = 16)`), это делается raw SQL в миграции (этап 2.6).
- Блокировки строк: `SELECT ... FOR UPDATE` только внутри транзакции и только для бизнес-критичных операций (принятие бида, торг).
- Массивы (`text[]`) допускаются для небольших наборов (языки), индексируются GIN.
- Большие миграции данных (backfill) только батчами по 1000-5000 строк, не одной транзакцией.

### 1.2 Именование
- Таблицы: `snake_case`, множественное число. Колонки: `snake_case`. В Prisma **поля тоже snake_case** (без `@map`), модели PascalCase в единственном числе с `@@map("table_name")`.
- Boolean: `is_*`, `has_*`. Даты событий: `*_at`. Внешние ключи: `<entity>_id`.
- Перечисления (enum) создаются в БД (Prisma `enum`), значения `snake_case`.
- API/DTO используют camelCase, маппинг только в слое DTO/mapper, не в Prisma.

### 1.3 Общие колонки
Все таблицы имеют `id uuid PK`, `created_at timestamptz default now()`, `updated_at timestamptz` (авто). Исключения указаны явно (составной PK, append-only таблицы без `updated_at`).

### 1.4 Внешние ключи и удаление
- Юридически значимые данные (`users`, `cases`, `bids`, `case_journal`, `contact_disclosures`, `subscriptions`, `payments`) **никогда не удаляются физически**. FK: `ON DELETE RESTRICT`.
- Soft delete: колонка `deleted_at`. Все выборки по умолчанию фильтруют `deleted_at IS NULL` (Prisma middleware/extension, а не вручную в каждом запросе).
- Вспомогательные данные (лайки, сохранённое, подписки, участники чата) допускают `ON DELETE CASCADE`.

### 1.5 Счётчики
Денормализованные счётчики (`like_count`, `comment_count`, `followers_count`, `bids_count`, `view_count`) обновляются:
- транзакционно там, где важна точность (`bids_count`, `rating_*`);
- через Redis-агрегацию и периодический сброс в БД воркером там, где допустима задержка (`view_count`, `like_count`, `comment_count`, `followers_count`), чтобы не создавать hot-строки.
Раз в сутки воркер сверяет счётчики с реальными данными.

### 1.6 Шифрование и чувствительные данные
- Шифрование диска и трафика на уровне кластера (детали в файле 6).
- Документы верификации хранятся только в S3 (private bucket, SSE-KMS). В БД только ссылка на `files`.
- Тексты сообщений чата хранятся как есть, но доступ к `body_original` только у сервера и модерации/юридических запросов.

---

## 2. Перечисления (enum)

| Enum | Значения |
|---|---|
| `user_role` | `client`, `attorney`, `admin` |
| `user_status` | `active`, `suspended`, `deletion_pending`, `deleted` |
| `theme_pref` | `system`, `light`, `dark` |
| `identifier_type` | `phone`, `email`, `apple`, `google` |
| `consent_type` | `terms`, `privacy`, `disclaimer`, `client_contact_sharing`, `age_18`, `marketing_email`, `marketing_push`, `analytics` |
| `legal_doc_type` | `terms`, `privacy`, `disclaimer`, `client_contact_sharing` |
| `file_purpose` | `avatar`, `post_image`, `verification_document`, `verification_selfie` |
| `scan_status` | `pending`, `clean`, `infected`, `failed` |
| `contact_method` | `call`, `sms`, `email`, `in_app_chat` |
| `verification_status` | `unverified`, `pending`, `verified`, `rejected`, `suspended` |
| `license_status` | `pending`, `verified`, `rejected`, `expired`, `suspended` |
| `verification_request_status` | `draft`, `submitted`, `in_review`, `needs_more_info`, `approved`, `rejected` |
| `verification_doc_type` | `bar_license`, `drivers_license`, `passport`, `state_id`, `selfie`, `other` |
| `verification_provider` | `manual`, `stripe_identity`, `persona` |
| `verification_check_type` | `bar_lookup`, `id_check`, `face_match` |
| `check_result` | `pass`, `fail`, `manual_review` |
| `case_status` | `open`, `in_progress`, `pending_completion`, `disputed`, `closed`, `archived` |
| `budget_mode` | `amount`, `clarify_later` |
| `bid_status` | `active`, `accepted`, `rejected_by_client`, `rejected_auto`, `withdrawn`, `failed_negotiation` |
| `fee_type` | `fixed`, `hourly`, `free_consultation` |
| `start_availability` | `immediately`, `within_week`, `custom_date` |
| `party_role` | `client`, `attorney` |
| `offer_status` | `pending`, `accepted`, `declined`, `countered`, `superseded` |
| `case_journal_event` | `created`, `updated`, `bid_placed`, `offer_made`, `bid_accepted`, `bid_rejected`, `bid_withdrawn`, `negotiation_failed`, `contacts_disclosed`, `completion_requested`, `completion_confirmed`, `auto_closed`, `disputed`, `dispute_resolved`, `archived`, `restored`, `deleted`, `closed` |
| `contact_issue_type` | `phone_invalid`, `no_answer`, `email_bounce`, `wrong_person`, `other` |
| `contact_issue_status` | `open`, `confirmed`, `rejected` |
| `dispute_status` | `open`, `resolved` |
| `review_status` | `published`, `hidden`, `removed` |
| `content_status` | `published`, `hidden`, `removed` (посты, комментарии) |
| `saved_item_type` | `post`, `case` |
| `media_type` | `image`, `video` (video включается флагом позже) |
| `conversation_status` | `pre_acceptance`, `active`, `closed` |
| `message_type` | `text`, `system` |
| `notification_type` | `bid_received`, `offer_countered`, `offer_accepted`, `bid_accepted`, `bid_rejected`, `negotiation_failed`, `case_stale_prompt`, `case_archived`, `completion_requested`, `completion_reminder`, `case_closed`, `new_message`, `new_follower`, `post_like`, `post_comment`, `comment_reply`, `comment_like`, `verification_update`, `subscription_trial_ending`, `subscription_payment_failed`, `subscription_status`, `contact_issue_update`, `moderation_notice`, `security_new_device` |
| `notification_category` | `messages`, `bids`, `cases`, `social`, `system`, `marketing` |
| `subscription_status` | `trialing`, `active`, `past_due`, `canceled`, `incomplete`, `expired` |
| `payment_status` | `pending`, `succeeded`, `failed`, `refunded` |
| `report_target_type` | `post`, `comment`, `user`, `message`, `case`, `review` |
| `report_reason` | `spam`, `abuse`, `misinformation`, `impersonation`, `inappropriate`, `other` |
| `report_status` | `open`, `actioned`, `dismissed` |
| `moderation_action_type` | `hide`, `remove`, `warn`, `suspend`, `restore` |
| `admin_role` | `super_admin`, `moderator`, `verifier`, `support`, `finance` |
| `data_request_type` | `subpoena`, `court_order` |
| `data_request_status` | `received`, `in_progress`, `fulfilled`, `rejected` |

---

## 3. Справочники (seed)

### 3.1 Штаты США (50 + DC)
Таблица `states(code PK char(2), name, is_active default true)`. Начальные данные:

AL Alabama, AK Alaska, AZ Arizona, AR Arkansas, CA California, CO Colorado, CT Connecticut, DE Delaware, DC District of Columbia, FL Florida, GA Georgia, HI Hawaii, ID Idaho, IL Illinois, IN Indiana, IA Iowa, KS Kansas, KY Kentucky, LA Louisiana, ME Maine, MD Maryland, MA Massachusetts, MI Michigan, MN Minnesota, MS Mississippi, MO Missouri, MT Montana, NE Nebraska, NV Nevada, NH New Hampshire, NJ New Jersey, NM New Mexico, NY New York, NC North Carolina, ND North Dakota, OH Ohio, OK Oklahoma, OR Oregon, PA Pennsylvania, RI Rhode Island, SC South Carolina, SD South Dakota, TN Tennessee, TX Texas, UT Utah, VT Vermont, VA Virginia, WA Washington, WV West Virginia, WI Wisconsin, WY Wyoming.

Названия штатов в UI берутся из i18n по ключу `state.<code>` (например `state.NY`).

### 3.2 Практики адвокатов (practice_areas)
Таблица `practice_areas`: `id`, `parent_id` (null для категории, иначе id категории), `code` (unique), `name_en`, `i18n_key`, `sort`, `is_active`. Двухуровневое дерево: **категория → специализация**. Кейс всегда привязывается к специализации (лист дерева). Адвокат выбирает специализации (в UI есть "выбрать всю категорию", в БД сохраняются листья).

**Правило генерации кода:** `code = <код_категории>.<snake_case(название)>`, где snake_case: нижний регистр, `&` → `and`, все символы кроме букв и цифр → `_`, повторы `_` схлопываются, края обрезаются. Код категории = snake_case её названия. Пример: категория "Traffic Tickets", специализация "Speeding" → `traffic_tickets.speeding`. i18n-ключи: `practice.<code>`. Отображаемое имя в UI на карточке кейса: "Категория — Специализация" (например "Traffic Tickets — Speeding").

Cursor создаёт из списка ниже файл `apps/api/prisma/seed/practice_areas.seed.json` и идемпотентный seed (upsert по `code`). Изменять/дополнять список потом можно через миграцию-seed без релиза приложения.

**1. Criminal Defense:** General Criminal Defense; Felony; Misdemeanor; Drug Offenses; Theft and Burglary; Robbery; Assault and Battery; Domestic Violence Charges; Sex Crimes; Weapons Charges; White Collar Crime; Fraud and Embezzlement; Cyber Crimes; Homicide and Manslaughter; Federal Crimes; Juvenile Crimes; Probation and Parole Violation; Bail and Bond Hearings; Expungement and Record Sealing; Criminal Appeals and Post-Conviction; Restraining Order Violations; Public Intoxication and Disorderly Conduct.

**2. DUI and DWI:** First Offense DUI; Repeat DUI; Felony DUI; Underage DUI; Commercial Driver DUI; Drugged Driving; DMV License Suspension Hearing; Ignition Interlock; Refusal of Chemical Test.

**3. Traffic Tickets:** Speeding; Reckless Driving; Red Light and Stop Sign; Driving Without License or Insurance; License Suspension and Revocation; Hit and Run; CDL Violations; Moving Violations; Parking Tickets; Point Reduction; Traffic Court Representation; Seat Belt and Cell Phone Violations.

**4. Personal Injury:** Car Accident; Truck Accident; Motorcycle Accident; Pedestrian and Bicycle Accident; Rideshare Accident; Bus and Train Accident; Slip and Fall; Premises Liability; Dog Bite; Product Liability; Wrongful Death; Catastrophic Injury; Traumatic Brain Injury; Spinal Cord Injury; Burn Injury; Nursing Home Abuse and Neglect; Assault Injury; Toxic Exposure; Boating Accident; Construction Accident; Sexual Abuse Claims; Other Personal Injury.

**5. Medical Malpractice:** Surgical Error; Misdiagnosis and Delayed Diagnosis; Birth Injury; Medication Error; Anesthesia Error; Hospital Negligence; Dental Malpractice; Nursing Negligence; Wrongful Death Medical.

**6. Workers Compensation:** Workplace Injury; Occupational Disease; Denied Workers Comp Claim; Return to Work Disputes; Third-Party Claims; Workers Comp Appeals; Permanent Disability; Retaliation for Filing a Claim.

**7. Family Law:** Divorce; Legal Separation; Child Custody; Child Support; Alimony and Spousal Support; Property Division; Prenuptial and Postnuptial Agreements; Paternity; Adoption; Guardianship of Minors; Domestic Violence Protective Orders; Modification and Enforcement of Orders; Grandparents Rights; Name Change; Annulment; Surrogacy and Assisted Reproduction; Relocation with Children; Military Divorce.

**8. Immigration:** Family-Based Immigration; Employment Visas; Green Card; Citizenship and Naturalization; Asylum and Refugee; Deportation and Removal Defense; DACA; Student Visas; Investor Visas; Waivers; Temporary Protected Status; U and T Visas; VAWA; Immigration Appeals; Detention and Bond Hearings; Consular Processing; Visa Overstay.

**9. Estate Planning and Probate:** Wills; Trusts; Probate Administration; Estate Litigation; Trust Administration; Power of Attorney; Healthcare Directives; Guardianship and Conservatorship; Estate Tax Planning; Beneficiary Disputes.

**10. Elder Law:** Medicaid Planning; Long-Term Care Planning; Elder Abuse; Adult Guardianship; Nursing Home Issues; Special Needs Planning.

**11. Real Estate:** Residential Purchase and Sale; Commercial Real Estate; Closing and Title; Title Disputes and Quiet Title; Foreclosure Defense; Mortgage Disputes; Boundary and Easement Disputes; HOA Disputes; Zoning and Land Use; Eminent Domain; Real Estate Litigation.

**12. Landlord and Tenant:** Eviction Defense; Eviction for Landlords; Lease Review and Disputes; Security Deposit Disputes; Habitability and Repairs; Rent Disputes; Commercial Lease Disputes; Housing Discrimination.

**13. Employment and Labor:** Wrongful Termination; Workplace Discrimination; Sexual Harassment; Wage and Hour; Retaliation and Whistleblower; Employment Contracts and Severance; Non-Compete Agreements; FMLA and Leave; Unemployment Benefits; Union and Labor Relations; Employer-Side Representation; Workplace Investigations.

**14. Bankruptcy and Debt:** Chapter 7 Bankruptcy; Chapter 11 Bankruptcy; Chapter 13 Bankruptcy; Debt Settlement; Creditor Harassment; Wage Garnishment; Repossession; Student Loan Debt; Credit Report Disputes; Judgment Defense.

**15. Business and Corporate:** Business Formation; Contracts; Mergers and Acquisitions; Partnership and Shareholder Disputes; Commercial Litigation; Franchise Law; Corporate Governance; Startups and Venture Capital; Business Sale and Purchase; Regulatory Compliance; Business Dissolution; Licensing Agreements.

**16. Intellectual Property:** Patents; Trademarks; Copyright; Trade Secrets; IP Litigation; DMCA and Online Infringement; Licensing.

**17. Tax Law:** IRS Audits; Tax Debt Settlement; Tax Planning; Criminal Tax Defense; Payroll Tax; State and Local Tax; International Tax; Tax Court and Appeals; Innocent Spouse Relief; Back Taxes and Liens.

**18. Civil Litigation:** General Civil Litigation; Contract Disputes; Business Torts; Defamation and Libel; Property Damage; Small Claims; Class Action; Mass Torts; Injunctions and Restraining Orders; Collections and Judgment Enforcement; Civil Fraud; Arbitration and Mediation Representation.

**19. Consumer Protection:** Consumer Fraud; Lemon Law; False Advertising; Identity Theft; Unfair Debt Collection; Warranty Claims; Auto Dealer Fraud; Data Breach; Telemarketing and Robocalls; Scams and Fraud Recovery.

**20. Insurance Law:** Insurance Claim Denial; Bad Faith Insurance; Homeowners Insurance Claims; Auto Insurance Disputes; Life Insurance Claims; Disability Insurance Claims; Health Insurance Denial; Business Insurance Claims; Flood and Storm Damage Claims.

**21. Social Security Disability:** SSDI; SSI; Denied Disability Appeals; Continuing Disability Review; Disability Hearings.

**22. Veterans and Military:** VA Disability Benefits; VA Appeals; Military Justice and Court-Martial; Discharge Upgrades; Servicemembers Civil Relief Act; USERRA Employment Rights; Military Family Law.

**23. Civil Rights:** Police Misconduct; Section 1983 Claims; Wrongful Conviction; Prisoner Rights; Disability Rights and ADA; Voting Rights; First Amendment; Religious Freedom; Discrimination in Public Services.

**24. Education Law:** Student Discipline; Special Education and IEP; Title IX; University Disputes; School Negligence; Student Rights.

**25. Health Care Law:** Medical License Defense; HIPAA and Compliance; Medicare and Medicaid Billing; Provider Disputes; Patient Rights; Medical Billing Disputes.

**26. Government and Administrative Law:** Administrative Hearings; Professional License Defense; Government Contracts; FOIA and Public Records; Permits and Licensing; Public Benefits; Municipal Law; Agency Appeals.

**27. Appeals:** Civil Appeals; Criminal Appeals; Federal Appeals; Writs and Extraordinary Relief; Appellate Briefs.

**28. Construction Law:** Contractor Disputes; Mechanics Liens; Construction Defects; Construction Contracts; Surety Bonds.

**29. Securities and Financial Law:** Securities Fraud; Investment Fraud and FINRA; Banking and Finance; Financial Regulation; Cryptocurrency and Blockchain; Ponzi Schemes.

**30. Environmental and Energy Law:** Environmental Compliance; Toxic Torts; Oil and Gas; Renewable Energy; Land Contamination; Water Rights.

**31. Technology, Privacy and Cyber Law:** Data Privacy Compliance; Cybersecurity Incidents; Software and Technology Contracts; Internet and E-Commerce Law; Online Defamation; Social Media Disputes.

**32. Entertainment, Media and Sports Law:** Entertainment Contracts; Film and Music; Media and Publishing; Athlete Contracts; Publicity and Image Rights.

**33. Aviation and Maritime Law:** Aviation Accidents; Airline Passenger Rights; Maritime Injury and Jones Act; Admiralty; Cargo Disputes.

**34. International and Cross-Border Law:** International Business; International Family Law and Hague Convention; Extradition; Foreign Judgments; Customs and Trade.

**35. Antitrust and Trade Regulation:** Antitrust; Unfair Competition; Price Fixing; Trade Regulation.

**36. Nonprofit and Religious Organizations:** Nonprofit Formation; Tax-Exempt Status; Nonprofit Governance; Religious Organizations.

**37. Native American and Tribal Law:** Tribal Jurisdiction; Indian Child Welfare; Tribal Land and Property.

**38. Animal Law:** Animal Cruelty; Pet Custody; Dangerous Dog Cases; Veterinary Malpractice.

**39. Cannabis, Alcohol and Firearms Law:** Cannabis Licensing; Alcohol Licensing; Firearms Licensing; Firearms Rights Restoration.

**40. Agriculture and Gaming Law:** Agricultural Law; Gaming and Gambling Law.

**41. Legal Malpractice:** Attorney Negligence; Attorney Fee Disputes; Attorney Ethics Complaints.

**42. General Practice:** General Practice; Not Sure or Other. (`general_practice.not_sure_or_other` используется клиентом, если он не знает подходящую практику; правило показа таких кейсов описано в файле 4.)

Итого 42 категории и около 400 специализаций. Категории и специализации хранятся с `is_active`, поэтому позже добавляются миграцией-seed без релиза.

### 3.3 Прочие seed-данные
- `blocked_email_domains`: домены `privaterelay.appleid.com` (причина `apple_relay`) и список одноразовых почтовых доменов (`disposable`), загружается из файла `disposable_domains.txt` (открытый список), обновляется джобой раз в месяц.
- `feature_flags`: стартовые значения из файла 1, этап 1.8.
- `i18n_languages`: `en` (по умолчанию, активен), `ru` (активен).
- `legal_documents`: заглушки текстов `terms`, `privacy`, `disclaimer`, `client_contact_sharing` для `en` (тексты предоставляет владелец/юрист).
- Админ `super_admin`: создаётся seed-скриптом из переменных окружения (`SEED_ADMIN_EMAIL`), без пароля по умолчанию в репозитории.

---

## 4. Схема таблиц

Условные обозначения: PK, FK → таблица, UQ unique, NN not null, `?` nullable.

### 4.A Пользователи, авторизация, согласия, файлы

**users**
| Колонка | Тип | Заметки |
|---|---|---|
| id | uuid PK | |
| role | user_role NN | |
| status | user_status NN default `active` | |
| first_name, last_name | text? | обязательны после онбординга (проверка в сервисе) |
| avatar_file_id | uuid? FK → files | |
| email | text? | нормализован в lowercase, UQ (частичный, где не null) |
| email_verified_at | timestamptz? | |
| phone_e164 | text? | формат E.164, UQ (частичный, где не null) |
| phone_verified_at | timestamptz? | |
| ui_language | text NN default `en` | |
| theme | theme_pref NN default `system` | |
| suspended_reason | text? | |
| last_active_at | timestamptz? | |
| deletion_requested_at | timestamptz? | начало grace period 14 дней |
| deleted_at | timestamptz? | |
| anonymized_at | timestamptz? | |

CHECK: если `status = 'active'` и `role = 'client'` и онбординг завершён, то `email_verified_at` и `phone_verified_at` не null (проверяется сервисом при `POST /cases`, в БД не CHECK, чтобы не ломать вход через Apple/Google до шага контактов).

**user_identifiers**: `user_id` FK, `provider identifier_type`, `provider_uid text` (телефон E.164 / email lowercase / apple sub / google sub), `verified_at`. UQ (`provider`, `provider_uid`).

**sessions**: `user_id` FK, `device_id`, `device_name`, `platform`, `app_version`, `ip`, `user_agent`, `refresh_hash text UQ`, `last_used_at`, `expires_at`, `revoked_at?`, `revoked_reason?`, `replaced_by_session_id?` (для цепочки ротации).

**auth_events** (append-only): `user_id?`, `event_type text` (`otp_requested`, `login_success`, `login_failed`, `refresh_reuse_detected`, `logout`, `logout_all`, `reauth_success`, `reauth_failed`, `contact_changed`, `history_viewed`, `new_device`), `success bool`, `identifier_hash?`, `ip`, `device_id`, `user_agent`, `meta jsonb`, `created_at`.

**legal_documents**: `doc_type legal_doc_type`, `version text`, `locale text`, `content_url text` (или `content_md`), `published_at`, `is_current bool`. UQ (`doc_type`, `version`, `locale`).

**user_consents** (append-only): `user_id` FK, `consent_type`, `document_id? FK → legal_documents`, `granted bool`, `ip`, `device_id`, `created_at`. Текущее состояние согласия = последняя запись по (`user_id`, `consent_type`).

**onboarding_state**: `user_id PK FK`, `current_step text`, `completed_at?`, `data jsonb`.

**blocked_email_domains**: `domain text PK`, `reason text` (`disposable` | `apple_relay`).

**files**: `owner_user_id` FK, `purpose file_purpose`, `s3_bucket`, `s3_key UQ`, `mime`, `size_bytes`, `sha256`, `width?`, `height?`, `scan_status default pending`, `is_public bool default false`, `deleted_at?`.

### 4.B Конфигурация и переводы

**feature_flags**: `key text PK`, `enabled bool`, `rollout_percent int default 100`, `description`, `updated_by? FK → users`, `updated_at`.

**app_config**: `key text PK`, `value jsonb`, `updated_at`. Ключи: `min_app_version_ios`, `min_app_version_android`, `soft_update_version_ios`, `soft_update_version_android`.

**i18n_languages**: `code text PK` (ISO 639-1), `name_native`, `is_active bool`, `is_rtl bool default false`, `sort int`.
**i18n_keys**: `key text UQ`, `description?`.
**i18n_translations**: `key_id FK`, `lang FK → i18n_languages`, `value text`, `version int`, `updated_at`. PK (`key_id`, `lang`).
**i18n_bundle_versions**: `lang PK FK`, `version int`, `updated_at`. Инкрементируется при каждом импорте, используется для ETag и дельт (`version` в `i18n_translations` = версия бандла на момент изменения).

### 4.C Профили и верификация

**client_profiles**: `user_id PK FK`, `state_code FK → states`, `preferred_languages text[]`, `preferred_contact_method contact_method?`, `preferred_contact_note text?` (удобное время, до 200 символов).

**attorney_profiles**: `user_id PK FK`, `username text NN`, `username_lower text UQ NN`, `bio text? (≤300)`, `firm_name text?`, `languages text[]`, `verification_status verification_status default unverified`, `verified_at?`, `rating_avg numeric(3,2) default 0`, `rating_count int default 0`, `posts_count int`, `followers_count int`, `following_count int`.

**attorney_licenses**: `attorney_id FK → attorney_profiles`, `state_code FK`, `bar_number text`, `license_status default pending`, `expires_at date?`, `verified_at?`, `verified_by? FK → users`, `auto_check_result jsonb?`. UQ (`state_code`, `bar_number`) — одна лицензия не может быть привязана к двум аккаунтам.

**attorney_practice_areas**: `attorney_id FK`, `practice_area_id FK`. PK (составной). Запись допускается только при `verification_status = 'verified'` (проверка в сервисе).

**verification_requests**: `attorney_id FK`, `status verification_request_status`, `provider verification_provider default manual`, `provider_ref?`, `submitted_at?`, `reviewed_by? FK → users`, `reviewed_at?`, `rejection_reason?`, `admin_note?`.
**verification_documents**: `request_id FK`, `doc_type`, `file_id FK`, `state_code?` (для `bar_license`), `notes?`.
**verification_checks**: `request_id FK`, `check_type`, `provider`, `result check_result`, `details jsonb`, `checked_at`.

### 4.D Кейсы, биды, торг, журнал

**cases**
| Колонка | Тип | Заметки |
|---|---|---|
| client_id | uuid FK → users NN | |
| title | text NN | ≤120 символов |
| description | text NN | ≤5000 символов |
| practice_area_id | uuid FK NN | только специализация (лист) |
| primary_state_code | char(2) FK NN | денормализация основного штата для индексов |
| city | text? | показывается адвокатам как "Chicago, IL" |
| budget_mode | budget_mode NN | `amount` или `clarify_later` |
| budget_cents | int? | обязателен при `amount`, null при `clarify_later` |
| status | case_status NN default `open` | |
| accepted_bid_id | uuid? UQ | |
| view_count | int default 0 | |
| bids_count | int default 0 | |
| last_activity_at | timestamptz NN | |
| stale_prompt_sent_at | timestamptz? | push "Кейс ещё актуален?" |
| archived_at | timestamptz? | |
| client_completed_at | timestamptz? | клиент нажал "Выполнено" |
| attorney_confirmed_at | timestamptz? | |
| auto_close_at | timestamptz? | `client_completed_at + 7 дней` |
| closed_at | timestamptz? | |
| deleted_at | timestamptz? | soft delete |

**case_states**: `case_id FK`, `state_code FK`, `is_primary bool`. PK (`case_id`, `state_code`). Ограничения: максимум 3 строки на кейс (1 основной + до 2 дополнительных), ровно один `is_primary` (частичный UQ по `case_id` где `is_primary`), сервис проверяет; `cases.primary_state_code` должен совпадать с основной строкой.

**bids**
| Колонка | Тип | Заметки |
|---|---|---|
| case_id | uuid FK NN | |
| attorney_id | uuid FK → users NN | |
| status | bid_status default `active` | |
| fee_type | fee_type NN | текущие условия |
| amount_cents | int NN | для `free_consultation` = 0; для `hourly` = ставка в час |
| message | text NN | ≤2000 |
| start_availability | start_availability NN | |
| start_date | date? | при `custom_date` |
| estimated_duration_days | int? | |
| round_count | smallint NN default 0 | 0..5, CHECK ≤ 5 |
| turn | party_role NN | чей ход в торге (после ставки адвоката — `client`) |
| decided_at | timestamptz? | |

UQ (`case_id`, `attorney_id`) — один бид от адвоката на кейс. Правила торга и статусов описаны в файле 4.

**bid_offers** (история торга): `bid_id FK`, `round_no smallint` (0 = исходное предложение), `from_role party_role`, `fee_type`, `amount_cents`, `message?`, `status offer_status`, `created_at`. UQ (`bid_id`, `round_no`). Append-only (статус меняется только на `pending → accepted/declined/countered/superseded`).

**case_journal** (append-only, хранение 5 лет)
| Колонка | Тип |
|---|---|
| id | uuid PK |
| case_id | uuid FK |
| client_id | uuid FK |
| actor_user_id | uuid? FK |
| actor_role | user_role? |
| event_type | case_journal_event |
| payload | jsonb (bid_id, суммы, статусы, IP/устройство актора) |
| prev_hash | text? (хэш предыдущей записи этого кейса) |
| row_hash | text (SHA-256 от prev_hash + содержимого записи) |
| retain_until | timestamptz (= `created_at + 5 лет`) |
| created_at | timestamptz |
Хэш-цепочка нужна, чтобы любое изменение задним числом было обнаружимо; ежедневная проверка целостности воркером (файл 6).

**contact_disclosures** (append-only): `case_id`, `bid_id UQ`, `client_id`, `attorney_id`, `fields text[]` (`name`, `phone`, `email`, `preferred_contact`), `ip`, `device_id`, `disclosed_at`.

**contact_issue_reports**: `case_id`, `bid_id`, `attorney_id`, `client_id`, `issue_type`, `note?`, `status default open`, `resolved_by? FK`, `resolved_at?`, `resolution_note?`.

**case_disputes**: `case_id FK`, `opened_by FK → users`, `reason text`, `status dispute_status default open`, `resolved_by?`, `resolved_at?`, `resolution_note?`.

### 4.E Отзывы

**reviews**: `case_id UQ FK`, `client_id FK`, `attorney_id FK`, `rating smallint` (CHECK 1..5), `body text? (≤1000)`, `status review_status default published`. Создаётся только для кейса со статусом `closed` и принятым бидом этого адвоката (проверка в сервисе).

### 4.F Лента и соцфункции

**posts**: `author_id FK → users` (только `attorney`, проверка в сервисе), `body text NN (≤2200)`, `language text?`, `status content_status default published`, `like_count`, `comment_count`, `save_count`, `deleted_at?`.
**post_media**: `post_id FK`, `file_id FK`, `media_type default image`, `position smallint`, `width?`, `height?`. UQ (`post_id`, `position`).
**tags**: `tag_lower text UQ` (без `#`). **post_tags**: PK (`post_id`, `tag_id`).
**comments**: `post_id FK`, `author_id FK`, `parent_comment_id? FK → comments` (один уровень вложенности, ответы к ответам приводятся к родителю верхнего уровня), `body text (≤1000)`, `status content_status`, `like_count`, `reply_count`, `deleted_at?`.
**post_likes**: PK (`post_id`, `user_id`), `created_at`. **comment_likes**: PK (`comment_id`, `user_id`), `created_at`.
**follows**: PK (`follower_id`, `followee_id`), `followee_id` должен быть адвокатом (проверка в сервисе), CHECK `follower_id <> followee_id`, `created_at`.
**saved_items**: PK (`user_id`, `item_type`, `item_id`), `created_at`.

### 4.G Чаты

**conversations**: `case_id FK`, `attorney_id FK`, `client_id FK`, `bid_id? FK`, `status conversation_status default pre_acceptance`, `contacts_unlocked bool default false` (true после принятия бида этого адвоката), `last_message_at?`, `last_message_id?`. UQ (`case_id`, `attorney_id`). Чат создаётся только из кейса: после принятия бида или когда адвокат пишет клиенту по кейсу.
**conversation_participants**: PK (`conversation_id`, `user_id`), `last_read_message_id?`, `muted_until?`.
**messages**: `conversation_id FK`, `sender_id? FK` (null для system), `type message_type`, `body_original text`, `body_display text` (с маскировкой телефонов, email и ссылок, пока `contacts_unlocked = false`), `contact_masked bool default false`, `client_message_id text` (идемпотентность), `deleted_at?`. UQ (`conversation_id`, `sender_id`, `client_message_id`).

### 4.H Уведомления и push

**notifications**: `user_id FK`, `type notification_type`, `category notification_category`, `payload jsonb` (id сущностей и параметры для локализованного текста), `read_at?`, `created_at`.
**notification_settings**: PK (`user_id`, `category`), `push_enabled bool default true`, `email_enabled bool default true`.
**notification_quiet_hours**: `user_id PK`, `start_time time`, `end_time time`, `timezone text`.
**push_tokens**: `user_id FK`, `session_id FK`, `fcm_token text UQ`, `platform text`, `last_seen_at`.

### 4.I Подписки и платежи (Stripe)

**stripe_customers**: `user_id PK FK`, `stripe_customer_id text UQ`.
**subscriptions**: `user_id FK UQ` (одна запись на адвоката), `stripe_subscription_id text UQ?`, `status subscription_status`, `price_cents int` (39900 на старте), `trial_started_at?`, `trial_ends_at?`, `current_period_start?`, `current_period_end?`, `cancel_at_period_end bool`, `canceled_at?`, `card_fingerprint text?` (для защиты от повторных триалов: одна карта, один триал).
**payments**: `user_id FK`, `stripe_invoice_id text UQ?`, `stripe_payment_intent_id text?`, `amount_cents int`, `currency text default 'usd'`, `status payment_status`, `paid_at?`, `failure_code?`.
**stripe_webhook_events**: `stripe_event_id text PK`, `type text`, `payload jsonb`, `processed_at?`, `attempts int default 0`. Обработчик проверяет существование записи, это обеспечивает идемпотентность вебхуков.

### 4.J Модерация, админ, аудит

**reports**: `reporter_id FK`, `target_type report_target_type`, `target_id uuid`, `reason report_reason`, `note?`, `status report_status default open`, `handled_by? FK`, `handled_at?`.
**moderation_actions**: `report_id? FK`, `admin_id FK`, `target_type`, `target_id`, `action moderation_action_type`, `reason?`, `created_at`.
**admin_profiles**: `user_id PK FK`, `admin_role admin_role`.
**audit_log** (append-only): `admin_id FK`, `action text`, `target_type text`, `target_id uuid?`, `before jsonb?`, `after jsonb?`, `ip`, `created_at`.
**data_access_requests**: `request_type data_request_type`, `reference_number text`, `agency text`, `received_at`, `scope text`, `handled_by FK`, `status data_request_status`, `closed_at?`, `notes?`.
**data_access_log** (append-only): `request_id FK`, `admin_id FK`, `entity_type text`, `entity_id uuid`, `accessed_at`.

---

## 5. Индексы

Prisma `@@index/@@unique` создаёт обычные индексы. Частичные, hash-sharded, GIN и trigram индексы создаются **raw SQL в миграции** (этап 2.6). Ниже полный перечень.

### 5.1 Уникальные
`users(email)` WHERE email IS NOT NULL; `users(phone_e164)` WHERE phone_e164 IS NOT NULL; `user_identifiers(provider, provider_uid)`; `attorney_profiles(username_lower)`; `attorney_licenses(state_code, bar_number)`; `sessions(refresh_hash)`; `bids(case_id, attorney_id)`; `bid_offers(bid_id, round_no)`; `case_states(case_id)` WHERE is_primary; `conversations(case_id, attorney_id)`; `messages(conversation_id, sender_id, client_message_id)`; `reviews(case_id)`; `contact_disclosures(bid_id)`; `push_tokens(fcm_token)`; `subscriptions(user_id)`; `tags(tag_lower)`; `practice_areas(code)`; `i18n_keys(key)`.

### 5.2 Основные выборки

| Таблица | Индекс | Назначение |
|---|---|---|
| cases | `(primary_state_code, practice_area_id, created_at DESC)` WHERE `status='open' AND deleted_at IS NULL` | лента кейсов адвоката |
| cases | `(client_id, status, created_at DESC)` WHERE `deleted_at IS NULL` | "Мои кейсы" клиента |
| cases | `(last_activity_at)` WHERE `status='open'` | cron: напоминание и архивация |
| cases | `(auto_close_at)` WHERE `status='pending_completion'` | cron: автозакрытие |
| case_states | `(state_code, case_id)` | кейсы по дополнительным штатам |
| attorney_licenses | `(attorney_id)`, `(state_code, license_status)` | подбор адвокатов |
| attorney_practice_areas | `(practice_area_id, attorney_id)` | обратный поиск |
| bids | `(case_id, status)`, `(attorney_id, status, updated_at DESC)` | биды кейса и "Мои биды" |
| bid_offers | `(bid_id, round_no)` | история торга |
| conversations | `(client_id, last_message_at DESC)`, `(attorney_id, last_message_at DESC)` | список чатов |
| messages | `(conversation_id, created_at DESC)` | сообщения чата |
| notifications | `(user_id, created_at DESC)`; `(user_id)` WHERE `read_at IS NULL` | список и счётчик непрочитанных |
| posts | `(author_id, created_at DESC)` WHERE `status='published' AND deleted_at IS NULL` | профиль автора |
| posts | hash-sharded `(created_at DESC)` WHERE `status='published'` | глобальная лента |
| comments | `(post_id, created_at)`, `(parent_comment_id, created_at)` | комментарии и ответы |
| post_likes | `(user_id, created_at DESC)` | "лайкнутые" |
| follows | PK `(follower_id, followee_id)`; `(followee_id, follower_id)` | подписки и подписчики |
| saved_items | `(user_id, item_type, created_at DESC)` | "Сохранённое" |
| post_tags | `(tag_id, post_id)` | посты по теме |
| sessions | `(user_id)` WHERE `revoked_at IS NULL` | активные устройства |
| user_consents | `(user_id, consent_type, created_at DESC)` | текущее согласие |
| subscriptions | `(status, trial_ends_at)`, `(current_period_end)` | напоминания и просрочки |
| payments | `(user_id, created_at DESC)` | история платежей |
| case_journal | `(case_id, created_at)`, `(client_id, created_at)`, `(retain_until)` | история кейса, экран "История кейсов", очистка после 5 лет |
| contact_issue_reports | `(status, created_at)` | очередь поддержки |
| verification_requests | `(status, submitted_at)` | очередь верификатора |
| reports | `(status, created_at)` | очередь модератора |
| auth_events, audit_log | hash-sharded `(created_at)` + `(user_id, created_at DESC)` | запись без hot-spot, разбор инцидентов |

### 5.3 Поиск (файл 5 использует их)
- Trigram GIN: `attorney_profiles(username_lower)`, вычисляемая колонка `users.full_name_lower` (first_name + ' ' + last_name), `tags(tag_lower)`.
- Full-text: вычисляемая колонка `posts.search_tsv` (`to_tsvector('english', body)`) + GIN; `cases.search_tsv` (title + description) + GIN.
- GIN по массивам: `attorney_profiles(languages)`, `client_profiles(preferred_languages)`.
Поиск реализуется через интерфейс `SearchProvider`, чтобы в будущем заменить реализацию на внешний поисковик без изменения API.

### 5.4 Основной запрос "кейсы, доступные адвокату"
Кейс виден адвокату, если одновременно: `cases.status='open'`, у адвоката есть `attorney_licenses` со `license_status='verified'` в любом из штатов кейса (`case_states`), и `practice_area_id` кейса есть в `attorney_practice_areas` адвоката. Запрос обязан использовать индексы выше, проверяется `EXPLAIN` в тесте (этап 2.7): полный скан таблицы `cases` не допускается.

---

## 6. Целостность и защита данных

### 6.1 CHECK-ограничения
- `bids.round_count BETWEEN 0 AND 5`; `bids.amount_cents >= 0`; `bid_offers.amount_cents >= 0`.
- `cases.budget_cents >= 0`; `(budget_mode='amount') = (budget_cents IS NOT NULL)`.
- `reviews.rating BETWEEN 1 AND 5`.
- `follows.follower_id <> followee_id`.
- Длины: `cases.title ≤ 120`, `cases.description ≤ 5000`, `attorney_profiles.bio ≤ 300`, `posts.body ≤ 2200`, `comments.body ≤ 1000`, `bids.message ≤ 2000`, `reviews.body ≤ 1000`.

### 6.2 Append-only таблицы
`case_journal`, `contact_disclosures`, `audit_log`, `data_access_log`, `auth_events`, `user_consents`.
Реализация: роль БД приложения `lawbid_app` **не имеет** прав `UPDATE` и `DELETE` на эти таблицы (только `INSERT`, `SELECT`). Физическое удаление записей `case_journal` старше `retain_until` выполняет отдельная роль `lawbid_retention` через ежемесячную задачу.

### 6.3 Роли БД
| Роль | Права |
|---|---|
| `lawbid_migrator` | DDL, только в CI/CD при деплое |
| `lawbid_app` | DML на рабочие таблицы, только INSERT/SELECT на append-only |
| `lawbid_retention` | DELETE только на `case_journal` (`retain_until < now()`) |
| `lawbid_readonly` | SELECT для аналитики (без таблиц с документами и контактами) |

### 6.4 Жизненный цикл данных
- **Soft delete кейса:** `deleted_at` + событие в `case_journal`, активные биды получают `rejected_auto`.
- **Удаление аккаунта:** grace period 14 дней (`deletion_requested_at`), затем анонимизация: `first_name/last_name/email/phone/avatar` очищаются или заменяются, `status='deleted'`, `anonymized_at` заполняется, файлы документов удаляются из S3. Строки `users`, `cases`, `bids`, `case_journal` остаются (по FK), журнал хранится 5 лет.
- **Хранение журнала:** 5 лет с момента события, `retain_until` считается при вставке.
- **Токены/сессии/OTP:** истёкшие сессии чистятся раз в сутки.

---

## 7. Миграции и seed

### 7.1 Процесс
- Инструмент: **Prisma Migrate** (`prisma migrate dev` локально, `prisma migrate deploy` в CI/CD).
- Один логический шаг = одна миграция, название `YYYYMMDDHHMM_short_description`. Нельзя править применённые миграции, только новые.
- Raw SQL (частичные, hash-sharded, GIN, trigram индексы, права, computed columns) добавляется в `migration.sql` соответствующей миграции с комментариями.
- **Expand/Contract:** изменения совместимы со старой версией приложения: сначала добавляем (nullable колонка/новая таблица), деплоим код, потом бэкфиллим, потом ужесточаем и только в следующем релизе удаляем старое. `DROP` в том же релизе, что и добавление замены, запрещён.
- Миграции применяются отдельным джобом **до** выката API; при ошибке выкат останавливается.
- Откат данных: только "forward fix" новой миграцией, перед прод-миграцией обязателен свежий бэкап (файл 6).
- CI: проверка `prisma validate`, `prisma migrate diff` (нет расхождения схемы и миграций), прогон всех миграций на чистой Cockroach (testcontainers).

### 7.2 Seed
Идемпотентные скрипты (`upsert`), порядок: `states` → `practice_areas` → `i18n_languages` → `blocked_email_domains` → `feature_flags` → `app_config` → `legal_documents` → `admin`. Повторный запуск не создаёт дублей. Seed запускается автоматически на dev/staging, на prod только вручную по команде.

---

## 8. ЭТАПЫ РЕАЛИЗАЦИИ ФАЙЛА 2

> Этапы 2.1-2.7 выполняются после этапа 1.3 файла 1. После каждого: `prisma validate`, `prisma migrate dev`, `npm run test`, без ошибок.

### Этап 2.1: Основа Prisma, enum, справочники
- Настроить Prisma (provider `cockroachdb`), базовые соглашения, все enum из раздела 2, таблицы `states`, `practice_areas`.
- Seed штатов и практик (`practice_areas.seed.json` по разделу 3.2).
- **Приёмка:** в БД 51 штат, 42 категории и все специализации, коды уникальны и соответствуют правилу генерации, повторный seed не создаёт дублей.

### Этап 2.2: Пользователи, auth, согласия, файлы, конфигурация, переводы
- Таблицы 4.A и 4.B. Согласовать с уже созданными на этапе 1.3.
- **Приёмка:** уникальность email/телефона (несколько NULL допускаются), UQ идентификаторов, создание сессии и события auth в тесте.

### Этап 2.3: Профили, лицензии, верификация
- Таблицы 4.C.
- **Приёмка:** нельзя привязать один `bar_number` штата к двум адвокатам; `username_lower` уникален без учёта регистра.

### Этап 2.4: Кейсы, биды, торг, журнал, контакты, споры, отзывы
- Таблицы 4.D и 4.E, CHECK-ограничения раздела 6.1.
- **Приёмка (интеграционные тесты):** один бид от адвоката на кейс; `round_count` больше 5 отклоняется; кейс не создаётся более чем с 3 штатами и без основного; запись в `case_journal` создаётся вместе с изменением кейса в одной транзакции; попытка UPDATE/DELETE журнала под `lawbid_app` отклоняется.

### Этап 2.5: Лента, чаты, уведомления, подписки, модерация, аудит
- Таблицы 4.F, 4.G, 4.H, 4.I, 4.J.
- **Приёмка:** уникальность `client_message_id`; `stripe_webhook_events` не принимает повторное событие; лайк идемпотентен (повтор не создаёт дубль).

### Этап 2.6: Raw SQL: индексы, computed columns, права
- Все индексы из раздела 5 (partial, hash-sharded, GIN, trigram, tsvector), роли и права из 6.2-6.3.
- **Приёмка:** `EXPLAIN` запросов из 5.2 и 5.4 использует индексы; поиск по имени/тегу/тексту возвращает ожидаемый результат; права ролей проверены тестом.

### Этап 2.7: Тесты, `withTxRetry`, документация
- Хелпер `withTxRetry()` с тестом на искусственный `40001`.
- Тест доступности кейсов по лицензии и практике (5.4).
- Генерация `docs/db/ERD.md` (Mermaid) из `schema.prisma`.
- **Приёмка:** CI зелёный, миграции применяются на чистой БД и на БД из предыдущей версии.

---

## 9. Критерии готовности файла 2 (Definition of Done)

- [ ] Все этапы 2.1-2.7 выполнены, приёмки пройдены
- [ ] `prisma validate` и `prisma migrate diff` без расхождений
- [ ] Все таблицы, enum и индексы из этого файла есть в БД, лишних нет
- [ ] Seed идемпотентен, справочники соответствуют разделу 3
- [ ] Append-only защита проверена тестом под ролью `lawbid_app`
- [ ] Нет последовательных ID, нет `ON DELETE CASCADE` на юридически значимых таблицах
- [ ] `docs/db/ERD.md` создан
- [ ] Нет TODO без ссылки на этап/файл ТЗ

---

**Конец файла 2. Следующий файл 3: верификация адвокатов, профили клиента и адвоката, отзывы.**
