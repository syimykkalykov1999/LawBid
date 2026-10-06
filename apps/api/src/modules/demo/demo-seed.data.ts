/**
 * Owner 2026-10-05 («Продвижение» → demo world): the names and texts the
 * demo seed (`demo-seed.ts`) fills the demo database with. Everything here
 * is invented — no real attorney, firm, client or case. Kept apart from
 * the seed logic so the texts can be edited without touching the code.
 */

export interface DemoAttorneySpec {
  first: string;
  last: string;
  username: string;
  firm: string;
  city: string;
  /** Primary licence state (also the profile's "home" state). */
  state: string;
  /** A second licence, when the attorney has one. */
  secondState?: string;
  bio: string;
  languages: string[];
  /** Leaf practice-area codes (fallback: random leaves when missing). */
  practices: string[];
  ratingAvg: number;
  ratingCount: number;
}

export interface DemoClientSpec {
  first: string;
  last: string;
  city: string;
  state: string;
  languages: string[];
}

export type DemoCaseStage = 'open' | 'in_progress' | 'closed';

export interface DemoCaseSpec {
  title: string;
  description: string;
  practice: string;
  state: string;
  city: string;
  /** null = "clarify later". */
  budgetCents: number | null;
  urgency:
    'flexible' | 'within_month' | 'soon' | 'urgent' | 'very_urgent' | 'by_date';
  /** Only for `by_date`: what the date is. */
  deadlineKind?:
    'court_hearing' | 'filing_deadline' | 'meeting' | 'signing' | 'other';
  /** Only for `by_date`: days from `now`. */
  deadlineInDays?: number;
  stage: DemoCaseStage;
  /** How many attorneys bid. */
  bids: number;
}

export const DEMO_ATTORNEYS: readonly DemoAttorneySpec[] = [
  {
    first: 'Emily',
    last: 'Carter',
    username: 'emily.carter',
    firm: 'Carter & Associates',
    city: 'New York',
    state: 'NY',
    secondState: 'CA',
    bio: 'Family and immigration attorney with 14 years in practice. I take the time to explain every option in plain English and answer messages the same day.',
    languages: ['en', 'es'],
    practices: [
      'family_law.divorce',
      'family_law.child_custody',
      'immigration.green_card',
      'immigration.citizenship_and_naturalization',
    ],
    ratingAvg: 4.9,
    ratingCount: 120,
  },
  {
    first: 'Marcus',
    last: 'Reed',
    username: 'marcus.reed',
    firm: 'Reed Defense Group',
    city: 'Los Angeles',
    state: 'CA',
    bio: 'Former deputy district attorney, now defending clients in state and federal court. DUI, drug charges and felonies. Free first call.',
    languages: ['en'],
    practices: [
      'criminal_defense.felony',
      'criminal_defense.drug_offenses',
      'dui_and_dwi.first_offense_dui',
    ],
    ratingAvg: 4.8,
    ratingCount: 86,
  },
  {
    first: 'Priya',
    last: 'Natarajan',
    username: 'priya.natarajan',
    firm: 'Natarajan Immigration Law',
    city: 'Houston',
    state: 'TX',
    bio: 'Immigration only: green cards, citizenship, work visas and removal defense. Fluent in Hindi, Tamil and Spanish.',
    languages: ['en', 'hi', 'es'],
    practices: [
      'immigration.employment_visas',
      'immigration.citizenship_and_naturalization',
      'immigration.deportation_and_removal_defense',
    ],
    ratingAvg: 4.9,
    ratingCount: 64,
  },
  {
    first: 'Daniel',
    last: 'Okafor',
    username: 'daniel.okafor',
    firm: 'Okafor Injury Law',
    city: 'Chicago',
    state: 'IL',
    bio: 'Personal injury trial lawyer. Car, truck and rideshare accidents, slip and fall. No fee unless we win.',
    languages: ['en'],
    practices: [
      'personal_injury.car_accident',
      'personal_injury.truck_accident',
      'personal_injury.slip_and_fall',
      'personal_injury.rideshare_accident',
    ],
    ratingAvg: 4.7,
    ratingCount: 51,
  },
  {
    first: 'Sofia',
    last: 'Hernandez',
    username: 'sofia.hernandez',
    firm: 'Hernandez Family Law',
    city: 'Miami',
    state: 'FL',
    bio: 'Divorce, custody and support. Bilingual practice, flat fees on uncontested matters, mediation before litigation whenever it makes sense.',
    languages: ['en', 'es'],
    practices: [
      'family_law.divorce',
      'family_law.child_support',
      'family_law.alimony_and_spousal_support',
    ],
    ratingAvg: 4.8,
    ratingCount: 73,
  },
  {
    first: 'James',
    last: 'Whitfield',
    username: 'james.whitfield',
    firm: 'Whitfield Business Counsel',
    city: 'Austin',
    state: 'TX',
    bio: 'Outside general counsel for startups and small businesses: formation, contracts, fundraising and founder disputes.',
    languages: ['en'],
    practices: [
      'business_and_corporate.business_formation',
      'business_and_corporate.contracts',
      'business_and_corporate.startups_and_venture_capital',
    ],
    ratingAvg: 4.6,
    ratingCount: 38,
  },
  {
    first: 'Hannah',
    last: 'Lindqvist',
    username: 'hannah.lindqvist',
    firm: 'Lindqvist Estate Planning',
    city: 'Seattle',
    state: 'WA',
    bio: 'Wills, trusts and probate for families who want things settled quietly. Evening video appointments available.',
    languages: ['en', 'sv'],
    practices: [
      'estate_planning_and_probate.wills',
      'estate_planning_and_probate.trusts',
      'estate_planning_and_probate.probate_administration',
    ],
    ratingAvg: 4.9,
    ratingCount: 44,
  },
  {
    first: 'Andre',
    last: 'Baptiste',
    username: 'andre.baptiste',
    firm: 'Baptiste Law PLLC',
    city: 'Brooklyn',
    state: 'NY',
    bio: 'Tenants and small landlords in New York City: evictions, lease disputes, security deposits and housing court.',
    languages: ['en', 'fr', 'ht'],
    practices: [
      'landlord_and_tenant.eviction_defense',
      'landlord_and_tenant.lease_review_and_disputes',
      'landlord_and_tenant.security_deposit_disputes',
    ],
    ratingAvg: 4.7,
    ratingCount: 59,
  },
  {
    first: 'Rachel',
    last: 'Goldstein',
    username: 'rachel.goldstein',
    firm: 'Goldstein Employment Law',
    city: 'San Francisco',
    state: 'CA',
    bio: 'I represent employees only: wrongful termination, discrimination, unpaid wages and severance negotiations.',
    languages: ['en'],
    practices: [
      'employment_and_labor.wrongful_termination',
      'employment_and_labor.workplace_discrimination',
      'employment_and_labor.wage_and_hour',
      'employment_and_labor.employment_contracts_and_severance',
    ],
    ratingAvg: 4.8,
    ratingCount: 67,
  },
  {
    first: 'Victor',
    last: 'Alvarez',
    username: 'victor.alvarez',
    firm: 'Alvarez Real Estate Law',
    city: 'Phoenix',
    state: 'AZ',
    bio: 'Residential and commercial real estate: closings, title problems, HOA fights and boundary disputes.',
    languages: ['en', 'es'],
    practices: [
      'real_estate.residential_purchase_and_sale',
      'real_estate.hoa_disputes',
      'real_estate.boundary_and_easement_disputes',
    ],
    ratingAvg: 4.6,
    ratingCount: 29,
  },
  {
    first: 'Grace',
    last: 'Kim',
    username: 'grace.kim',
    firm: 'Kim IP Partners',
    city: 'San Jose',
    state: 'CA',
    bio: 'Trademarks, copyright and licensing for creators and tech companies. Former in-house counsel at a SaaS company.',
    languages: ['en', 'ko'],
    practices: [
      'intellectual_property.trademarks',
      'intellectual_property.copyright',
      'intellectual_property.licensing',
    ],
    ratingAvg: 4.9,
    ratingCount: 41,
  },
  {
    first: 'Thomas',
    last: 'Brennan',
    username: 'thomas.brennan',
    firm: 'Brennan Traffic Defense',
    city: 'Denver',
    state: 'CO',
    bio: 'Traffic tickets and DUI defense across Colorado. Most tickets handled without you ever going to court.',
    languages: ['en'],
    practices: [
      'traffic_tickets.speeding',
      'traffic_tickets.reckless_driving',
      'dui_and_dwi.dmv_license_suspension_hearing',
    ],
    ratingAvg: 4.7,
    ratingCount: 112,
  },
  {
    first: 'Aisha',
    last: 'Mohammed',
    username: 'aisha.mohammed',
    firm: 'Mohammed & Partners',
    city: 'Atlanta',
    state: 'GA',
    bio: 'Debt relief and consumer protection: creditor harassment, garnishment, repossession and credit report errors.',
    languages: ['en', 'ar'],
    practices: [
      'bankruptcy_and_debt.debt_settlement',
      'bankruptcy_and_debt.wage_garnishment',
      'bankruptcy_and_debt.credit_report_disputes',
    ],
    ratingAvg: 4.8,
    ratingCount: 35,
  },
  {
    first: 'Michael',
    last: 'Sullivan',
    username: 'michael.sullivan',
    firm: 'Sullivan Litigation',
    city: 'Boston',
    state: 'MA',
    secondState: 'NY',
    bio: 'Commercial and contract litigation for businesses and individuals. Twenty years of trials, arbitrations and settlements.',
    languages: ['en'],
    practices: [
      'civil_litigation.contract_disputes',
      'business_and_corporate.commercial_litigation',
      'business_and_corporate.partnership_and_shareholder_disputes',
    ],
    ratingAvg: 4.7,
    ratingCount: 48,
  },
];

export const DEMO_CLIENTS: readonly DemoClientSpec[] = [
  {
    first: 'Olivia',
    last: 'Bennett',
    city: 'New York',
    state: 'NY',
    languages: ['en'],
  },
  {
    first: 'Ethan',
    last: 'Morales',
    city: 'Los Angeles',
    state: 'CA',
    languages: ['en', 'es'],
  },
  {
    first: 'Ava',
    last: 'Patel',
    city: 'Houston',
    state: 'TX',
    languages: ['en', 'gu'],
  },
  {
    first: 'Liam',
    last: 'Johnson',
    city: 'Chicago',
    state: 'IL',
    languages: ['en'],
  },
  {
    first: 'Isabella',
    last: 'Rossi',
    city: 'Miami',
    state: 'FL',
    languages: ['en', 'it'],
  },
  {
    first: 'Noah',
    last: 'Williams',
    city: 'Austin',
    state: 'TX',
    languages: ['en'],
  },
  {
    first: 'Mia',
    last: 'Nguyen',
    city: 'Seattle',
    state: 'WA',
    languages: ['en', 'vi'],
  },
  {
    first: 'Lucas',
    last: 'Thompson',
    city: 'Brooklyn',
    state: 'NY',
    languages: ['en'],
  },
  {
    first: 'Charlotte',
    last: 'Davis',
    city: 'San Francisco',
    state: 'CA',
    languages: ['en'],
  },
  {
    first: 'Benjamin',
    last: 'Garcia',
    city: 'Phoenix',
    state: 'AZ',
    languages: ['en', 'es'],
  },
  {
    first: 'Amelia',
    last: 'Clark',
    city: 'Denver',
    state: 'CO',
    languages: ['en'],
  },
  {
    first: 'Henry',
    last: 'Washington',
    city: 'Atlanta',
    state: 'GA',
    languages: ['en'],
  },
];

/** The assistant who already works in the showcase attorney's account. */
export const DEMO_WORLD_ASSISTANT = { first: 'Jordan', last: 'Lee' } as const;

export const DEMO_CASES: readonly DemoCaseSpec[] = [
  // --- open -------------------------------------------------------------
  {
    title: 'Uncontested divorce, no kids, small shared savings',
    description:
      'My spouse and I have agreed on everything: we have no children, we rent, and we only need to split a joint savings account and one car. We want a lawyer to prepare and file the paperwork correctly so the court accepts it the first time. Both of us live in Queens. Looking for a flat fee if possible.',
    practice: 'family_law.divorce',
    state: 'NY',
    city: 'New York',
    budgetCents: 250000,
    urgency: 'within_month',
    stage: 'open',
    bids: 4,
  },
  {
    title: 'Rear-ended on I-10, insurer offering far too little',
    description:
      "I was stopped at a light on I-10 when a pickup hit me from behind. ER visit, three months of physical therapy, still have neck pain. The other driver's insurer offered $4,800 which does not even cover my medical bills. I have the police report, photos and all medical records. Need an attorney to negotiate or sue.",
    practice: 'personal_injury.car_accident',
    state: 'CA',
    city: 'Los Angeles',
    budgetCents: null,
    urgency: 'soon',
    stage: 'open',
    bids: 5,
  },
  {
    title: 'H-1B to green card: employer agreed to sponsor',
    description:
      'I have been on an H-1B for four years with the same employer in Houston. They have agreed to sponsor my green card (EB-2) and want me to find the attorney. I need someone who will handle PERM, I-140 and I-485 and keep both me and HR updated on timelines.',
    practice: 'immigration.employment_visas',
    state: 'TX',
    city: 'Houston',
    budgetCents: 600000,
    urgency: 'flexible',
    stage: 'open',
    bids: 3,
  },
  {
    title: 'Landlord keeping $3,200 deposit for "normal wear"',
    description:
      'Moved out of a Brooklyn apartment after four years. The landlord is keeping the entire deposit for repainting and carpet cleaning, and sent no itemized list within the required time. I have move-in and move-out photos. I want the deposit back and would like to know if I can claim more.',
    practice: 'landlord_and_tenant.security_deposit_disputes',
    state: 'NY',
    city: 'Brooklyn',
    budgetCents: 80000,
    urgency: 'flexible',
    stage: 'open',
    bids: 3,
  },
  {
    title: 'Fired two weeks after reporting harassment to HR',
    description:
      'I reported my manager for repeated inappropriate comments to HR in writing. Fourteen days later I was let go for "performance" with no prior warnings and great reviews. I have emails, the HR complaint and my review history. Need an employment attorney in the Bay Area.',
    practice: 'employment_and_labor.retaliation_and_whistleblower',
    state: 'CA',
    city: 'San Francisco',
    budgetCents: null,
    urgency: 'urgent',
    stage: 'open',
    bids: 4,
  },
  {
    title: 'Court hearing in 12 days for a speeding ticket (38 over)',
    description:
      'Got a ticket for 38 mph over the limit on I-70. The court date is in under two weeks and I was told this could be reckless driving with points and a possible suspension. I have a clean record and drive for work. Need someone who can appear for me or come with me.',
    practice: 'traffic_tickets.speeding',
    state: 'CO',
    city: 'Denver',
    budgetCents: 90000,
    urgency: 'by_date',
    deadlineKind: 'court_hearing',
    deadlineInDays: 12,
    stage: 'open',
    bids: 3,
  },
  {
    title: 'Register a trademark for my coffee brand before launch',
    description:
      'Launching a packaged cold-brew brand in two months. The name and logo are done. I want a clearance search and a federal trademark application for the word mark and the logo, and advice on what classes to file in.',
    practice: 'intellectual_property.trademarks',
    state: 'CA',
    city: 'San Jose',
    budgetCents: 200000,
    urgency: 'within_month',
    stage: 'open',
    bids: 3,
  },
  {
    title: 'HOA fining me $100/day for a fence they approved',
    description:
      'My HOA approved my fence in writing last year. A new board now says it is two inches too tall and has started daily fines. I have the approval letter. I need a lawyer to stop the fines and, if needed, take this to court.',
    practice: 'real_estate.hoa_disputes',
    state: 'AZ',
    city: 'Phoenix',
    budgetCents: 150000,
    urgency: 'soon',
    stage: 'open',
    bids: 2,
  },
  // --- in progress ---------------------------------------------------------
  {
    title: 'Custody modification: ex relocating out of state',
    description:
      'We share custody 50/50 of our 8-year-old. My ex has accepted a job in Arizona and wants to move with our son in the summer. I do not agree. Need an attorney to oppose the relocation and modify the parenting plan.',
    practice: 'family_law.child_custody',
    state: 'NY',
    city: 'New York',
    budgetCents: 500000,
    urgency: 'urgent',
    stage: 'in_progress',
    bids: 4,
  },
  {
    title: 'First DUI, blew .11, want to keep my license',
    description:
      'Arrested on a Saturday night, first offense ever, no accident. DMV hearing has to be requested within days. I need a defense lawyer who handles both the criminal case and the DMV hearing in LA County.',
    practice: 'dui_and_dwi.first_offense_dui',
    state: 'CA',
    city: 'Los Angeles',
    budgetCents: 450000,
    urgency: 'very_urgent',
    stage: 'in_progress',
    bids: 3,
  },
  {
    title: 'Form an LLC and draft a founders agreement for 3 partners',
    description:
      'Three of us are starting a design agency in Austin. We want an LLC, an operating agreement with vesting, and a simple client services contract template.',
    practice: 'business_and_corporate.business_formation',
    state: 'TX',
    city: 'Austin',
    budgetCents: 300000,
    urgency: 'within_month',
    stage: 'in_progress',
    bids: 3,
  },
  {
    title: "Probate for my late father's house and accounts",
    description:
      'My father passed in March leaving a will, a house in Seattle and two bank accounts. I am the named executor. I need help opening probate and getting everything transferred to my sister and me.',
    practice: 'estate_planning_and_probate.probate_administration',
    state: 'WA',
    city: 'Seattle',
    budgetCents: 400000,
    urgency: 'flexible',
    stage: 'in_progress',
    bids: 3,
  },
  {
    title: 'Wage garnishment from an old credit card judgment',
    description:
      'My paycheck is being garnished 25% for a judgment on a credit card from 2016 that I never knew about. I want to know if the judgment can be vacated and the garnishment stopped.',
    practice: 'bankruptcy_and_debt.wage_garnishment',
    state: 'GA',
    city: 'Atlanta',
    budgetCents: 120000,
    urgency: 'urgent',
    stage: 'in_progress',
    bids: 3,
  },
  // --- closed --------------------------------------------------------------
  {
    title: 'Naturalization application and interview prep',
    description:
      'Green card holder for six years, ready to apply for citizenship. Wanted help with the N-400, the fee waiver question, and preparation for the interview and civics test.',
    practice: 'immigration.citizenship_and_naturalization',
    state: 'TX',
    city: 'Houston',
    budgetCents: 180000,
    urgency: 'flexible',
    stage: 'closed',
    bids: 3,
  },
  {
    title: 'Eviction notice after complaining about no heat',
    description:
      'Received a 30-day notice a week after I filed a complaint with the city about no heat for most of January. I believe this is retaliatory and need to fight it in housing court.',
    practice: 'landlord_and_tenant.eviction_defense',
    state: 'NY',
    city: 'Brooklyn',
    budgetCents: 150000,
    urgency: 'urgent',
    stage: 'closed',
    bids: 3,
  },
  {
    title: 'Slip and fall at a grocery store, broken wrist',
    description:
      "Slipped on an unmarked wet floor at a grocery store in Chicago, broke my wrist and needed surgery. The store's insurer has stopped returning calls. I have the incident report and medical bills around $22,000.",
    practice: 'personal_injury.slip_and_fall',
    state: 'IL',
    city: 'Chicago',
    budgetCents: null,
    urgency: 'soon',
    stage: 'closed',
    bids: 4,
  },
  {
    title: 'Severance review and negotiation after layoff',
    description:
      'Laid off from a tech company after seven years. Offered 8 weeks of severance in exchange for signing a release. I want a lawyer to review the agreement and negotiate a better package.',
    practice: 'employment_and_labor.employment_contracts_and_severance',
    state: 'CA',
    city: 'San Francisco',
    budgetCents: 100000,
    urgency: 'soon',
    stage: 'closed',
    bids: 3,
  },
  {
    title: 'Contractor took $18k deposit and never showed up',
    description:
      'Paid a contractor an $18,000 deposit for a kitchen remodel. Work was supposed to start six weeks ago; he has stopped answering. I have the signed contract and bank records. Want to recover the money.',
    practice: 'civil_litigation.contract_disputes',
    state: 'MA',
    city: 'Boston',
    budgetCents: 250000,
    urgency: 'within_month',
    stage: 'closed',
    bids: 3,
  },
];

/** `{title}` is replaced with the case title's first words. */
export const BID_MESSAGES: readonly string[] = [
  'Thank you for the detailed description. I have handled many matters like this one and can start right away. The fee covers everything through resolution; there are no hidden costs. Happy to answer questions here before you decide.',
  'I read your case carefully. Based on what you describe, this is very manageable and I would approach it in three steps, which I would be glad to walk you through on a short call. My quote below includes all court filings.',
  'I have practiced in this exact area for over a decade and know the local courts well. I offer a free 30-minute consultation so we can go over the facts and your options before any commitment.',
  'This is a situation I see often. The strongest path is to act quickly and document everything, which it sounds like you already have. My hourly rate is below; most clients in your position spend between 6 and 10 hours in total.',
  'I would be glad to take this on. I keep clients informed through the chat here and respond within a business day. The fixed fee covers drafting, filing and representation at the first hearing.',
  'Your description is clear and the documents you mention will help a lot. Let me propose a flat fee and a timeline: I can have the first filing ready within a week of being retained.',
];

export const CHAT_SCRIPTS: readonly (readonly string[])[] = [
  [
    'Hi, thank you for accepting my bid. Could you upload the documents you mentioned when you have a moment?',
    'Hello! Yes, I will send them tonight. Do you need the originals or are photos fine?',
    'Clear photos or PDF scans are perfect for now. We will only need originals if we go to a hearing.',
    'Got it. Also, is there anything I should avoid doing while this is pending?',
    'Good question. Please do not sign anything from the other side without sending it to me first, and keep all communication in writing.',
    'Understood. Uploading the files now.',
    'Received, thank you. I have reviewed them and we are in good shape. I will prepare the first draft by Thursday.',
    'That is faster than I expected. Thank you!',
    'Draft is attached in my notes. Please read it over the weekend and tell me if any dates or names are off.',
    'Read it. One date is wrong, the lease started in June, not July. Everything else looks right.',
    'Fixed. I will file on Monday morning and send you the confirmation here.',
    'Perfect, thank you so much for keeping me posted.',
  ],
  [
    'Welcome aboard. First, a quick timeline: I will request the records this week and we should have everything within ten days.',
    'Thanks. Should I keep going to physical therapy in the meantime?',
    "Yes, please follow your doctor's plan exactly and keep every receipt. Gaps in treatment are what insurers point to later.",
    'Will do. The adjuster called me again today, what should I say?',
    'From now on, just give them my name and number. You do not need to speak to them at all.',
    'That is a relief. Done.',
    'I have sent the letter of representation. They will stop calling you.',
    'They did. Any news on the records?',
    'Most are in. I am waiting on the ER billing, which usually takes a bit longer.',
    'Okay. What happens after that?',
    'I put together a demand package with all bills, the report and photos, and we send it to the insurer. Then they have 30 days to respond.',
    'Sounds good. Thank you for explaining each step.',
  ],
  [
    'Hello and thanks for choosing me. Could you confirm the full legal names of all three partners and the ownership split?',
    'Sure: 40 / 30 / 30. Names are in the document I just uploaded.',
    'Thank you. For vesting, do you want a one-year cliff with monthly vesting over four years? That is the standard.',
    'Yes, that works for all of us.',
    'Great. I will also add a simple buy-sell clause in case someone leaves. I will have the draft ready by Wednesday.',
    'Perfect. What about the LLC filing itself?',
    'I can file it tomorrow; the state usually approves within 2-3 business days. You will need an EIN right after, which I will handle.',
    'Please go ahead.',
    'Filed. Confirmation number is in the notes. The operating agreement draft is attached as well.',
    'Reading it now. Looks very thorough. One question: can we change the split later?',
    'Yes, by written amendment signed by all members. Section 9 explains how.',
    'Got it. Thank you, this is exactly what we needed.',
  ],
];

/** Short dialogues for a chat before any bid is accepted. */
export const PRE_ACCEPTANCE_SCRIPTS: readonly (readonly string[])[] = [
  [
    'Hi, I saw your bid. Do you have availability for a call this week?',
    'Hello! Yes, Thursday afternoon or Friday morning work well. Which do you prefer?',
    'Friday at 10 would be great, thank you.',
  ],
  [
    'Thanks for the bid. Does the fee include court filing fees?',
    'Good question. Court costs are separate and usually run $200 to $400; everything else is included.',
    'Understood, that is fair.',
  ],
  [
    'Hello, how long do matters like mine usually take?',
    'Most are resolved in 2 to 4 months. The timeline depends mostly on how fast the other side responds.',
    'Thank you, that helps me plan.',
  ],
];

export const REVIEW_BODIES: readonly string[] = [
  'Clear, calm and incredibly responsive. Every question I asked was answered the same day, and the outcome was better than I hoped for.',
  'Explained everything in plain language and never made me feel rushed. The fee was exactly what was quoted. Highly recommend.',
  'Professional from the first message to the last. Kept me updated at every step and handled the other side firmly.',
  'I was nervous about the whole process and this attorney made it manageable. Thorough, honest and kind.',
  'Fast, organized and knew the local court inside out. Would hire again without hesitation.',
  'Excellent communication through the app. Documents were ready ahead of schedule and the result was great.',
  'Took the time to understand my situation and found an option I had not thought of. Worth every dollar.',
  'Straightforward and effective. The matter was resolved in weeks, not months.',
];

export const REVIEW_REPLIES: readonly string[] = [
  'Thank you for the kind words. It was a pleasure working with you.',
  'I appreciate you taking the time to write this. Wishing you all the best.',
];

export interface DemoPostSpec {
  title: string;
  body: string;
  /** Leaf or category practice-area code (null = none). */
  practice: string | null;
}

/** Posts attorneys publish; each gets picked for an author by index. */
export const POST_TEXTS: readonly DemoPostSpec[] = [
  {
    title: 'Three things to do before you file for divorce',
    body: 'Before you file: gather two years of tax returns and bank statements, open an account in your own name, and write down the dates that matter. Preparation is half the case. #divorce #familylaw #legaltips',
    practice: 'family_law.divorce',
  },
  {
    title: 'What a green card timeline really looks like in 2026',
    body: 'Family-based green cards for spouses of citizens are running 10 to 14 months right now. Employment-based cases depend on your category and country. Ask your attorney for the realistic range, not the best case. #immigration #greencard',
    practice: 'immigration.green_card',
  },
  {
    title: 'Pulled over? Say less.',
    body: 'Be polite, hand over your license and registration, and then stop talking. You do not have to answer "Do you know why I stopped you?" Everything you say will be in the report. #dui #criminaldefense #knowyourrights',
    practice: 'dui_and_dwi.first_offense_dui',
  },
  {
    title: 'Never give a recorded statement without a lawyer',
    body: 'After an accident the other driver\'s insurer will call within days and ask for a "quick recorded statement". Decline. They are trained to get you to minimize your injuries on tape. #personalinjury #caraccident',
    practice: 'personal_injury.car_accident',
  },
  {
    title: 'Why an operating agreement matters even for one owner',
    body: 'A single-member LLC without an operating agreement is easier to pierce in court. Twenty pages, one afternoon, and your personal assets are far safer. #smallbusiness #llc #startups',
    practice: 'business_and_corporate.business_formation',
  },
  {
    title: 'A will is not enough if you own a home',
    body: 'A will still goes through probate. For most homeowners a revocable living trust saves the family months of court time and thousands in fees. #estateplanning #trusts #wills',
    practice: 'estate_planning_and_probate.trusts',
  },
  {
    title: 'NYC tenants: your deposit must be returned in 14 days',
    body: 'Since 2019 New York landlords must return your security deposit, with an itemized statement for any deductions, within 14 days of move-out. Miss the deadline and they forfeit the right to keep any of it. #tenantrights #nyc #housing',
    practice: 'landlord_and_tenant.security_deposit_disputes',
  },
  {
    title: 'Fired after complaining? Write the timeline today.',
    body: 'Retaliation cases are won on timelines. Write down every date: when you complained, to whom, what happened next. Save emails to a personal account before you lose access. #employmentlaw #retaliation #wrongfultermination',
    practice: 'employment_and_labor.retaliation_and_whistleblower',
  },
  {
    title: 'Read the HOA CC&Rs before you buy',
    body: 'Half of my HOA cases start with "nobody told me". The CC&Rs are public and you can read them before closing. Fence heights, paint colors, rentals: it is all in there. #realestate #hoa #homebuying',
    practice: 'real_estate.hoa_disputes',
  },
  {
    title: 'Trademark the name before you print the packaging',
    body: 'A clearance search costs a fraction of a rebrand. Check the USPTO database and the marketplace before you order 10,000 labels. #trademark #branding #smallbusiness',
    practice: 'intellectual_property.trademarks',
  },
  {
    title: 'Points vs. fines: what a speeding ticket really costs',
    body: 'The fine is the small part. Points raise your insurance for three years, and in Colorado 12 points in 12 months means a suspension. Fighting the ticket is usually cheaper than paying it. #trafficticket #speeding #drivingtips',
    practice: 'traffic_tickets.speeding',
  },
  {
    title: 'A debt collector must prove they own the debt',
    body: 'When a collector sues, make them show the chain of title. Many cannot. Request validation in writing within 30 days of the first letter. #debt #consumerrights #garnishment',
    practice: 'bankruptcy_and_debt.wage_garnishment',
  },
  {
    title: 'Why most contract disputes settle at mediation',
    body: 'Trials are expensive and slow. A well-prepared mediation, with the right documents and a realistic number, settles about 80% of my contract cases. #litigation #contracts #mediation',
    practice: 'civil_litigation.contract_disputes',
  },
  {
    title: 'How I use the LawBid planner to run my week',
    body: 'Every hearing, deadline and client call lives in one list my assistant and I share. Reminders go out the night before. Fewer surprises, more time for actual lawyering. #lawfirm #productivity #legaltech',
    practice: null,
  },
];

export interface DemoTaskSpec {
  kind:
    | 'call'
    | 'meeting'
    | 'court'
    | 'deadline'
    | 'documents'
    | 'filing'
    | 'review'
    | 'email'
    | 'research'
    | 'consultation'
    | 'hearing_prep'
    | 'print'
    | 'sign'
    | 'visit';
  title: string;
  notes?: string;
}

export const TASK_TEMPLATES: readonly DemoTaskSpec[] = [
  {
    kind: 'court',
    title: 'Hearing: Bennett custody modification',
    notes: 'Part 5, Room 212. Bring the relocation brief and exhibits A–D.',
  },
  {
    kind: 'call',
    title: 'Call client about settlement offer',
    notes: 'Insurer came back at $31,500. Recommend countering at $48,000.',
  },
  {
    kind: 'deadline',
    title: 'File response to motion to dismiss',
    notes: 'Due by 5 pm. Draft is in the shared folder.',
  },
  {
    kind: 'documents',
    title: 'Collect medical records from Mercy Hospital',
    notes: 'Authorization signed; follow up with records department.',
  },
  {
    kind: 'meeting',
    title: 'Intake meeting with new LLC clients',
    notes: 'Three founders. Confirm ownership split and vesting.',
  },
  {
    kind: 'filing',
    title: 'File N-400 for Patel',
    notes: 'Fee paid; attach passport photos and tax transcripts.',
  },
  {
    kind: 'review',
    title: 'Review severance agreement redline',
    notes: 'Compare against the first offer; check non-disparagement clause.',
  },
  { kind: 'email', title: 'Send engagement letter to new client' },
  {
    kind: 'research',
    title: 'Research relocation standard in Second Department',
  },
  { kind: 'consultation', title: 'Free consultation: trademark clearance' },
  {
    kind: 'hearing_prep',
    title: 'Prepare client for DMV hearing',
    notes: 'Walk through questions about the stop and the breath test.',
  },
  { kind: 'print', title: 'Print exhibits for Monday hearing' },
  { kind: 'sign', title: 'Get retainer signed by Garcia' },
  { kind: 'visit', title: 'Visit property for boundary dispute photos' },
];

export const ASSISTANT_TASKS: readonly DemoTaskSpec[] = [
  {
    kind: 'documents',
    title: 'Scan and upload Bennett exhibits',
    notes: 'Exhibits A–D, PDF, one file each.',
  },
  { kind: 'call', title: 'Confirm Thursday appointments with clients' },
  { kind: 'print', title: 'Print and bind the relocation brief' },
  { kind: 'email', title: 'Email intake form to the three LLC founders' },
];

/** Names for accounts created on demand (`createDemoUser`). */
export const EXTRA_FIRST_NAMES: readonly string[] = [
  'Taylor',
  'Morgan',
  'Jamie',
  'Riley',
  'Casey',
  'Avery',
  'Quinn',
  'Cameron',
  'Harper',
  'Logan',
  'Elliot',
  'Sydney',
  'Parker',
  'Reese',
  'Dakota',
  'Emerson',
];

export const EXTRA_LAST_NAMES: readonly string[] = [
  'Adams',
  'Brooks',
  'Campbell',
  'Diaz',
  'Evans',
  'Foster',
  'Griffin',
  'Hughes',
  'Iverson',
  'Jenkins',
  'Kennedy',
  'Lawson',
  'Mitchell',
  'Nelson',
  'Owens',
  'Price',
];

export const EXTRA_FIRMS: readonly string[] = [
  'Harbor Legal Group',
  'Summit Law Partners',
  'Meridian Counsel',
  'Northside Law Office',
  'Lakeview Legal',
];

export const EXTRA_BIOS: readonly string[] = [
  'Attorney focused on practical results and clear communication. I reply to every message within a business day.',
  'Fifteen years in practice across state and federal courts. Flat fees where possible, no surprises.',
  'I work with individuals and families who need straight answers and a steady hand.',
];

export const US_CITIES: readonly { city: string; state: string }[] = [
  { city: 'New York', state: 'NY' },
  { city: 'Los Angeles', state: 'CA' },
  { city: 'Houston', state: 'TX' },
  { city: 'Chicago', state: 'IL' },
  { city: 'Miami', state: 'FL' },
  { city: 'Seattle', state: 'WA' },
  { city: 'Denver', state: 'CO' },
  { city: 'Atlanta', state: 'GA' },
  { city: 'Boston', state: 'MA' },
  { city: 'Phoenix', state: 'AZ' },
];
