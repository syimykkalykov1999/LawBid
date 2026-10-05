/**
 * Owner 2026-10-04 ("только номер"): most states have no registry API, so
 * the verifier checks a license on the state's own lookup page. One link
 * per state (research 2026-10-03, project file verification/
 * lawyer-license-sources.xlsx); where the page has a stable address per
 * bar number, the number is filled in. Pages may change: a broken link
 * only costs the verifier a search.
 */
const SEARCH_PAGES: Readonly<Record<string, string>> = {
  AK: 'https://alaskabar.org/for-lawyers/member-directories/',
  AL: 'https://members.alabar.org/Meetings/Member_Portal/Member-Search.aspx',
  AR: 'https://attorneyinfo.aoc.arkansas.gov/info/attorney/attorneysearch.aspx',
  AZ: 'https://www.azbar.org/for-legal-professionals/practice-tools-management/member-directory/',
  CA: 'https://apps.calbar.ca.gov/attorney/LicenseeSearch/QuickSearch',
  CO: 'https://www.coloradolegalregulation.com/attorney-search/',
  CT: 'https://www.jud.ct.gov/attorneyfirminquiry/attorneyfirminquiry.aspx',
  DC: 'https://my.dcbar.org/memberdirectory',
  DE: 'https://rp470541.doelegal.com/vwPublicSearch/Show-VwPublicSearch-Table.aspx',
  FL: 'https://www.floridabar.org/directories/find-mbr/',
  GA: 'https://www.gabar.org/member-directory',
  HI: 'https://hsba.org/member-directory',
  IA: 'https://www.iacourtcommissions.org/ords/f?p=106:10',
  ID: 'https://isb.idaho.gov/licensing-mcle/attorney-roster-search/',
  IL: 'https://www.iardc.org/Lawyer/Search',
  IN: 'https://courtapps.in.gov/rollofattorneys/',
  KS: 'https://directory-kard.kscourts.gov/',
  KY: 'https://kybar.org/For-Public/Find-a-Lawyer',
  LA: 'https://www.lsba.org/Public/FindLegalHelp/FindAttorney.aspx',
  MA: 'https://www.massbbo.org/s/attorney-lookup',
  MD: 'https://www.mdcourts.gov/attysearch',
  ME: 'https://apps.web.maine.gov/cgi-bin/online/maine_bar/attorney_directory.pl',
  MI: 'https://www.michbar.org/memberdirectory/home',
  MN: 'https://mars.courts.state.mn.us/',
  MO: 'https://mobar.org/public/LawyerSearch.aspx',
  MS: 'https://courts.ms.gov/bar/barroll/barroll.php',
  MT: 'https://www.montanabar.org/find-a-lawyer',
  NC: 'https://portal.ncbar.gov/verification/search.aspx',
  ND: 'https://www.ndcourts.gov/lawyers',
  NE: 'https://www.nebar.com/?pg=AttyDirectoryLanding',
  NH: 'https://www.courts.nh.gov/lawyers',
  NJ: 'https://portalattysearch-cloud.njcourts.gov/',
  NM: 'https://www.sbnm.org/For-Public/I-Need-a-Lawyer/Online-Bar-Directory',
  NV: 'https://nvbar.org/for-the-public/find-a-lawyer/',
  NY: 'https://iapps.courts.state.ny.us/attorneyservices/search?0=',
  OH: 'https://www.supremecourt.ohio.gov/attorneysearch/',
  OK: 'https://ams.okbar.org/eweb/startpage.aspx?site=OKMEMBVER&design=no',
  OR: 'https://www.osbar.org/members/membersearch_start.asp',
  PA: 'https://www.padisciplinaryboard.org/for-the-public/find-attorney',
  RI: 'https://rijrs.courts.ri.gov/rijrs/attorney.do',
  SC: 'https://www.scbar.org/for-lawyers/quicklinks/member-directory/',
  SD: 'https://ujs.sd.gov/for-attorneys/attorney-resources/',
  TN: 'https://www.tbpr.org/for-the-public/online-attorney-directory',
  TX: 'https://www.texasbar.com/AM/Template.cfm?Section=Find_A_Lawyer&Template=%2FCustomSource%2FMemberDirectory%2FSearch_Form_Client_Main.cfm',
  UT: 'https://services.utahbar.org/Licensee-Directory',
  VA: 'https://vsb.org/Site/Shared_Content/Directory/Lookup.aspx',
  VT: 'https://www.vermontjudiciary.org/attorneys',
  WA: 'https://www.mywsba.org/personifyebusiness/LegalDirectory.aspx',
  WI: 'https://www.wisbar.org/Pages/BasicLawyerSearch.aspx',
  WV: 'https://wvbar.org/directory/',
  WY: 'https://www.wyomingbar.org/for-the-public/hire-a-lawyer/lawyer-search/',
};

/** Per-number profile pages. */
const PROFILE_PAGES: Readonly<Record<string, (n: string) => string>> = {
  CA: (n) => `https://apps.calbar.ca.gov/attorney/Licensee/Detail/${n}`,
  FL: (n) =>
    `https://www.floridabar.org/directories/find-mbr/profile/?num=${n}`,
};

/** True when the state's page takes the bar number in the URL (one tap
 * opens the attorney's record); false = a search page, the verifier pastes
 * the number («Скопировать номер»). */
export function stateBarLookupPrefilled(
  stateCode: string,
  barNumber: string,
): boolean {
  return Boolean(PROFILE_PAGES[stateCode] && barNumber.replace(/\D/g, ''));
}

/** Where a verifier checks [barNumber] in [stateCode]; null if unknown. */
export function stateBarLookupUrl(
  stateCode: string,
  barNumber: string,
): string | null {
  const digits = barNumber.replace(/\D/g, '');
  const profile = PROFILE_PAGES[stateCode];
  if (profile && digits) return profile(encodeURIComponent(digits));
  return SEARCH_PAGES[stateCode] ?? null;
}
