/**
 * Owner 2026-10-28 ("автоматизировать проверку лицензий во всех штатах, где
 * это технически возможно"): ready-made settings for each state whose
 * public registry can be read by bar number without a captcha, a login,
 * accepting terms, or a robots.txt ban. Research and live checks:
 * docs/dev/STATE_BAR_REGISTRIES_2026-10-28.md. Every preset has a fixture
 * test (__fixtures__/presets) built from the real page structure captured
 * on 2026-10-28.
 *
 * A preset is only used when the admin picks «Готовый: официальный сайт
 * штата» for that state AND switches the state on — all start OFF.
 * States not listed here stay manual (MANUAL_REASONS says why): the
 * verifier gets «Открыть в реестре» with a direct link where one exists.
 */

export type PresetEngine = 'html_page' | 'generic_rest';

export interface StatePreset {
  engine: PresetEngine;
  /** Settings of the engine (same names as the admin form fields). */
  config: Record<string, string>;
  /** Short Russian note for the admin page. */
  note: string;
  /** The registry publishes no license status: a match goes to a verifier. */
  statusUnknown?: boolean;
}

const ASPX_GRID = (prefix: string, input: string) =>
  `${encodeURIComponent(`${prefix}$${input}$TextBox1`)}={bar_number}&${encodeURIComponent(`${prefix}$SubmitButton`)}=Find`;

export const STATE_PRESETS: Readonly<Record<string, StatePreset>> = {
  AR: {
    engine: 'html_page',
    note: 'Поиск Верховного суда (форма ASP.NET). Статуса нет — совпадение уходит проверяющему.',
    statusUnknown: true,
    config: {
      urlTemplate:
        'https://attorneyinfo.aoc.arkansas.gov/info/attorney/attorneysearch.aspx',
      bootstrapUrl:
        'https://attorneyinfo.aoc.arkansas.gov/info/attorney/attorneysearch.aspx',
      bootstrapHidden: 'yes',
      method: 'POST',
      bodyTemplate: ASPX_GRID(
        'ctl01$TemplateBody$WebPartManager1$gwpciAttorneySearch$ciAttorneySearch$ResultsGrid$Sheet0',
        'Input4',
      ),
      numberFormat: 'digits',
      recordSelector: 'css:tr.rgRow, tr.rgAltRow',
      nameSelector: 'css:td:nth-child(1)',
      admittedSelector: 'css:td:nth-child(3)',
    },
  },
  CA: {
    engine: 'html_page',
    note: 'Профиль State Bar of California по номеру.',
    config: {
      urlTemplate:
        'https://apps.calbar.ca.gov/attorney/Licensee/Detail/{bar_number}',
      numberFormat: 'digits',
      nameSelector: 'css:h3 > b:contains("#")|re:^(.*?)\\s*#',
      numberSelector: 'css:h3 > b:contains("#")|re:#\\s*(\\d+)',
      statusSelector: 'label:License Status:',
      activeValues: 'Active',
      admittedSelector:
        'regex:(\\d{1,2}/\\d{1,2}/\\d{4})\\s*Admitted to the State Bar of California',
      profileUrl:
        'https://apps.calbar.ca.gov/attorney/Licensee/Detail/{bar_number}',
    },
  },
  CO: {
    engine: 'html_page',
    note: 'Профиль Office of Attorney Regulation Counsel. robots.txt просит 10 с между запросами — лимит 5 в минуту.',
    config: {
      urlTemplate:
        'https://www.coloradolegalregulation.com/attorney-search/attorney-information/?regnum={bar_number}',
      numberFormat: 'digits',
      numberSelector: 'css:.csc-attorney-profile__regnum|re:(\\d+)',
      nameSelector: 'css:.csc-attorney-profile__name',
      statusSelector:
        'css:.csc-attorney-status|re:^(?:License Status:\\s*)?(.+)$',
      activeValues: 'Active',
      admittedSelector:
        'css:.csc-attorney-details__item:contains("Admission Date") dd',
      firmSelector: 'css:.csc-attorney-details__item:contains("Firm Name") dd',
      profileUrl:
        'https://www.coloradolegalregulation.com/attorney-search/attorney-information/?regnum={bar_number}',
      ratePerMin: '5',
    },
  },
  FL: {
    engine: 'html_page',
    note: 'Профиль The Florida Bar (нужны cookie стартовой страницы; Cloudflare быстро отвечает 429 — лимит 4 в минуту, пауза по Retry-After).',
    config: {
      bootstrapUrl: 'https://www.floridabar.org/directories/find-mbr/',
      urlTemplate:
        'https://www.floridabar.org/directories/find-mbr/profile/?num={bar_number}',
      numberFormat: 'digits',
      recordSelector: 'css:#mProfile',
      nameSelector: 'css:h1',
      numberSelector: 'label:Bar Number:',
      statusSelector: 'css:.member-status && css:.eligibility',
      activeValues:
        'Member in Good Standing / Eligible to Practice Law in Florida',
      admittedSelector: 'label:Admitted:',
      profileUrl:
        'https://www.floridabar.org/directories/find-mbr/profile/?num={bar_number}',
      ratePerMin: '4',
    },
  },
  IN: {
    engine: 'generic_rest',
    note: 'JSON Roll of Attorneys Верховного суда Индианы (POST).',
    config: {
      urlTemplate:
        'https://courtapps.in.gov/court-apps/api/v1/roll-of-attorneys/search',
      authType: 'none',
      method: 'POST',
      bodyType: 'json',
      bodyTemplate: '{"AttorneyNumber":"{bar_number}","Page":1}',
      recordPath: 'Results',
      numberPath: 'AttorneyNumber',
      statusPath: 'Status',
      fullNamePath: 'FullName',
      admittedPath: 'AdmitDate',
      activeValues: 'Active In Good Standing',
      profileUrl:
        'https://courtapps.in.gov/rollofattorneys?AttorneyNumber={bar_number}',
    },
  },
  MO: {
    engine: 'html_page',
    note: 'Lawyer Directory The Missouri Bar (форма ASP.NET, «Bar Number Equals»).',
    config: {
      urlTemplate:
        'https://mobar.org/site/content/For-the-Public/Lawyer_Directory.aspx',
      bootstrapUrl:
        'https://mobar.org/site/content/For-the-Public/Lawyer_Directory.aspx',
      bootstrapHidden: 'yes',
      method: 'POST',
      bodyTemplate: ASPX_GRID(
        'ctl01$TemplateBody$WebPartManager1$gwpciLawyerDirectory$ciLawyerDirectory$ResultsGrid$Sheet0',
        'Input4',
      ),
      numberFormat: 'digits',
      recordSelector: 'css:tr.rgRow, tr.rgAltRow',
      nameSelector: 'css:td:nth-child(1)',
      statusSelector: 'css:td:nth-child(4)',
      activeValues: 'Active',
    },
  },
  MS: {
    engine: 'html_page',
    note: 'Bar Roll Верховного суда Миссисипи (POST). Статуса нет — совпадение уходит проверяющему.',
    statusUnknown: true,
    config: {
      urlTemplate: 'https://www.courts.ms.gov/bar/barroll/brdetail.php',
      referer: 'https://www.courts.ms.gov/bar/barroll/barroll.php',
      method: 'POST',
      bodyTemplate: 'brnum={bar_number}',
      numberFormat: 'digits',
      nameSelector: 'label:Name:',
      admittedSelector: 'label:SCT Admission Date:',
    },
  },
  NC: {
    engine: 'html_page',
    note: 'Membership Directory NC State Bar (форма ASP.NET по номеру).',
    config: {
      urlTemplate: 'https://portal.ncbar.gov/Verification/search.aspx',
      bootstrapUrl: 'https://portal.ncbar.gov/Verification/search.aspx',
      bootstrapHidden: 'yes',
      method: 'POST',
      bodyTemplate:
        'ctl00%24Content%24txtLicNum={bar_number}&ctl00%24Content%24btnSubmit=Search',
      numberFormat: 'digits',
      recordSelector: 'css:table.table tbody tr',
      numberSelector: 'css:td:nth-child(1)',
      nameSelector: 'css:td:nth-child(2)',
      statusSelector: 'css:td:nth-child(4)',
      activeValues: 'Active',
    },
  },
  ND: {
    engine: 'html_page',
    note: 'Страница адвоката на ndcourts.gov (номер из 5 цифр).',
    config: {
      urlTemplate: 'https://www.ndcourts.gov/lawyers/{bar_number}',
      numberPad: '5',
      nameSelector: 'css:article.lawyer h1',
      numberSelector: 'css:dt:contains("Bar ID") + dd',
      statusSelector: 'css:dt:contains("Status") + dd',
      activeValues: 'Active',
      admittedSelector: 'css:dt:contains("Admitted") + dd',
      firmSelector: 'css:dt:contains("Law Firm") + dd',
      profileUrl: 'https://www.ndcourts.gov/lawyers/{bar_number}',
    },
  },
  OH: {
    engine: 'generic_rest',
    note: 'Attorney Search Верховного суда Огайо (POST с CSRF-токеном страницы; неофициальный адрес).',
    config: {
      bootstrapUrl: 'https://www.supremecourt.ohio.gov/AttorneySearch/',
      csrfSelector: 'css:meta[name=csrf-token]@content',
      csrfHeader: 'X-CSRF-TOKEN',
      urlTemplate: 'https://www.supremecourt.ohio.gov/AttorneySearch/Ajax.ashx',
      authType: 'none',
      method: 'POST',
      bodyType: 'form',
      bodyTemplate:
        'action=SearchAttorney&attyReg={bar_number}&firstName=&lastName=&middleName=&address=&city=&state=&county=&zip=&myLanguages=%5B%5D',
      headers: '{"X-Requested-With":"XMLHttpRequest"}',
      recordPath: 'MySearchResults',
      numberPath: 'AttorneyNumber',
      statusPath: 'Status',
      firstNamePath: 'FirstName',
      lastNamePath: 'LastName',
      admittedPath: 'AdmissionDate',
      activeValues: 'Active',
    },
  },
  OK: {
    engine: 'html_page',
    note: 'Member Verification Oklahoma Bar Association (поиск по Bar ID).',
    config: {
      urlTemplate:
        'https://my.okbar.org/member-verification/?keyword={bar_number}',
      numberFormat: 'digits',
      recordSelector: 'css:.component-card-listing',
      numberSelector: 'label:Bar ID:',
      nameSelector: 'css:h4',
      statusSelector: 'label:Membership: && label:Status:',
      activeValues: 'Active / Good Standing',
      admittedSelector: 'label:Admit Date:',
      profileUrl:
        'https://my.okbar.org/member-verification/?keyword={bar_number}',
    },
  },
  OR: {
    engine: 'html_page',
    note: 'Licensee Directory Oregon State Bar (нужен Referer страницы поиска).',
    config: {
      urlTemplate:
        'https://www.osbar.org/members/membersearch_display.asp?b={bar_number}&s=1',
      referer: 'https://www.osbar.org/members/membersearch_start.asp',
      numberFormat: 'digits',
      nameSelector: 'css:#tbl_member td.adminheader',
      numberSelector: 'css:#mnum',
      statusSelector: 'css:#mstatus',
      activeValues: 'Active',
      admittedSelector: 'css:#madmitdate',
    },
  },
  PA: {
    engine: 'html_page',
    note: 'Профиль Disciplinary Board of the Supreme Court of Pennsylvania.',
    config: {
      urlTemplate:
        'https://www.padisciplinaryboard.org/for-the-public/find-attorney/attorney-detail/{bar_number}',
      numberFormat: 'digits',
      nameSelector: 'css:main h1',
      numberSelector: 'css:dt:contains("Attorney ID") + dd',
      statusSelector: 'css:dt:contains("Current Status") + dd',
      activeValues: 'Active',
      admittedSelector: 'css:dt:contains("Date of Admission") + dd',
      firmSelector: 'css:dt:contains("Employer") + dd',
      profileUrl:
        'https://www.padisciplinaryboard.org/for-the-public/find-attorney/attorney-detail/{bar_number}',
    },
  },
  TX: {
    engine: 'html_page',
    note: 'Find a Lawyer State Bar of Texas: поиск по Bar Card Number, затем профиль.',
    config: {
      urlTemplate:
        'https://www.texasbar.com/AM/Template.cfm?Section=Find_A_Lawyer&Template=/CustomSource/MemberDirectory/Result_form_client.cfm',
      method: 'POST',
      bodyTemplate: 'BarCardNumber={bar_number}&Submitted=1',
      numberPad: '8',
      detailLinkSelector: 'css:a[href*="MemberDirectoryDetail.cfm"]',
      numberSelector: 'label:Bar Card Number:',
      nameSelector:
        'css:.vcard .given-name ++ css:.vcard .additional-name ++ css:.vcard .family-name',
      statusSelector: 'css:#member_status_detail_ui_dialog_anchor',
      activeValues: 'Eligible to Practice in Texas',
      admittedSelector: 'label:TX License Date:',
    },
  },
  WA: {
    engine: 'html_page',
    note: 'Legal Directory WSBA (нужны cookie стартовой страницы; номер из 12 цифр).',
    config: {
      bootstrapUrl:
        'https://www.mywsba.org/PersonifyEbusiness/LegalDirectory.aspx',
      urlTemplate:
        'https://www.mywsba.org/PersonifyEbusiness/LegalDirectory/LegalProfile.aspx?Usr_ID={bar_number}',
      numberPad: '12',
      nameSelector: 'css:span[id$=lblMemberName]',
      numberSelector: 'css:span[id$=lblMemberNo]',
      statusSelector:
        'css:span[id$=lblStatus] && css:span[id$=lblEligibleToPractice]',
      activeValues: 'Active / Yes',
      admittedSelector: 'css:span[id$=lblWaAdmitDate]',
      profileUrl:
        'https://www.mywsba.org/PersonifyEbusiness/LegalDirectory/LegalProfile.aspx?Usr_ID={bar_number}',
    },
  },
};

/**
 * Why a state stays manual (live checks 2026-10-28). Captchas, bot walls,
 * logins, "I accept" terms and robots.txt bans are never worked around.
 */
export const MANUAL_REASONS: Readonly<Record<string, string>> = {
  AK: 'Нет поиска по номеру (только список членов).',
  AL: 'Поиск только по имени (iMIS), поля номера нет.',
  AZ: 'В форме поиска нет поля номера.',
  CT: 'robots.txt сайта (lookup.jud.ct.gov) запрещает автоматический доступ. Прямая ссылка на номер есть.',
  DC: 'reCAPTCHA.',
  DE: 'Публичного поиска нет (только вход); проверка по телефону (302) 739-4155.',
  GA: 'Динамический сайт (gabar.reliaguide.com), поиск по номеру не подтверждён.',
  HI: 'Поиск только по имени.',
  IA: 'Поиск только по имени.',
  ID: 'Поиск только по фамилии.',
  IL: 'В форме нет поля номера.',
  KS: 'Cloudflare блокирует автоматические запросы.',
  KY: 'Поиск только по имени.',
  LA: 'Капча (LSBA).',
  ME: 'robots.txt сайта (apps.web.maine.gov, Disallow: /cgi-bin/) запрещает автоматический доступ; к тому же справочник не подтверждает good standing.',
  MA: 'JS-приложение (Salesforce), без браузера не читается; не подтверждено.',
  MD: 'Поиск только по имени.',
  MI: 'Внутренний JSON требует сессию сайта (DNN); не подтверждено.',
  MN: 'reCAPTCHA.',
  MT: 'reCAPTCHA v3, поиск только по имени.',
  NE: 'Публичный JSON не фильтрует по номеру, номер в ответе пустой.',
  NH: 'Справочник только после входа.',
  NJ: 'Защита Incapsula (403 для автоматических запросов).',
  NM: 'Поиск только по имени.',
  NV: 'Динамический сайт; поиск по номеру не подтверждён.',
  RI: 'Нужно принять условия («I ACCEPT») — за пользователя условия не принимаем.',
  SC: 'Публичного поиска нет (scbar.org — вход).',
  SD: 'Cloudflare блокирует автоматические запросы.',
  TN: 'Сайт отвечает 403 автоматическим запросам.',
  UT: 'JS-приложение, без браузера не читается.',
  VA: 'Сайт отвечает 403 и показывает капчу.',
  VT: 'Публичного поиска нет.',
  WI: 'CAPTCHA.',
  WV: 'Cloudflare блокирует автоматические запросы.',
  WY: 'Сайт блокирует автоматические запросы.',
};

export type RegistrySupport =
  | {
      mode: 'automatic';
      adapter: 'ny_open_data' | 'state_preset';
      note: string;
    }
  | { mode: 'manual'; reason: string };

/** How [stateCode] can be checked (for the admin page and the guide). */
export function registrySupport(stateCode: string): RegistrySupport {
  if (stateCode === 'NY') {
    return {
      mode: 'automatic',
      adapter: 'ny_open_data',
      note: 'Открытые данные data.ny.gov (официальный набор, без ключа).',
    };
  }
  const p = STATE_PRESETS[stateCode];
  if (p) return { mode: 'automatic', adapter: 'state_preset', note: p.note };
  return {
    mode: 'manual',
    reason: MANUAL_REASONS[stateCode] ?? 'Автоматическая проверка не найдена.',
  };
}
