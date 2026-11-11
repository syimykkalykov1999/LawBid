import 'reflect-metadata';
import {
  ASSISTANT_SELF,
  ATTORNEY_ONLY,
  REQUIRES_DUTY,
} from './assistant-context';
import { AuthController } from '../auth.controller';
import { ContactsSyncController } from '../../contacts-sync/contacts-sync.controller';
import { GroupsController } from '../../groups/groups.controller';
import { GroupSharedController } from '../../groups/group-shared.controller';
import { ChannelsController } from '../../channels/channels.controller';
import { LegalQaController } from '../../legal-qa/legal-qa.controller';
import { ReferralsController } from '../../referrals/referrals.controller';
import { PartnersController } from '../../partners/partners.controller';
import { LegalController } from '../../legal/legal.controller';
import { StarsController } from '../../stars/stars.controller';
import { PromotionsController } from '../../promotions/promotions.controller';
import { CaseContactsController } from '../../cases/contacts/case-contacts.controller';
import { CasePaymentsController } from '../../case-payments/case-payments.controller';
import { BidDetailController } from '../../cases/case-bids/bid-detail.controller';
import { MineController } from '../../cases/mine/mine.controller';
import { CaseCommentsController } from '../../case-comments/case-comments.controller';
import { CaseInvitesController } from '../../cases/case-invites/case-invites.controller';
import { CasesFeedController } from '../../cases/cases-feed.controller';
import { FilesController } from '../../files/files.controller';

/**
 * Owner 2026-10-22 (security audit #3, finding 1): the JwtAuthGuard swaps
 * an assistant's token for the attorney unless the route says otherwise.
 * These markers are the whole defence, so a refactor that drops one must
 * fail here, not in production.
 */
type Ctor = { prototype: object; name: string };
const handler = (c: Ctor, name: string) =>
  (c.prototype as Record<string, unknown>)[name] as object;
const meta = (key: string, c: Ctor, name?: string): unknown =>
  name
    ? Reflect.getMetadata(key, handler(c, name))
    : Reflect.getMetadata(key, c);
const attorneyOnlyHandlers = (c: Ctor, value: unknown = true) =>
  Object.getOwnPropertyNames(c.prototype).filter(
    (n) => n !== 'constructor' && meta(ATTORNEY_ONLY, c, n) === value,
  );

describe('assistant gates (security audit #3)', () => {
  it('the whole AuthController acts on the assistant themself', () => {
    expect(meta(ASSISTANT_SELF, AuthController)).toBe(true);
  });

  it('contacts sync stores the assistant’s own address book', () => {
    expect(meta(ASSISTANT_SELF, ContactsSyncController)).toBe(true);
  });

  // Security audit 2026-11-08 (BFLA): reading a client's phone/e-mail is a
  // case duty; an undecorated route would let a duty-less assistant read it
  // through the attorney's inherited identity.
  it('client contacts need the "cases" duty', () => {
    expect(meta(REQUIRES_DUTY, CaseContactsController)).toBe('cases');
  });

  it('group chats need the "chats" duty, like direct chats', () => {
    expect(meta(REQUIRES_DUTY, GroupsController)).toBe('chats');
    expect(meta(REQUIRES_DUTY, GroupSharedController)).toBe('chats');
  });

  it('channels need "chats"; broadcasting needs "publish"', () => {
    expect(meta(REQUIRES_DUTY, ChannelsController)).toBe('chats');
    expect(attorneyOnlyHandlers(ChannelsController, 'publish').sort()).toEqual([
      'channelAddAdmin',
      'channelAddComment',
      'channelCreate',
      'channelCreatePost',
      'channelCreateVideoUpload',
      'channelEditPost',
      'channelRemove',
      'channelRemoveAdmin',
      'channelRemoveComment',
      'channelRemovePost',
      'channelUpdate',
    ]);
  });

  // R-401 (owner 2026-11-04): its own duty «qa_answers», no longer «publish».
  it('a public Q&A answer needs "qa_answers"', () => {
    expect(
      attorneyOnlyHandlers(LegalQaController, 'qa_answers').sort(),
    ).toEqual([
      'answerQuestion',
      'deleteQuestionAnswer',
      // Audit 2026-11-08 (L2): a like is also given in the attorney's name.
      'likeQuestionAnswer',
      'unlikeQuestionAnswer',
    ]);
    expect(attorneyOnlyHandlers(LegalQaController, 'publish')).toEqual([]);
  });

  it('finding 3: stars and paid promotions spend the attorney’s money', () => {
    // Audit 2026-11-08 (L2): the balance, history and spend reads too.
    expect(attorneyOnlyHandlers(StarsController).sort()).toEqual([
      'buyStars',
      'convertGift',
      'getStarsPurchase',
      'sendGiftToProfile',
      'setGiftShown',
      'starsHistory',
      'starsOverview',
    ]);
    expect(attorneyOnlyHandlers(PromotionsController).sort()).toEqual([
      'createCasePromotion',
      'createPostPromotion',
      'getCasePromotion',
      'getPostPromotion',
      'getPromotionQuote',
      'listMyPromotions',
      'promotionStats',
      'stopPromotion',
    ]);
  });

  // Security audit 2026-11-08 (M4): a duty-less assistant read the
  // attorney's payments, ledger CSV, receipts and payout account.
  it('case payments need the "cases" duty; the payout account is the attorney’s', () => {
    const duty = (n: string) => meta(REQUIRES_DUTY, CasePaymentsController, n);
    const caseWork = Object.getOwnPropertyNames(
      CasePaymentsController.prototype,
    ).filter((n) => n !== 'constructor' && duty(n) === 'cases');
    expect(caseWork.sort()).toEqual([
      'cancelPaymentRequest',
      'createPaymentRequests',
      'exportMyCasePayments',
      'getCasePayment',
      'getCasePaymentReceipt',
      'getCasePayments',
      'getMyCasePaymentsSummary',
      'listMyCasePayments',
      'listPaymentRequests',
    ]);
    // Audit 2026-11-08 (L2): payout set-up and money moves too.
    expect(attorneyOnlyHandlers(CasePaymentsController).sort()).toEqual([
      'answerFeePayer',
      'cancelCasePayment',
      'createCasePayment',
      'getPayoutAccount',
      'getPayoutDashboard',
      'refundCasePayment',
      'startPayoutOnboarding',
      'updatePayoutPreferences',
    ]);
    // What a client needs to pay stays open to every role.
    expect(duty('getPaymentSettings')).toBeUndefined();
    expect(duty('getPaymentQuote')).toBeUndefined();
  });

  it('referral, partner terms and DMCA statements are the attorney’s own', () => {
    // Audit 2026-11-08 (L2): + my referrals, my partner dashboard, my DMCA.
    expect(attorneyOnlyHandlers(ReferralsController)).toHaveLength(2);
    expect(attorneyOnlyHandlers(PartnersController)).toHaveLength(3);
    expect(attorneyOnlyHandlers(LegalController)).toHaveLength(3);
  });
  // Security audit 2026-11-08 (L2): the routes the audit found open to a
  // duty-less assistant. The guard is now deny-by-default as well, so these
  // markers say WHICH duty opens them.
  it('L2: bids, my work, case comments, invites, saved items and files need a duty', () => {
    expect(meta(REQUIRES_DUTY, BidDetailController, 'getBid')).toEqual([
      'cases',
      'bids',
      'bid_drafts',
    ]);
    expect(meta(REQUIRES_DUTY, MineController, 'listMyBids')).toEqual([
      'cases',
      'bids',
      'bid_drafts',
    ]);
    expect(meta(REQUIRES_DUTY, MineController, 'listMyWork')).toBe('cases');
    expect(meta(REQUIRES_DUTY, MineController, 'listSavedItems')).toBe('cases');
    expect(meta(REQUIRES_DUTY, MineController, 'openCaseConversation')).toBe(
      'chats',
    );
    for (const n of [
      'listCaseComments',
      'shareCase',
      'listCaseCommentReplies',
      'likeCaseComment',
      'unlikeCaseComment',
    ]) {
      expect(meta(REQUIRES_DUTY, CaseCommentsController, n)).toBe('cases');
    }
    expect(meta(REQUIRES_DUTY, CaseInvitesController, 'getInvite')).toBe(
      'cases',
    );
    expect(meta(REQUIRES_DUTY, CaseInvitesController, 'cancelInvite')).toBe(
      'cases',
    );
    expect(meta(REQUIRES_DUTY, CasesFeedController, 'saveItem')).toBe('cases');
    const fileDuties = meta(REQUIRES_DUTY, FilesController, 'get') as string[];
    expect(fileDuties).not.toContain('calls');
    expect(meta(REQUIRES_DUTY, FilesController, 'views')).toEqual(fileDuties);
  });
});
