import type { SeedGroup } from './search-synonyms.service';

/** Starter dictionary (English + Russian), loaded once into an empty
 * database. More languages arrive through Admin → Search → Import in the
 * same shape: `{ key, practice, terms: { lang: [phrases] } }`. */
export const SYNONYMS_SEED: SeedGroup[] = [
  {
    key: 'criminal-defense',
    practice: 'criminal_defense',
    terms: {
      en: [
        'criminal defense',
        'criminal charge',
        'i was arrested',
        'arrested',
        'charged with a crime',
        'felony',
        'misdemeanor',
        'police arrest',
        'need a criminal lawyer',
      ],
      ru: [
        'уголовное дело',
        'уголовная защита',
        'меня арестовали',
        'арест',
        'обвинение в преступлении',
        'задержали полицейские',
        'нужен уголовный адвокат',
        'уголовное обвинение',
      ],
    },
  },
  {
    key: 'dui',
    practice: 'dui_and_dwi',
    terms: {
      en: [
        'dui',
        'dwi',
        'drunk driving',
        'driving under the influence',
        'drunk driving arrest',
        'dui lawyer',
        'breathalyzer',
        'license suspended dui',
      ],
      ru: [
        'вождение в нетрезвом виде',
        'пьяный за рулём',
        'остановили пьяным',
        'лишение прав за пьянку',
        'алкотестер',
        'адвокат по дуи',
      ],
    },
  },
  {
    key: 'traffic-tickets',
    practice: 'traffic_tickets',
    terms: {
      en: [
        'traffic ticket',
        'speeding ticket',
        'parking ticket',
        'ticket',
        'fine for speeding',
        'red light ticket',
        'reckless driving',
        'points on license',
      ],
      ru: [
        'штраф за превышение скорости',
        'штраф гибдд',
        'дорожный штраф',
        'штраф за парковку',
        'проехал на красный',
        'лишение прав',
        'баллы на правах',
        'превышение скорости',
      ],
    },
  },
  {
    key: 'personal-injury',
    practice: 'personal_injury',
    terms: {
      en: [
        'personal injury',
        'car accident',
        'accident lawyer',
        'i was hurt',
        'injured in an accident',
        'slip and fall',
        'injury claim',
        'hit by a car',
        'compensation for injury',
      ],
      ru: [
        'травма',
        'авария',
        'дтп',
        'попал в аварию',
        'получил травму',
        'компенсация за травму',
        'упал и получил травму',
        'сбила машина',
        'возмещение вреда здоровью',
      ],
    },
  },
  {
    key: 'medical-malpractice',
    practice: 'medical_malpractice',
    terms: {
      en: [
        'medical malpractice',
        'doctor mistake',
        'wrong diagnosis',
        'surgery error',
        'hospital negligence',
        'sue a doctor',
      ],
      ru: [
        'врачебная ошибка',
        'ошибка врача',
        'неправильный диагноз',
        'ошибка при операции',
        'халатность больницы',
        'подать в суд на врача',
      ],
    },
  },
  {
    key: 'workers-compensation',
    practice: 'workers_compensation',
    terms: {
      en: [
        'workers compensation',
        'injured at work',
        'work injury',
        'workplace accident',
        'workers comp claim',
      ],
      ru: [
        'травма на работе',
        'производственная травма',
        'несчастный случай на работе',
        'компенсация за травму на работе',
      ],
    },
  },
  {
    key: 'family-law',
    practice: 'family_law',
    terms: {
      en: [
        'family law',
        'family lawyer',
        'family court',
        'marriage problems',
        'family dispute',
      ],
      ru: [
        'семейное право',
        'семейный адвокат',
        'семейный суд',
        'проблемы в браке',
        'семейный спор',
      ],
    },
  },
  {
    key: 'divorce',
    practice: 'family_law.divorce',
    terms: {
      en: [
        'divorce',
        'i want a divorce',
        'end my marriage',
        'file for divorce',
        'dissolution of marriage',
        'separation from spouse',
        'split from husband',
        'split from wife',
      ],
      ru: [
        'развод',
        'хочу развестись',
        'расторжение брака',
        'подать на развод',
        'развод с мужем',
        'развод с женой',
        'расставание с супругом',
        'бракоразводный процесс',
      ],
    },
  },
  {
    key: 'child-custody',
    practice: 'family_law.child_custody',
    terms: {
      en: [
        'child custody',
        'custody of my kids',
        'custody battle',
        'visitation rights',
        'parenting time',
        'get my child back',
      ],
      ru: [
        'опека над ребёнком',
        'определение места жительства ребёнка',
        'с кем останется ребёнок',
        'порядок общения с ребёнком',
        'забрать ребёнка',
        'споры о детях',
      ],
    },
  },
  {
    key: 'child-support',
    practice: 'family_law.child_support',
    terms: {
      en: [
        'child support',
        'alimony for child',
        'support payments',
        'ex does not pay child support',
      ],
      ru: [
        'алименты',
        'алименты на ребёнка',
        'не платит алименты',
        'взыскание алиментов',
        'размер алиментов',
      ],
    },
  },
  {
    key: 'spousal-support',
    practice: 'family_law.alimony_and_spousal_support',
    terms: {
      en: [
        'alimony',
        'spousal support',
        'maintenance from husband',
        'support from ex-wife',
      ],
      ru: [
        'алименты на супруга',
        'содержание бывшей жены',
        'содержание бывшего мужа',
        'материальная помощь супругу',
      ],
    },
  },
  {
    key: 'domestic-violence',
    practice: 'family_law.domestic_violence_protective_orders',
    terms: {
      en: [
        'domestic violence',
        'my husband beats me',
        'abusive husband',
        'abusive partner',
        'restraining order',
        'protective order',
        'i am being abused',
      ],
      ru: [
        'домашнее насилие',
        'муж бьёт',
        'муж меня бьёт',
        'жестокое обращение в семье',
        'охранный ордер',
        'запрет приближаться',
        'меня избивает муж',
        'защита от насилия',
      ],
    },
  },
  {
    key: 'property-division',
    practice: 'family_law.property_division',
    terms: {
      en: [
        'property division',
        'split assets in divorce',
        'who gets the house',
        'marital property',
      ],
      ru: [
        'раздел имущества',
        'раздел имущества при разводе',
        'кому достанется дом',
        'совместно нажитое имущество',
      ],
    },
  },
  {
    key: 'paternity',
    practice: 'family_law.paternity',
    terms: {
      en: [
        'paternity',
        'establish paternity',
        'dna test father',
        'prove fatherhood',
      ],
      ru: [
        'установление отцовства',
        'отцовство',
        'днк тест на отцовство',
        'признание отцовства',
      ],
    },
  },
  {
    key: 'adoption',
    practice: 'family_law.adoption',
    terms: {
      en: ['adoption', 'adopt a child', 'stepparent adoption'],
      ru: [
        'усыновление',
        'удочерение',
        'усыновить ребёнка',
        'усыновление ребёнка супруга',
      ],
    },
  },
  {
    key: 'immigration',
    practice: 'immigration',
    terms: {
      en: [
        'immigration',
        'immigration lawyer',
        'visa',
        'move to the usa',
        'stay in the us',
        'immigration problem',
      ],
      ru: [
        'иммиграция',
        'иммиграционный адвокат',
        'виза',
        'переехать в сша',
        'остаться в сша',
        'проблемы с иммиграцией',
      ],
    },
  },
  {
    key: 'green-card',
    practice: 'immigration.green_card',
    terms: {
      en: [
        'green card',
        'permanent residence',
        'permanent resident card',
        'greencard',
        'residency in the us',
      ],
      ru: [
        'грин карта',
        'грин-карта',
        'вид на жительство',
        'внж в сша',
        'постоянное проживание',
        'получить грин карту',
      ],
    },
  },
  {
    key: 'citizenship',
    practice: 'immigration.citizenship_and_naturalization',
    terms: {
      en: ['citizenship', 'become a citizen', 'naturalization', 'us passport'],
      ru: [
        'гражданство',
        'получить гражданство',
        'натурализация',
        'гражданство сша',
      ],
    },
  },
  {
    key: 'deportation',
    practice: 'immigration.deportation_and_removal_defense',
    terms: {
      en: [
        'deportation',
        'removal proceedings',
        'facing deportation',
        'ice detained',
        'immigration court',
      ],
      ru: [
        'депортация',
        'высылка из страны',
        'угрожает депортация',
        'задержал ице',
        'иммиграционный суд',
      ],
    },
  },
  {
    key: 'asylum',
    practice: 'immigration.asylum_and_refugee',
    terms: {
      en: [
        'asylum',
        'refugee status',
        'political asylum',
        'persecution in my country',
      ],
      ru: [
        'убежище',
        'политическое убежище',
        'статус беженца',
        'преследование на родине',
      ],
    },
  },
  {
    key: 'work-visa',
    practice: 'immigration.employment_visas',
    terms: {
      en: ['work visa', 'h1b', 'employment visa', 'work permit'],
      ru: ['рабочая виза', 'виза для работы', 'разрешение на работу', 'н1б'],
    },
  },
  {
    key: 'student-visa',
    practice: 'immigration.student_visas',
    terms: {
      en: ['student visa', 'f1 visa', 'study in the us'],
      ru: ['студенческая виза', 'виза для учёбы', 'учёба в сша'],
    },
  },
  {
    key: 'estate-planning',
    practice: 'estate_planning_and_probate',
    terms: {
      en: [
        'estate planning',
        'inheritance',
        'probate',
        'inheritance dispute',
        'what happens after death',
        'estate lawyer',
      ],
      ru: [
        'наследство',
        'наследование',
        'завещание и наследство',
        'оформление наследства',
        'наследственный спор',
        'после смерти родственника',
      ],
    },
  },
  {
    key: 'wills',
    practice: 'estate_planning_and_probate.wills',
    terms: {
      en: [
        'last will',
        'make a will',
        'write a will',
        'last will and testament',
      ],
      ru: [
        'завещание',
        'составить завещание',
        'написать завещание',
        'последняя воля',
      ],
    },
  },
  {
    key: 'trusts',
    practice: 'estate_planning_and_probate.trusts',
    terms: {
      en: ['family trust', 'living trust', 'set up a trust'],
      ru: [
        'трест',
        'семейный траст',
        'оформить траст',
        'доверительное управление',
      ],
    },
  },
  {
    key: 'elder-law',
    practice: 'elder_law',
    terms: {
      en: [
        'elder law',
        'nursing home',
        'medicaid for seniors',
        'care for elderly parents',
        'guardianship of elderly',
      ],
      ru: [
        'право пожилых',
        'дом престарелых',
        'уход за пожилыми родителями',
        'опека над пожилым',
        'медикейд для пожилых',
      ],
    },
  },
  {
    key: 'real-estate',
    practice: 'real_estate',
    terms: {
      en: [
        'real estate',
        'buy a house',
        'sell a house',
        'property dispute',
        'title problem',
        'closing on a home',
      ],
      ru: [
        'недвижимость',
        'купить дом',
        'продать дом',
        'спор о недвижимости',
        'проблема с титулом',
        'сделка с недвижимостью',
      ],
    },
  },
  {
    key: 'landlord-tenant',
    practice: 'landlord_and_tenant',
    terms: {
      en: [
        'landlord',
        'tenant',
        'rent dispute',
        'eviction',
        'evicted from apartment',
        'security deposit',
        'lease dispute',
        "landlord won't fix",
      ],
      ru: [
        'арендодатель',
        'арендатор',
        'спор по аренде',
        'выселение',
        'выселяют из квартиры',
        'залог за квартиру',
        'договор аренды',
        'хозяин не возвращает залог',
      ],
    },
  },
  {
    key: 'eviction',
    practice: 'landlord_and_tenant.eviction_defense',
    terms: {
      en: [
        'eviction notice',
        'facing eviction',
        'kicked out of my apartment',
        'eviction defense',
      ],
      ru: [
        'уведомление о выселении',
        'меня выселяют',
        'выгоняют из квартиры',
        'защита от выселения',
      ],
    },
  },
  {
    key: 'foreclosure',
    practice: 'real_estate.foreclosure_defense',
    terms: {
      en: [
        'foreclosure',
        'losing my house',
        'bank taking my home',
        'mortgage default',
      ],
      ru: [
        'потеря дома за долги',
        'банк забирает дом',
        'просрочка по ипотеке',
        'обращение взыскания на недвижимость',
      ],
    },
  },
  {
    key: 'employment',
    practice: 'employment_and_labor',
    terms: {
      en: [
        'employment law',
        'labor law',
        'problem at work',
        'boss problem',
        'workplace issue',
        'employee rights',
      ],
      ru: [
        'трудовое право',
        'трудовой спор',
        'проблемы на работе',
        'начальник нарушает права',
        'права работника',
      ],
    },
  },
  {
    key: 'wrongful-termination',
    practice: 'employment_and_labor.wrongful_termination',
    terms: {
      en: [
        'fired',
        'wrongful termination',
        'i was fired',
        'laid off unfairly',
        'fired without reason',
      ],
      ru: [
        'уволили',
        'незаконное увольнение',
        'меня уволили',
        'уволили без причины',
        'несправедливое увольнение',
      ],
    },
  },
  {
    key: 'wage-and-hour',
    practice: 'employment_and_labor.wage_and_hour',
    terms: {
      en: [
        'unpaid wages',
        'overtime pay',
        'employer does not pay',
        'wage theft',
        'minimum wage',
      ],
      ru: [
        'не платят зарплату',
        'задержка зарплаты',
        'неоплаченные сверхурочные',
        'невыплаченная зарплата',
        'работодатель не платит',
      ],
    },
  },
  {
    key: 'harassment',
    practice: 'employment_and_labor.sexual_harassment',
    terms: {
      en: ['sexual harassment', 'harassed at work', 'hostile work environment'],
      ru: [
        'сексуальные домогательства',
        'домогательства на работе',
        'притеснения на работе',
      ],
    },
  },
  {
    key: 'discrimination',
    practice: 'employment_and_labor.workplace_discrimination',
    terms: {
      en: [
        'discrimination',
        'discriminated at work',
        'racial discrimination',
        'age discrimination',
      ],
      ru: [
        'дискриминация',
        'дискриминация на работе',
        'расовая дискриминация',
        'дискриминация по возрасту',
      ],
    },
  },
  {
    key: 'bankruptcy-debt',
    practice: 'bankruptcy_and_debt',
    terms: {
      en: [
        'bankruptcy',
        'debt problems',
        'too much debt',
        "can't pay my debts",
        'debt collectors',
        'debt relief',
        'credit card debt',
      ],
      ru: [
        'банкротство',
        'долги',
        'большие долги',
        'нечем платить по долгам',
        'коллекторы',
        'списание долгов',
        'долг по кредитке',
      ],
    },
  },
  {
    key: 'wage-garnishment',
    practice: 'bankruptcy_and_debt.wage_garnishment',
    terms: {
      en: [
        'wage garnishment',
        'garnished wages',
        'bank account frozen by creditor',
      ],
      ru: ['удержание из зарплаты', 'арест зарплаты', 'счёт арестован за долг'],
    },
  },
  {
    key: 'business',
    practice: 'business_and_corporate',
    terms: {
      en: [
        'business law',
        'start a business',
        'open a company',
        'llc',
        'business contract',
        'corporate lawyer',
        'partnership dispute',
      ],
      ru: [
        'бизнес',
        'открыть компанию',
        'создать ллс',
        'регистрация компании',
        'договор для бизнеса',
        'корпоративный юрист',
        'спор с партнёром по бизнесу',
      ],
    },
  },
  {
    key: 'intellectual-property',
    practice: 'intellectual_property',
    terms: {
      en: [
        'trademark',
        'patent',
        'copyright',
        'intellectual property',
        'brand protection',
        'someone copied my work',
      ],
      ru: [
        'товарный знак',
        'патент',
        'авторское право',
        'интеллектуальная собственность',
        'защита бренда',
        'украли мою работу',
      ],
    },
  },
  {
    key: 'tax',
    practice: 'tax_law',
    terms: {
      en: [
        'tax problem',
        'irs',
        'back taxes',
        'tax audit',
        'owe taxes',
        'tax lawyer',
      ],
      ru: [
        'налоги',
        'налоговая проверка',
        'долг по налогам',
        'проблемы с ирс',
        'налоговый юрист',
      ],
    },
  },
  {
    key: 'civil-litigation',
    practice: 'civil_litigation',
    terms: {
      en: [
        'sue someone',
        'lawsuit',
        'civil lawsuit',
        'breach of contract',
        'small claims',
        'someone owes me money',
      ],
      ru: [
        'подать в суд',
        'судебный иск',
        'гражданский иск',
        'нарушение договора',
        'мелкие споры',
        'мне должны деньги',
      ],
    },
  },
  {
    key: 'consumer-protection',
    practice: 'consumer_protection',
    terms: {
      en: [
        'consumer fraud',
        'scam',
        'i was scammed',
        'defective product refund',
        'lemon law',
        'identity theft',
      ],
      ru: [
        'мошенничество',
        'меня обманули',
        'обман покупателя',
        'возврат бракованного товара',
        'кража личных данных',
        'защита прав потребителей',
      ],
    },
  },
  {
    key: 'insurance',
    practice: 'insurance_law',
    terms: {
      en: [
        'insurance claim denied',
        'insurance company refuses to pay',
        'insurance dispute',
        'bad faith insurance',
      ],
      ru: [
        'страховая отказала',
        'страховая не платит',
        'спор со страховой',
        'отказ в страховой выплате',
      ],
    },
  },
  {
    key: 'social-security',
    practice: 'social_security_disability',
    terms: {
      en: [
        'social security disability',
        'ssdi',
        'disability benefits denied',
        'disability claim',
      ],
      ru: [
        'пособие по инвалидности',
        'отказали в пособии по инвалидности',
        'соцобеспечение по инвалидности',
        'инвалидность выплаты',
      ],
    },
  },
  {
    key: 'veterans',
    practice: 'veterans_and_military',
    terms: {
      en: ['veteran benefits', 'military lawyer', 'va claim', 'court martial'],
      ru: [
        'льготы ветеранов',
        'военный адвокат',
        'пособие для ветеранов',
        'военный трибунал',
      ],
    },
  },
  {
    key: 'civil-rights',
    practice: 'civil_rights',
    terms: {
      en: [
        'civil rights',
        'police brutality',
        'violated my rights',
        'wrongful arrest',
      ],
      ru: [
        'гражданские права',
        'жестокость полиции',
        'нарушили мои права',
        'незаконный арест',
      ],
    },
  },
  {
    key: 'education-law',
    practice: 'education_law',
    terms: {
      en: [
        'school problem',
        'student expelled',
        'special education rights',
        'university dispute',
      ],
      ru: [
        'проблема в школе',
        'отчислили из школы',
        'права ребёнка в школе',
        'спор с университетом',
      ],
    },
  },
  {
    key: 'health-care-law',
    practice: 'health_care_law',
    terms: {
      en: [
        'health care law',
        'medical license',
        'hospital billing dispute',
        'medicare problem',
      ],
      ru: [
        'медицинское право',
        'медицинская лицензия',
        'спор по счёту из больницы',
        'проблема с медикэр',
      ],
    },
  },
  {
    key: 'government',
    practice: 'government_and_administrative_law',
    terms: {
      en: [
        'government benefits',
        'administrative hearing',
        'permit denied',
        'agency decision appeal',
      ],
      ru: [
        'государственные пособия',
        'административное слушание',
        'отказали в разрешении',
        'обжаловать решение ведомства',
      ],
    },
  },
  {
    key: 'appeals',
    practice: 'appeals',
    terms: {
      en: [
        'appeal',
        'appeal a verdict',
        'lost in court',
        'appeal the decision',
      ],
      ru: [
        'апелляция',
        'обжаловать приговор',
        'проиграл суд',
        'обжаловать решение суда',
      ],
    },
  },
  {
    key: 'construction',
    practice: 'construction_law',
    terms: {
      en: [
        'contractor dispute',
        'construction defect',
        'contractor did not finish',
        'mechanics lien',
      ],
      ru: [
        'спор с подрядчиком',
        'строительные дефекты',
        'подрядчик не закончил работу',
        'строительный залог',
      ],
    },
  },
  {
    key: 'securities',
    practice: 'securities_and_financial_law',
    terms: {
      en: [
        'securities fraud',
        'investment loss',
        'broker misconduct',
        'crypto fraud',
      ],
      ru: [
        'мошенничество с ценными бумагами',
        'потерял инвестиции',
        'брокер обманул',
        'крипто мошенничество',
      ],
    },
  },
  {
    key: 'environmental',
    practice: 'environmental_and_energy_law',
    terms: {
      en: [
        'environmental law',
        'pollution',
        'contaminated land',
        'energy dispute',
      ],
      ru: [
        'экологическое право',
        'загрязнение',
        'заражённая земля',
        'энергетический спор',
      ],
    },
  },
  {
    key: 'tech-privacy',
    practice: 'technology_privacy_and_cyber_law',
    terms: {
      en: [
        'data breach',
        'privacy law',
        'online defamation',
        'hacked account',
        'software licensing',
      ],
      ru: [
        'утечка данных',
        'закон о приватности',
        'клевета в интернете',
        'взломали аккаунт',
        'лицензия на программу',
      ],
    },
  },
  {
    key: 'entertainment',
    practice: 'entertainment_media_and_sports_law',
    terms: {
      en: [
        'entertainment lawyer',
        'music contract',
        'sports contract',
        'film rights',
      ],
      ru: [
        'юрист по шоу-бизнесу',
        'музыкальный контракт',
        'спортивный контракт',
        'права на фильм',
      ],
    },
  },
  {
    key: 'aviation-maritime',
    practice: 'aviation_and_maritime_law',
    terms: {
      en: [
        'airline compensation',
        'flight cancelled',
        'plane crash',
        'boat accident',
        'maritime injury',
      ],
      ru: [
        'компенсация авиакомпании',
        'рейс отменили',
        'авиакатастрофа',
        'авария на лодке',
        'травма на судне',
      ],
    },
  },
  {
    key: 'international',
    practice: 'international_and_cross_border_law',
    terms: {
      en: [
        'international law',
        'cross-border dispute',
        'foreign judgment',
        'overseas contract',
      ],
      ru: [
        'международное право',
        'международный спор',
        'иностранное решение суда',
        'контракт с зарубежной компанией',
      ],
    },
  },
  {
    key: 'antitrust',
    practice: 'antitrust_and_trade_regulation',
    terms: {
      en: ['antitrust', 'unfair competition', 'price fixing'],
      ru: [
        'антимонопольное право',
        'недобросовестная конкуренция',
        'сговор о ценах',
      ],
    },
  },
  {
    key: 'nonprofit',
    practice: 'nonprofit_and_religious_organizations',
    terms: {
      en: ['nonprofit', 'charity registration', 'church legal issue'],
      ru: [
        'некоммерческая организация',
        'регистрация благотворительного фонда',
        'юридический вопрос церкви',
      ],
    },
  },
  {
    key: 'tribal',
    practice: 'native_american_and_tribal_law',
    terms: {
      en: ['tribal law', 'native american rights', 'tribal court'],
      ru: [
        'право коренных народов',
        'права коренных американцев',
        'племенной суд',
      ],
    },
  },
  {
    key: 'animal-law',
    practice: 'animal_law',
    terms: {
      en: [
        'animal law',
        'pet custody',
        'dog attack',
        'animal cruelty',
        'vet malpractice',
      ],
      ru: [
        'закон о животных',
        'кому достанется питомец',
        'нападение собаки',
        'жестокое обращение с животными',
        'ошибка ветеринара',
      ],
    },
  },
  {
    key: 'cannabis-firearms',
    practice: 'cannabis_alcohol_and_firearms_law',
    terms: {
      en: [
        'cannabis license',
        'liquor license',
        'gun license',
        'firearm rights restored',
      ],
      ru: [
        'лицензия на каннабис',
        'лицензия на алкоголь',
        'разрешение на оружие',
        'восстановление права на оружие',
      ],
    },
  },
  {
    key: 'agriculture-gaming',
    practice: 'agriculture_and_gaming_law',
    terms: {
      en: [
        'farm law',
        'agricultural dispute',
        'casino law',
        'gambling license',
      ],
      ru: [
        'фермерское право',
        'сельскохозяйственный спор',
        'закон о казино',
        'лицензия на азартные игры',
      ],
    },
  },
  {
    key: 'legal-malpractice',
    practice: 'legal_malpractice',
    terms: {
      en: [
        'my lawyer made a mistake',
        'legal malpractice',
        'sue my attorney',
        'lawyer stole my money',
      ],
      ru: [
        'адвокат допустил ошибку',
        'ошибка адвоката',
        'подать на своего адвоката',
        'адвокат украл деньги',
      ],
    },
  },
  {
    key: 'general-practice',
    practice: 'general_practice',
    terms: {
      en: [
        'i need a lawyer',
        'legal advice',
        'legal help',
        'consultation with attorney',
        'not sure what lawyer',
      ],
      ru: [
        'нужен адвокат',
        'юридическая консультация',
        'юридическая помощь',
        'консультация юриста',
        'не знаю какой юрист нужен',
      ],
    },
  },
  {
    key: 'car-accident',
    practice: 'personal_injury.car_accident',
    terms: {
      en: ['car crash', 'auto accident', 'rear ended', 'hit and run victim'],
      ru: [
        'автомобильная авария',
        'столкновение машин',
        'в меня врезались',
        'сбили и уехали',
      ],
    },
  },
  {
    key: 'wrongful-death',
    practice: 'personal_injury.wrongful_death',
    terms: {
      en: [
        'wrongful death',
        'death of a relative caused by someone',
        'loved one killed',
      ],
      ru: [
        'смерть по чужой вине',
        'гибель родственника',
        'погиб близкий человек',
      ],
    },
  },
  {
    key: 'dog-bite',
    practice: 'personal_injury.dog_bite',
    terms: {
      en: ['dog bite', 'bitten by a dog'],
      ru: ['укус собаки', 'покусала собака'],
    },
  },
  {
    key: 'name-change',
    practice: 'family_law.name_change',
    terms: {
      en: ['change my name', 'legal name change'],
      ru: ['сменить фамилию', 'смена имени', 'изменить имя по закону'],
    },
  },
  {
    key: 'prenup',
    practice: 'family_law.prenuptial_and_postnuptial_agreements',
    terms: {
      en: ['prenup', 'prenuptial agreement', 'marriage contract'],
      ru: ['брачный договор', 'брачный контракт', 'договор перед свадьбой'],
    },
  },
  {
    key: 'criminal-expungement',
    practice: 'criminal_defense.expungement_and_record_sealing',
    terms: {
      en: [
        'expungement',
        'clear my record',
        'seal my record',
        'remove conviction',
      ],
      ru: [
        'погашение судимости',
        'очистить судимость',
        'скрыть судимость',
        'снять судимость',
      ],
    },
  },
  {
    key: 'drug-charges',
    practice: 'criminal_defense.drug_offenses',
    terms: {
      en: ['drug charges', 'caught with drugs', 'possession of drugs'],
      ru: [
        'обвинение в наркотиках',
        'поймали с наркотиками',
        'хранение наркотиков',
      ],
    },
  },
  {
    key: 'theft-charges',
    practice: 'criminal_defense.theft_and_burglary',
    terms: {
      en: [
        'theft charge',
        'shoplifting',
        'burglary charge',
        'accused of stealing',
      ],
      ru: [
        'обвинение в краже',
        'кража в магазине',
        'обвинение в краже со взломом',
        'обвинили в воровстве',
      ],
    },
  },
  {
    key: 'assault-charges',
    practice: 'criminal_defense.assault_and_battery',
    terms: {
      en: ['assault charge', 'accused of a fight', 'battery charge'],
      ru: ['обвинение в нападении', 'обвинили в драке', 'обвинение в избиении'],
    },
  },
];
