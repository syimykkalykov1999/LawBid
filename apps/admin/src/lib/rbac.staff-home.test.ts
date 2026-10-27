import { describe, expect, it } from 'vitest';
import { NAV_PLACE } from './nav-groups';
import { canOpen, groupFor, groupsFor, sectionFor, tabsFor } from './rbac';
import { STAFF_NAV_SWITCHES } from '@/components/shell/use-off-flags';

type AccessSubject = NonNullable<Parameters<typeof canOpen>[0]>;

const owner: AccessSubject = { role: 'super_admin', permissions: {}, workspacesEnabled: true, workspace: 'owner' } as AccessSubject;
const mass: AccessSubject = { role: 'moderator', permissions: { moderation: 'manage' }, workspacesEnabled: true, workspace: 'mass' } as AccessSubject;
const head: AccessSubject = { ...mass, workspaceHead: true } as AccessSubject;
const deputy: AccessSubject = { role: 'support', permissions: {}, canManageAdmins: true, workspacesEnabled: true } as AccessSubject;

const NEW_PAGES = ['/today', '/staff', '/staff/appeals', '/staff/rates'];

describe('staff package T10: the owner pages in the menu', () => {
  it('«Сегодня» is the first item of the «Сегодня» group; the cockpit sits in «Команда и контроль»', () => {
    expect(NAV_PLACE['/today']).toEqual({ group: 'today', order: 0 });
    for (const href of ['/staff', '/staff/appeals', '/staff/rates']) {
      expect(NAV_PLACE[href].group, href).toBe('team');
    }
    expect(groupFor('/today', owner)?.label).toBe('Сегодня');
    expect(groupFor('/staff/rates/x', owner)?.label).toBe('Команда и контроль');
    // longest href wins: the complaints page is not «Люди и рейтинг»
    expect(tabsFor(owner, '/staff/appeals').map((t) => t.href)).toContain('/staff/appeals');
  });

  it('only the owner opens them; the head, workers and the deputy get «not found»', () => {
    for (const href of NEW_PAGES) {
      expect(canOpen(owner, href), href).toBe(true);
      for (const me of [mass, head, deputy]) expect(canOpen(me, href), `${href} ${me.role}`).toBe(false);
    }
  });

  it('/desk stays outside the sections: a worker\'s desk must keep opening (T8)', () => {
    expect(NAV_PLACE['/desk']).toBeUndefined();
    expect(sectionFor('/desk/support')).toBeUndefined();
  });

  it('each page is hidden while its switch is off, shown when it is not in the off set', () => {
    const allOff = new Set<string>(STAFF_NAV_SWITCHES);
    const flat = (off: Set<string>) => groupsFor(owner, off).flatMap((g) => g.items.map((s) => s.href));
    for (const href of NEW_PAGES) expect(flat(allOff), href).not.toContain(href);
    for (const href of NEW_PAGES) expect(flat(new Set()), href).toContain(href);
    // one switch opens only its page
    const onlyRating = new Set(STAFF_NAV_SWITCHES.filter((k) => k !== 'staff.rating_enabled'));
    expect(flat(onlyRating)).toContain('/staff');
    expect(flat(onlyRating)).not.toContain('/today');
  });

  it('the switches the menu waits for are exactly the ones the pages declare', () => {
    expect([...STAFF_NAV_SWITCHES].sort()).toEqual(['staff.appeals_enabled', 'staff.owner_home_enabled', 'staff.piecework_enabled', 'staff.rating_enabled']);
  });
});
