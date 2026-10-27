import { Reflector } from '@nestjs/core';
import {
  JUSTIFICATION_KEY,
  type AdminActor,
} from '../admin-auth/admin-auth.decorators';
import { AdminCaseManagementController } from './admin-case-management.controller';
import { AdminCasesController } from './admin-cases.controller';
import type { AdminCaseManagementService } from './admin-case-management.service';

/**
 * Scout S3-1 (owner 2026-10-28): the case card, dispute card and contact
 * issue card carry private details / journal / bids, so opening them needs
 * an audited reason (the audit interceptor skips plain GETs).
 */
describe('admin case detail reads need a justification', () => {
  const reflector = new Reflector();
  const needs = (proto: object, name: string): boolean =>
    reflector.get<boolean>(
      JUSTIFICATION_KEY,
      (proto as Record<string, () => unknown>)[name],
    ) === true;

  it('the case card, dispute card and contact-issue card are @Justification()', () => {
    expect(needs(AdminCaseManagementController.prototype, 'getAdminCase')).toBe(
      true,
    );
    expect(needs(AdminCasesController.prototype, 'getCaseDispute')).toBe(true);
    expect(needs(AdminCasesController.prototype, 'getContactIssue')).toBe(true);
  });

  it('the lists stay open (no private body in the rows)', () => {
    expect(
      needs(AdminCaseManagementController.prototype, 'listAdminCases'),
    ).toBe(false);
    expect(needs(AdminCasesController.prototype, 'listCaseDisputes')).toBe(
      false,
    );
  });

  describe('private_details visibility on the case card', () => {
    const card = jest.fn().mockResolvedValue({});
    const controller = new AdminCaseManagementController({
      card,
    } as unknown as AdminCaseManagementService);
    const actor = (
      adminRole: AdminActor['adminRole'],
      justification: string | null,
    ): AdminActor => ({
      id: 'a1',
      adminRole,
      sessionId: 's',
      justification,
      countries: null,
      ip: null,
    });

    beforeEach(() => card.mockClear());

    it('a moderator without a reason never gets privateDetails', async () => {
      await controller.getAdminCase(actor('moderator', null), { id: 'c1' });
      expect(card).toHaveBeenCalledWith('c1', null, {
        includePrivateDetails: false,
      });
    });

    it('a moderator with a reason gets them (and the read is audited)', async () => {
      await controller.getAdminCase(actor('moderator', 'report #123 review'), {
        id: 'c1',
      });
      expect(card).toHaveBeenCalledWith('c1', null, {
        includePrivateDetails: true,
      });
    });

    it('support and the owner keep today’s behaviour', async () => {
      await controller.getAdminCase(actor('support', 'dispute check ok'), {
        id: 'c1',
      });
      await controller.getAdminCase(actor('super_admin', null), { id: 'c1' });
      expect(card).toHaveBeenNthCalledWith(1, 'c1', null, {
        includePrivateDetails: true,
      });
      expect(card).toHaveBeenNthCalledWith(2, 'c1', null, {
        includePrivateDetails: true,
      });
    });
  });
});
