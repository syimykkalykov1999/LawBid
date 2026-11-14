import { parseParam } from './url-state';

/** Scout 13.11 (row 96): the tabs of «Кейсы» live in the address (`?tab=disputes`, `?tab=contact-issues`). */
export type CaseTab = 'cases' | 'disputes' | 'contact-issues';
export const CASE_TABS: readonly CaseTab[] = ['cases', 'disputes', 'contact-issues'];

/** The tab from `?tab=`; the old `?tab=contact` opens «Не могу связаться», anything unknown = «Все кейсы». */
export function caseTabFrom(raw: string | null): CaseTab {
  return parseParam<CaseTab>(raw === 'contact' ? 'contact-issues' : raw, 'cases', CASE_TABS);
}
