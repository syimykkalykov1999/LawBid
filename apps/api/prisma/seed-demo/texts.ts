/**
 * Demo seed texts (EN + RU). All invented. Limits mirror the DB CHECKs:
 * title ≤ 120, body ≤ 2200.
 */

export type CardStyle = 'lawbid' | 'photo' | 'text' | 'video' | 'doc';

export interface DemoPostSpec {
  /** Stable key: the post id derives from it, so re-runs never duplicate. */
  key: string;
  /** Author username (one of the demo attorneys). */
  author: string;
  style: CardStyle;
  kind?: 'post' | 'news';
  lang: 'en' | 'ru';
  title?: string;
  body: string;
  /** Leaf practice code (LawBid card). */
  practice?: string;
  /** Photos: 1 = single, 2..9 = carousel. */
  photos?: number;
  ratio?: 'portrait' | 'square' | 'wide';
  location?: string;
  comments?: boolean;
  legal?: boolean;
  /** Attach a PDF document. */
  pdf?: boolean;
  /** Attach several documents by file name (.pdf or .docx). */
  docs?: string[];
  /** Publish this long ago instead of the spread-out default (newest). */
  minutesAgo?: number;
}

const PAD_EN =
  ' This paragraph is deliberately long: it checks that the card, the full post and the share preview truncate and scroll text correctly, keep line breaks and never push the buttons off the screen.';
const PAD_RU =
  ' Этот абзац намеренно длинный: он проверяет, что карточка, полный пост и превью для отправки правильно обрезают и прокручивают текст, держат переносы строк и не выталкивают кнопки за экран.';

/** Exactly `n` characters, ending on a full stop. */
function fill(base: string, pad: string, n: number): string {
  let s = base;
  while (s.length < n) s += pad;
  s = s.slice(0, n - 1).trimEnd();
  return s + '.';
}

export const MAX_TITLE_EN =
  'Everything you wanted to know about retainers, hourly rates, flat fees and contingency, explained without legalese'.padEnd(
    119,
    '.',
  ) + '!';
export const MAX_TITLE_RU =
  'Всё, что вы хотели знать о гонораре адвоката: почасовая оплата, фиксированная сумма и процент от выигрыша — без юридических терминов'.slice(
    0,
    119,
  ) + '!';

export const DEMO_POSTS: readonly DemoPostSpec[] = [
  // ---- LawBid card, everything at once: the owner's «full stuffing» ------
  {
    key: 'lb-full',
    author: 'sofia.hernandez',
    style: 'lawbid',
    lang: 'en',
    title:
      'Marriage green card, step by step: the evidence file, the interview and what to do when an officer asks for more',
    body: 'A marriage green card is won on paper before the interview. Build one folder: joint lease or mortgage, shared bank statements, insurance policies naming each other, photos across several years and messages that show daily life. Bring originals and one clean set of copies, answer short and honest, and ask the officer to repeat anything unclear. If you get a request for evidence, answer every point inside the deadline and add a short cover letter. #greencard #familylaw #dui #realestate',
    practice: 'immigration.green_card',
    photos: 5,
    ratio: 'square',
    legal: true,
    docs: [
      'Green_card_evidence_checklist.pdf',
      'Marriage_evidence_list.pdf',
      'Affidavit_of_support_sample.docx',
    ],
    minutesAgo: 20,
  },
  // ---- LawBid card, almost empty: no title and no text / short -----------
  {
    key: 'lb-photo-only',
    author: 'sofia.hernandez',
    style: 'lawbid',
    lang: 'en',
    body: '',
    practice: 'immigration.green_card',
    photos: 1,
    ratio: 'square',
    legal: true,
  },
  {
    key: 'lb-short-title',
    author: 'sofia.hernandez',
    style: 'lawbid',
    lang: 'en',
    title: 'Bring originals',
    body: 'Copies are never enough at the interview.',
    practice: 'immigration.green_card',
    photos: 1,
    ratio: 'portrait',
    legal: true,
  },
  // ---- LawBid card: practice + photo -------------------------------------
  {
    key: 'lb-divorce-checklist',
    author: 'emily.carter',
    style: 'lawbid',
    lang: 'en',
    title: 'Divorce checklist: the 7 documents to gather this week',
    body: 'Tax returns (3 years), pay stubs, bank and brokerage statements, the mortgage or lease, retirement account statements, insurance policies and a list of monthly expenses. Put them in one folder before you meet your attorney: it saves hours of billable time. #divorce #familylaw',
    practice: 'family_law.divorce',
    photos: 1,
    ratio: 'portrait',
    location: 'Brooklyn, NY',
    legal: true,
  },
  {
    key: 'lb-greencard-ru',
    author: 'sofia.hernandez',
    style: 'lawbid',
    lang: 'ru',
    title: 'Грин-карта через брак: что проверяют на собеседовании',
    body: 'Подлинность брака подтверждают совместные счета, договор аренды, фотографии за разные годы и переписка. Приходите на собеседование с оригиналами и копиями, отвечайте коротко и честно. Если вопрос непонятен, просите повторить. #immigration #greencard',
    practice: 'immigration.green_card',
    photos: 1,
    ratio: 'square',
    legal: true,
  },
  {
    key: 'lb-dui-stop',
    author: 'marcus.reed',
    style: 'lawbid',
    lang: 'en',
    title: 'First DUI stop: what you can and cannot refuse',
    body: 'You may decline roadside field tests in many states, but refusing the chemical test can suspend your license. Be polite, do not argue, and write down everything you remember as soon as you are home. #dui #criminaldefense',
    practice: 'dui_and_dwi.first_offense_dui',
    photos: 3,
    ratio: 'portrait',
    legal: true,
  },
  {
    key: 'lb-car-accident',
    author: 'james.whitfield',
    style: 'lawbid',
    lang: 'en',
    title: 'After a car accident: photos that win cases',
    body: 'Photograph all four corners of every vehicle, the plates, the road, signs, skid marks and your injuries in the next days. Date-stamped pictures beat memory every time. #personalinjury #caraccident',
    practice: 'personal_injury.car_accident',
    photos: 9,
    ratio: 'square',
    location: 'Houston, TX',
    legal: true,
  },
  {
    key: 'lb-llc-ru',
    author: 'priya.natarajan',
    style: 'lawbid',
    lang: 'ru',
    title: 'ООО или LLC? Как выбрать форму бизнеса в США',
    body: 'Для одного владельца чаще всего подходит LLC: простая отчётность и защита личного имущества. Но налоги зависят от штата. Сначала консультация, потом регистрация. #smallbusiness #llc #бизнес',
    practice: 'business_and_corporate.business_formation',
    photos: 1,
    ratio: 'wide',
    legal: true,
  },
  {
    key: 'lb-deposit',
    author: 'rachel.goldstein',
    style: 'lawbid',
    lang: 'en',
    title: 'Landlord kept your deposit? Send this letter first',
    body: 'A dated demand letter citing the statute and a 14-day deadline resolves most deposit disputes before court. Attach photos of the move-out condition. #landlordtenant #securitydeposit',
    practice: 'landlord_and_tenant.security_deposit_disputes',
    photos: 2,
    ratio: 'portrait',
    legal: true,
    pdf: true,
  },

  // ---- Instagram card: photo, no practice --------------------------------
  {
    key: 'ig-office-day',
    author: 'emily.carter',
    style: 'photo',
    lang: 'en',
    body: 'A quiet Friday at the office: closing files, signing orders and thanking the clients who trusted us this month. Back on Monday. #lawyerlife',
    photos: 1,
    ratio: 'portrait',
    location: 'New York, NY',
    legal: false,
  },
  {
    key: 'ig-conference-ru',
    author: 'sofia.hernandez',
    style: 'photo',
    lang: 'ru',
    body: 'С конференции по иммиграционному праву: новые правила, живые кейсы и много кофе. Делюсь выводами в следующих постах!',
    photos: 5,
    ratio: 'square',
    location: 'Miami, FL',
    legal: false,
  },
  {
    key: 'ig-carousel-max',
    author: 'grace.kim',
    style: 'photo',
    lang: 'en',
    body: 'Nine slides, one story: how a small-business client went from a handshake deal to a clean contract. Swipe to the end. #contracts #smallbusiness',
    photos: 9,
    ratio: 'portrait',
    legal: true,
  },
  {
    key: 'ig-wide',
    author: 'thomas.brennan',
    style: 'photo',
    lang: 'en',
    body: 'Courthouse steps, 7:40 a.m. Preparation is the quiet part of the job.',
    photos: 1,
    ratio: 'wide',
    comments: false,
    legal: false,
  },
  {
    key: 'ig-team',
    author: 'michael.sullivan',
    style: 'photo',
    lang: 'en',
    body: 'Meet the team that makes the paperwork disappear. Paralegals, assistants and one very patient office manager.',
    photos: 4,
    ratio: 'square',
    legal: false,
  },

  // ---- Threads card: text only -------------------------------------------
  // ---- Threads cards for the card review (owner 2026-10-12) ---------------
  {
    key: 'th-sofia-paragraphs',
    author: 'sofia.hernandez',
    style: 'text',
    lang: 'en',
    body: 'What to do the week before a green card interview.\n\nFirst, rebuild the folder. Put the newest documents on top: lease or mortgage, bank statements, insurance, utility bills. One page per fact, no duplicates.\n\nSecond, sit down together and tell the story of the relationship out loud, from the first meeting to today. Do not memorise answers. Just remember the dates and the places.\n\nThird, plan the day. Arrive early, bring originals and one clean set of copies, and keep your phone in your pocket.\n\nIf anything in the file changed this year, a new address, a new job, a baby, bring the proof of that too. Officers like to see that the folder is alive.\n\n#greencard #interview',
    legal: true,
    minutesAgo: 3,
  },
  {
    key: 'th-sofia-one-line',
    author: 'sofia.hernandez',
    style: 'text',
    lang: 'en',
    body: 'Bring originals. Always.',
    legal: true,
    minutesAgo: 8,
  },
  {
    key: 'th-sofia-medium',
    author: 'sofia.hernandez',
    style: 'text',
    lang: 'en',
    body: 'Three things I tell every family-based green card client before the interview:\n\n1. Read your own file again the night before.\n2. Answer only the question asked.\n3. If you do not know, say so. A guess is worse than a pause.',
    legal: true,
    minutesAgo: 9,
  },
  {
    key: 'th-sofia-long',
    author: 'sofia.hernandez',
    style: 'text',
    lang: 'en',
    body: 'A request for evidence is not a denial. It is the officer telling you exactly what is missing, and you usually get 87 days to answer. Read every line of the notice, make a checklist, gather one document per point, add a short cover letter that maps each document to the point it answers, and send it as a single package with the notice on top. Do not send more than they asked for, and do not wait for the last day. Officers who see a clean, organised response approve far more often than officers who see a pile of paper. If you are unsure which point a document answers, ask your attorney before you send it, not after. #greencard #immigration #rfe',
    legal: true,
    minutesAgo: 10,
  },
  {
    key: 'th-sofia-essay-long',
    author: 'sofia.hernandez',
    style: 'text',
    lang: 'en',
    body: fill(
      'How a marriage green card case really runs, start to finish. First comes the petition: the citizen spouse files the I-130 and the foreign spouse files the I-485, usually together. Then biometrics, then a long quiet period, then an interview notice. Use the quiet period well: rebuild the evidence folder every month, because the interview is decided by what is in it. Joint lease or mortgage, shared bank statements, insurance naming each other, photos across years, messages that show daily life, and two or three short letters from people who know the couple. On the day, arrive early, bring originals and one clean set of copies, answer only the question asked and ask to repeat anything unclear.',
      ' If the officer issues a request for evidence, treat it as a checklist and not as a warning: answer every point inside the deadline, label every exhibit, and add a one-page cover letter that maps documents to points. Keep a copy of everything you send and a delivery receipt.',
      3000,
    ),
    legal: true,
    minutesAgo: 12,
  },
  {
    key: 'th-sofia-practice',
    author: 'sofia.hernandez',
    style: 'text',
    lang: 'en',
    body: 'Marriage green card: the evidence folder matters more than the interview. Joint lease, shared accounts, photos across the years. #greencard #marriage',
    practice: 'immigration.green_card',
    legal: true,
    minutesAgo: 11,
  },
  {
    key: 'th-short',
    author: 'daniel.okafor',
    style: 'text',
    lang: 'en',
    body: 'Hot take: a good attorney tells you what NOT to sue over. #legaltips',
    legal: true,
  },
  {
    key: 'th-short-ru',
    author: 'victor.alvarez',
    style: 'text',
    lang: 'ru',
    body: 'Подписали договор не читая? Вернуться к нему можно, но дороже. Читайте до подписи, а лучше покажите юристу.',
    legal: true,
  },
  {
    key: 'th-long-en',
    author: 'hannah.lindqvist',
    style: 'text',
    lang: 'en',
    title: MAX_TITLE_EN,
    body: fill(
      'How legal fees work. A retainer is an advance deposit against future hourly work, a flat fee covers a defined task, and contingency means the attorney is paid a percentage only if you win. Ask which one applies, what is excluded, and how often you will be billed.',
      PAD_EN,
      2200,
    ),
    legal: true,
  },
  {
    key: 'th-long-ru',
    author: 'aisha.mohammed',
    style: 'text',
    lang: 'ru',
    title: MAX_TITLE_RU,
    body: fill(
      'Как устроен гонорар адвоката. Ретейнер — это аванс под будущую почасовую работу, фиксированная сумма покрывает конкретную задачу, а процент от выигрыша выплачивается только в случае успеха. Спросите, какой вариант у вас, что в него не входит и как часто будут выставляться счета.',
      PAD_RU,
      2200,
    ),
    legal: true,
  },
  {
    key: 'th-multiline',
    author: 'andre.baptiste',
    style: 'text',
    lang: 'en',
    body: 'Three questions before you hire any attorney:\n\n1. Have you handled a case like mine?\n2. Who will actually work on it?\n3. How will we communicate, and how fast?\n\nWrite the answers down. Compare. Then decide. #hiringalawyer',
    legal: true,
  },
  {
    key: 'th-nocomments',
    author: 'james.whitfield',
    style: 'text',
    lang: 'en',
    body: 'Comments are off on this one: a reminder that a social post is never legal advice for your situation.',
    comments: false,
    legal: false,
  },

  // ---- News ---------------------------------------------------------------
  {
    key: 'news-immigration',
    author: 'sofia.hernandez',
    style: 'lawbid',
    kind: 'news',
    lang: 'en',
    title: 'News: new filing fees for family-based petitions',
    body: 'USCIS has published an updated fee schedule. Petitions filed after the effective date must include the new amounts or they will be rejected. Check the form edition date before you mail anything. #immigration #news',
    practice: 'immigration.green_card',
    photos: 1,
    ratio: 'wide',
    legal: true,
  },
  {
    key: 'news-employment-ru',
    author: 'priya.natarajan',
    style: 'lawbid',
    kind: 'news',
    lang: 'ru',
    title: 'Новости: запрет на соглашения о неконкуренции в штатах',
    body: 'Несколько штатов ограничили применение соглашений о неконкуренции. Если вам предлагают подписать такое соглашение, сначала проверьте, действует ли оно в вашем штате. #employment #новости',
    practice: 'employment_and_labor.employment_contracts_and_severance',
    legal: true,
  },

  // ---- Documents ----------------------------------------------------------
  {
    key: 'doc-lease-checklist',
    author: 'rachel.goldstein',
    style: 'doc',
    lang: 'en',
    title: 'Lease review checklist (PDF)',
    body: 'A one-page checklist: rent increases, early termination, subletting, repairs and deposit return. Download, print and mark it up before you sign. #lease #realestate',
    practice: 'real_estate.hoa_disputes',
    pdf: true,
    legal: true,
  },
  {
    key: 'doc-will-ru',
    author: 'thomas.brennan',
    style: 'doc',
    lang: 'ru',
    title: 'Памятка: что нужно для составления завещания',
    body: 'Список имущества, данные наследников, назначение исполнителя и опекуна для детей. Распечатайте памятку и принесите на консультацию. #завещание',
    practice: 'estate_planning_and_probate.trusts',
    photos: 1,
    ratio: 'portrait',
    pdf: true,
    legal: true,
  },

  // ---- Reels (video). Stubs: need a Bunny library to actually play --------
  {
    key: 'video-know-rights',
    author: 'marcus.reed',
    style: 'video',
    lang: 'en',
    title: 'Know your rights in 30 seconds',
    body: 'Short, calm and practical: the three sentences to remember if you are stopped. #knowyourrights #criminaldefense',
    practice: 'dui_and_dwi.first_offense_dui',
    location: 'Austin, TX',
    legal: true,
  },
  {
    key: 'video-visa-ru',
    author: 'sofia.hernandez',
    style: 'video',
    lang: 'ru',
    title: 'Рабочая виза за минуту',
    body: 'Какие визы бывают для работы в США и с чего начать. #immigration #виза',
    legal: true,
  },
  // Three reels for the card review (owner 2026-10-12): everything, a little,
  // nothing but the video. Newest in the feed.
  {
    key: 'video-full',
    author: 'sofia.hernandez',
    style: 'video',
    lang: 'en',
    title:
      'Marriage green card interview in two minutes: what to bring, what to say and what to do if the officer asks for more evidence',
    body: 'A short walk through the day of the interview. Originals and one clean set of copies, joint lease or mortgage, shared bank statements, photos across several years. Answer short and honest, ask to repeat anything unclear. If you get a request for evidence, answer every point inside the deadline with a cover letter. #greencard #familylaw #dui #realestate',
    practice: 'immigration.green_card',
    legal: true,
    docs: [
      'Interview_day_checklist.pdf',
      'Evidence_cover_letter.docx',
      'Joint_account_statement_sample.pdf',
    ],
    minutesAgo: 5,
  },
  {
    key: 'video-short',
    author: 'sofia.hernandez',
    style: 'video',
    lang: 'en',
    title: 'Keep copies',
    body: 'Never hand over your only original.',
    practice: 'immigration.green_card',
    legal: true,
    minutesAgo: 6,
  },
  {
    key: 'video-bare',
    author: 'sofia.hernandez',
    style: 'video',
    lang: 'en',
    body: '',
    legal: false,
    minutesAgo: 7,
  },
  {
    key: 'video-office-tour',
    author: 'emily.carter',
    style: 'video',
    lang: 'en',
    body: 'A 20-second office tour. No legal advice, just coffee. #lawyerlife',
    legal: false,
  },
];

export const COMMENT_BODIES: Record<'en' | 'ru', readonly string[]> = {
  en: [
    'Really useful, thank you!',
    'Saved this for later.',
    'Does this also apply in California?',
    'My attorney said the same thing last week.',
    'Could you do a follow-up on the deadlines?',
    'Great explanation. Short and clear.',
    'I wish I had read this a year ago.',
    'Sharing with my sister, she needs this.',
    'Is a consultation free?',
    'This is exactly the question I had. Thanks for answering it before I asked.',
    'Honest question: what if the other side does not respond at all?',
    'Love the practical tone.',
  ],
  ru: [
    'Очень полезно, спасибо!',
    'Сохранила, чтобы вернуться.',
    'А в Калифорнии это тоже работает?',
    'Мой адвокат сказал то же самое.',
    'Можно продолжение про сроки?',
    'Коротко и понятно, отличный разбор.',
    'Жаль, что не прочитал это год назад.',
    'Отправлю сестре, ей пригодится.',
    'Первая консультация бесплатная?',
    'Именно этот вопрос я хотел задать. Спасибо, что ответили заранее.',
  ],
};

export const REPLY_BODIES: Record<'en' | 'ru', readonly string[]> = {
  en: [
    'Glad it helps! Rules differ by state, so check yours.',
    'Yes, message me and we will talk it through.',
    'Good idea, a follow-up is coming.',
    'Thank you for reading!',
  ],
  ru: [
    'Рада, что полезно! В разных штатах правила отличаются.',
    'Да, напишите мне, обсудим.',
    'Хорошая идея, продолжение будет.',
    'Спасибо, что читаете!',
  ],
};

/** A comment at the 1000-char limit, for truncation checks. */
export const LONG_COMMENT_EN = fill(
  'Long comment: this one is here to check that the comment list wraps, truncates with "more" and keeps the like button visible.',
  PAD_EN,
  1000,
);
