/**
 * Owner 2026-10-16: where each state's bar-number rule comes from (research
 * 2026-10-16: state bar / court pages and the public lookups). `low` means
 * the official page states no format and the rule is deliberately wide; a
 * number that does not fit is never refused, it goes to a person (see
 * `FORMAT_UNUSUAL_FLAG`), and the admin sees new shapes under «Реестры».
 */
export const BAR_FORMAT_SOURCES: Readonly<
  Record<
    string,
    {
      confidence: 'high' | 'medium' | 'low';
      lookup: string | null;
      sources: readonly string[];
      note: string;
    }
  >
> = {
  AK: {
    confidence: 'medium',
    lookup: 'https://alaskabar.org/for-lawyers/member-statistics',
    sources: [
      'https://www.courtrules.net/alaska/alaska-bar-bylaws/rule-ii-6',
      'https://alaskabar.org/for-lawyers/member-statistics',
    ],
    note: 'Directory URL not confirmed to be the exact lawyer-search page (alaskabar.org Lawyer Directory); could not confirm search-by-number or a per-number URL. Regex tolerates dropped leading zeros.',
  },
  AL: {
    confidence: 'medium',
    lookup: 'https://www.alabar.org/members/',
    sources: [
      'https://www.alabar.org/members/',
      'https://www.almd.uscourts.gov/sites/default/files/documents/forms/2026-01/NEW%202026%20Application%20for%20Attorney%20Renewal.pdf',
    ],
    note: 'ASB format taken from a federal court form sample, not a state bar statement. Exact member-search URL (members.alabar.org Find a Member) not verified.',
  },
  AR: {
    confidence: 'low',
    lookup: 'https://attorneyinfo.aoc.arkansas.gov/',
    sources: [
      'https://www.arcourts.gov/sites/default/files/formatted-files/ProHacViceForm_0.pdf',
      'https://lawyers.justia.com/lawyer/jim-c-klepper-236808',
    ],
    note: 'No official statement of format found. 7-digit variant is recollection only. Lookup URL from search mention of attorneyinfo portal (may require login for account functions).',
  },
  AZ: {
    confidence: 'low',
    lookup: 'https://www.azbar.org/FindALawyer',
    sources: [
      'https://www.azbar.org/FindALawyer',
      'https://www.azbar.org/for-the-public/public-service-center-self-help-education/faqs',
    ],
    note: 'No official format statement; unconfirmed whether directory searches by number.',
  },
  CA: {
    confidence: 'medium',
    lookup: 'https://apps.calbar.ca.gov/attorney/Licensee/Search',
    sources: [
      'https://apps.calbar.ca.gov/attorney/Licensee/Detail/147639',
      'https://apps.calbar.ca.gov/attorney/Licensee/Detail/347628',
    ],
    note: 'Format derived from profile URLs, not a written spec. Search page path not fetched (assumed standard).',
  },
  CO: {
    confidence: 'medium',
    lookup:
      'https://www.coloradolegalregulation.com/attorney-search/attorney-information/',
    sources: [
      'https://www.coloradolegalregulation.com/attorney-search/attorney-information/?regnum=257',
      'https://www.coloradolegalregulation.com/attorney-search/attorney-information/',
    ],
    note: 'No Socrata/open dataset found; roster is by paid request. Upper digit count unconfirmed.',
  },
  CT: {
    confidence: 'medium',
    lookup:
      'https://www.jud.ct.gov/attorneyfirminquiry/attorneyfirminquiry.aspx',
    sources: [
      'https://jud.ct.gov/attorneyfirminquiry/attorneyfirminquiry.aspx',
      'https://jud.ct.gov/faq/attorney.html',
    ],
    note: 'Digit count from third-party example. PHV (type F) attorneys appear with PHV in name; their juris number shape unconfirmed. Lookup accepts juris number in a form field; no stable per-number URL.',
  },
  DC: {
    confidence: 'low',
    lookup: 'https://www.dcbar.org/',
    sources: [
      'https://dcbar.org/for-lawyers/membership/frequently-asked-questions',
    ],
    note: 'Could not find an official format or public member-search page in results; verify. 7-digit numbers believed to exist for recent admittees (unverified).',
  },
  DE: {
    confidence: 'low',
    lookup: 'https://www.dsba.org/',
    sources: ['https://www.dsba.org/?p=104'],
    note: 'No official format found; no confirmed public attorney lookup; DSBA directory may be members only.',
  },
  FL: {
    confidence: 'medium',
    lookup: 'https://www.floridabar.org/directories/find-mbr/',
    sources: [
      'https://www.floridabar.org/directories/find-mbr/profile/?num=682101',
      'https://www.floridabar.org/directories/find-mbr/profile/?num=3433',
    ],
    note: 'Max observed 6 digits; 7 allowed since numbers approach 1,000,000. Padded forms (0107547) accepted by regex.',
  },
  GA: {
    confidence: 'low',
    lookup: 'https://www.gabar.org/',
    sources: [
      'https://efast.gaappeals.us/files/20%20-%20Attorney%20Admission%20Forms/ATTORNEY%20ADMISSIONS%20APPLICATIONS/2013/BATES,%20SHATORREE_120708_2013.PDF',
      'https://en.wikipedia.org/wiki/State_Bar_of_Georgia',
    ],
    note: 'Directory is Find A Lawyer (CloudLawyers) on gabar.org; exact search URL and per-number URL not verified (set same as home).',
  },
  HI: {
    confidence: 'low',
    lookup: 'https://hsba.org/find-a-lawyer',
    sources: [
      'https://hsba.org/HSBA_2020/Membership/Lawyer_Resources/Resignation_of_License.aspx',
      'https://hsba.org/find-a-lawyer',
    ],
    note: 'Directory searches by name; current max digits unconfirmed.',
  },
  IA: {
    confidence: 'low',
    lookup: 'https://www.iacourtcommissions.org/ords/f?p=106%3A10',
    sources: [
      'https://www.iowacourts.gov/opr/attorneys/attorney-practice/frequently-asked-questions/admissions/',
      'https://www.iacourtcommissions.org/ords/f?p=106%3A10',
    ],
    note: "Iowa has no true bar number; AT-pin digit count not confirmed by the official page. Commission ID is internal, don't use.",
  },
  ID: {
    confidence: 'low',
    lookup: 'https://isb.idaho.gov/licensing-mcle/attorney-roster/',
    sources: [
      'https://apps.isb.idaho.gov/licensing/labels_lists.html',
      'https://isb.idaho.gov/licensing-mcle/mailing-lists/',
    ],
    note: 'Format not documented; roster URL path unverified.',
  },
  IL: {
    confidence: 'high',
    lookup: 'https://www.iardc.org/lawyersearch.asp',
    sources: [
      'https://www.mcleboard.org/files/FAQs/ProviderFAQs/Recordkeeping/What_is_an_attorney_ARDC_number.aspx',
    ],
    note: 'Official Illinois statement is by the MCLE Board; ARDC number is not public via the lawyer search (name-only), so it cannot be verified by number.',
  },
  IN: {
    confidence: 'high',
    lookup: 'https://courtapps.in.gov/rollofattorneys',
    sources: ['https://www.in.gov/courts/help/attorney-search'],
    note: 'Because dashes are stripped, the county part merges with the sequence. Search needs the full number with dash; no per-number URL.',
  },
  KS: {
    confidence: 'low',
    lookup: 'https://directory-kard.kscourts.gov',
    sources: [
      'https://directory-kard.kscourts.gov',
      'https://kscourts.gov/Attorneys/Registration',
    ],
    note: 'Digit count from memory.',
  },
  KY: {
    confidence: 'medium',
    lookup: 'https://kybar.org/',
    sources: ['https://kentuckybenchandbar.epubxp.com/i/213936/69'],
    note: '6 digits allowed in case numbers outgrow 5; member-search URL not verified.',
  },
  LA: {
    confidence: 'low',
    lookup: 'https://www.lsba.org/',
    sources: ['https://www.lsba.org/'],
    note: 'Format from memory; no official evidence.',
  },
  MA: {
    confidence: 'low',
    lookup: 'https://www.massbbo.org/s/lawyer-search',
    sources: [
      'https://www.publiccounsel.net/directory/9/',
      'https://www.mass.gov/files/documents/2016/08/atty-infochange-form.pdf',
    ],
    note: 'Digit count from memory; lookup URL unverified.',
  },
  MD: {
    confidence: 'high',
    lookup: 'https://www.mdcourts.gov/attysearch',
    sources: [
      'https://mdcourts.gov/sites/default/files/import/lawyers/pdfs/aisregistration.pdf',
      'http://www.mdcourts.gov/attysearch',
    ],
    note: 'Official listing page describes name search only; per-number lookup not available.',
  },
  ME: {
    confidence: 'medium',
    lookup: 'https://www.mebaroverseers.org/',
    sources: [
      'https://www.courts.maine.gov/about/committees/board-overseers-bar.html',
      'https://lawyers.justia.com/lawyer/stephen-morrell-1008899',
    ],
    note: '6-digit statement is from search summary of the Board site; I could not re-open that page. Lookup URL is the Board home page.',
  },
  MI: {
    confidence: 'medium',
    lookup: 'https://dir.michbar.org',
    sources: [
      'https://www.michbar.org:443/file/generalinfo/pdfs/suspension.pdf',
      'https://community.icle.org/blogs/kanika-ferency/2017/07/03/the-life-of-p',
      'https://adbmich.org/about-us/attorney-database',
    ],
    note: 'Digit count from examples; some oldest numbers may have fewer digits.',
  },
  MN: {
    confidence: 'low',
    lookup: 'https://mars.courts.state.mn.us/',
    sources: ['https://mars.courts.state.mn.us/', 'https://lro.mn.gov/?p=73'],
    note: 'Format not documented; downloads not fetched or verified.',
  },
  MO: {
    confidence: 'low',
    lookup: 'https://mobar.org/public/LawyerDirectory.aspx',
    sources: [
      'https://mobar.org/public/LawyerDirectory.aspx',
      'https://www.courts.mo.gov/page.jsp?id=2041',
    ],
    note: 'Digit count unverified.',
  },
  MS: {
    confidence: 'low',
    lookup: 'https://www.courts.ms.gov/bar/barroll/barroll.php',
    sources: [
      'https://www.courts.ms.gov/bar/barroll/barroll.php',
      'https://www.courts.ms.gov:443/statistics/civil/BarrollMaster.pdf',
    ],
    note: 'Could not open official pages; digit count guessed.',
  },
  MT: {
    confidence: 'low',
    lookup: 'https://www.montanabar.org',
    sources: [
      'https://www.montanabar.org/about-us',
      'https://lawyers.law.cornell.edu/lawyer/katy-stack-1518565',
    ],
    note: 'No official format statement found; shape derived from third-party examples and general knowledge. Exact directory URL not confirmed.',
  },
  NC: {
    confidence: 'low',
    lookup: 'https://portal.ncbar.gov/Verification/search.aspx',
    sources: ['https://portal.ncbar.gov/Verification/search.aspx'],
    note: 'Format not officially documented in what I could read; max 250 results per search; no stable per-number URL (ASP.NET form).',
  },
  ND: {
    confidence: 'medium',
    lookup: 'https://www.ndcourts.gov/lawyers',
    sources: [
      'https://www.ndcourts.gov/lawyers/10265',
      'https://www.ndcourts.gov/lawyers/04891',
    ],
    note: 'URL needs the number zero-padded to 5 digits. Pro hac vice/temporary numbers differ and are not covered.',
  },
  NE: {
    confidence: 'low',
    lookup: 'https://supremecourt.nebraska.gov/',
    sources: [
      'https://rulesofcivilprocedure.com/ne/rule-1411/',
      'https://supremecourt.nebraska.gov/',
    ],
    note: 'Exact attorney-search URL not confirmed; format from one example plus general knowledge. The 09066 example came from an ndcourts.gov record found in the search, so the Nebraska attribution of that exa',
  },
  NH: {
    confidence: 'low',
    lookup: 'https://www.nhbar.org',
    sources: [
      'https://www.nhbar.org/about-the-bar',
      'https://www.justice.gov/eoir/attorney-licensing-verification',
    ],
    note: 'Could not confirm that the public directory exposes the ID number.',
  },
  NJ: {
    confidence: 'medium',
    lookup: 'https://www.njcourts.gov/attorneys',
    sources: [
      'https://www.njcourts.gov/sites/default/files/attorneys/new-jersey-lawyers-fund-client-protection/ineliglist.pdf',
      'https://njcourts.gov/sites/default/files/attorneys/reg-phv-attorney.pdf',
    ],
    note: 'Specific attorney search tool URL not confirmed (guessed page returned 404). 8-digit accepted in case leading zero is dropped.',
  },
  NM: {
    confidence: 'low',
    lookup: 'https://www.sbnm.org',
    sources: ['https://www.sbnm.org/Portals/NMBAR/NewMemberHandbook_1.pdf'],
    note: 'Format from general knowledge only; online directory may not search by number. CAID is a different identifier.',
  },
  NV: {
    confidence: 'low',
    lookup: 'https://nvbar.org',
    sources: ['https://nvbar.org/about-us/our-staff/'],
    note: 'Find a Colleague is login only (skipped). Public Find a Lawyer URL not confirmed.',
  },
  NY: {
    confidence: 'high',
    lookup: 'https://iapps.courts.state.ny.us/attorneyservices/search',
    sources: [
      'https://data.ny.gov/api/views/eqw2-r5nb',
      'https://data.ny.gov/resource/eqw2-r5nb.json',
    ],
    note: 'lookup_url is the Unified Court System attorney search (from knowledge, not fetched this session).',
  },
  OH: {
    confidence: 'medium',
    lookup: 'https://www.supremecourt.ohio.gov/AttorneySearch',
    sources: [
      'https://www.supremecourt.ohio.gov/attorneys/attorney-registration/atty-registration-faqs/',
      'https://www.supremecourt.ohio.gov/AttorneySearch',
    ],
    note: 'Search form fields not visible to the fetcher.',
  },
  OK: {
    confidence: 'low',
    lookup: 'https://www.okbar.org/findalawyer/',
    sources: ['https://www.okbar.org/findalawyer/'],
    note: 'Directory is voluntary so does not list every licensed attorney; format from general knowledge.',
  },
  OR: {
    confidence: 'medium',
    lookup: 'https://www.osbar.org/members/membersearch_start.asp',
    sources: ['https://www.osbar.org/members/membersearch_start.asp'],
    note: 'Form submission not exercised; results URL not captured.',
  },
  PA: {
    confidence: 'medium',
    lookup: 'https://www.padisciplinaryboard.org/for-the-public/find-attorney',
    sources: ['https://www.padisciplinaryboard.org/for-the-public'],
    note: 'Bulk data only via Public Data Request Procedures.',
  },
  RI: {
    confidence: 'low',
    lookup: 'https://www.ribar.com',
    sources: [
      'https://ribar.com/UserFiles/How to Update your Attorney Registration Information on RISCAP.pdf',
    ],
    note: 'Judiciary public attorney lookup URL not confirmed.',
  },
  SC: {
    confidence: 'low',
    lookup: 'https://www.sccourts.org/',
    sources: ['https://www.scbar.org/lawyers/directory/'],
    note: 'Exact URL of Judicial Branch attorney search not confirmed (guessed path 404); format from general knowledge.',
  },
  SD: {
    confidence: 'low',
    lookup: 'https://www.statebarofsouthdakota.com',
    sources: ['https://www.justice.gov/eoir/attorney-licensing-verification'],
    note: 'Format not established; regex is intentionally wide. Referral site findalawyerinsd.com is not a license lookup.',
  },
  TN: {
    confidence: 'medium',
    lookup: 'https://www.tbpr.org',
    sources: [
      'https://www.tbpr.org/news-publications/recent-disciplinary-actions?page=18',
    ],
    note: 'Online Attorney Directory exists but its page returned 403 to the fetcher; exact URL not confirmed.',
  },
  TX: {
    confidence: 'medium',
    lookup: 'https://www.texasbar.com/AM/Template.cfm?Section=Find_A_Lawyer',
    sources: [
      'https://www.texasbar.com/attorneys/member.cfm?id=194547',
      'https://www.texasbar.com/membership',
    ],
    note: 'Find-a-lawyer URL from memory, not confirmed this session; 5-7 digits accepted in case leading zeros are stripped.',
  },
  UT: {
    confidence: 'low',
    lookup: 'https://www.utahbar.org/public-services/find-a-lawyer/',
    sources: [
      'https://www.utahbar.org/public-services/find-a-lawyer/',
      'https://admissions.utahbar.org/phv-sponsoring',
    ],
    note: 'Could not confirm number search is supported.',
  },
  VA: {
    confidence: 'low',
    lookup: 'https://vsb.org/Shared_Content/Directory/va-lawyer-directory.aspx',
    sources: [
      'https://www.vsb.org',
      'https://policyrisk.com/state-bill/VA-HB555-2026',
    ],
    note: 'Format from general knowledge; regex wide.',
  },
  VT: {
    confidence: 'low',
    lookup: 'https://www.vermontjudiciary.org/attorneys',
    sources: ['https://www.vermontjudiciary.org/attorneys'],
    note: 'Format unknown; opengovny.com numbers are NY records and must not be used.',
  },
  WA: {
    confidence: 'low',
    lookup: 'https://www.mywsba.org/PersonifyEbusiness/LegalDirectory.aspx',
    sources: [
      'https://nwsidebar.wsba.org/2020/09/22/how-to-find-a-lawyer-using-wsbas-legal-directory/',
      'https://admissions.wsba.org/admission-policies',
    ],
    note: 'Directory URL from memory, not fetched.',
  },
  WI: {
    confidence: 'medium',
    lookup: 'https://www.wisbar.org/Pages/BasicLawyerSearch.aspx',
    sources: [
      'https://lawyerhistory.wicourts.gov/attorneys/1042958',
      'https://www.wisbar.org/Pages/BasicLawyerSearch.aspx',
    ],
    note: 'Older attorneys might have shorter numbers; 6 digits accepted.',
  },
  WV: {
    confidence: 'low',
    lookup: 'https://wvbar.org',
    sources: ['https://wvbar.org/2013-membership-directory'],
    note: 'Format from general knowledge; public directory may hide ID.',
  },
  WY: {
    confidence: 'high',
    lookup: 'https://www.wyomingbar.org/special/directory-profile/',
    sources: [
      'https://www.wyomingbar.org/special/directory-profile/?id=7-5749',
      'https://digitaleditions.walsworth.com/article/Office+of+Bar+Counsel/4287523/749774/article.html',
    ],
    note: 'Since separators are stripped, 75749 must be re-hyphenated as 7-5749 for the lookup URL. Prefix 8 expected eventually; regex allows 1-9.',
  },
};
