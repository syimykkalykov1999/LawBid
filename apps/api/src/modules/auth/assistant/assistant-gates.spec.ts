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

  it('a public Q&A answer needs "publish"', () => {
    expect(attorneyOnlyHandlers(LegalQaController, 'publish').sort()).toEqual([
      'answerQuestion',
      'deleteQuestionAnswer',
    ]);
  });

  it('finding 3: stars and paid promotions spend the attorney’s money', () => {
    expect(attorneyOnlyHandlers(StarsController).sort()).toEqual([
      'buyStars',
      'convertGift',
      'sendGiftToProfile',
      'setGiftShown',
    ]);
    expect(attorneyOnlyHandlers(PromotionsController).sort()).toEqual([
      'createCasePromotion',
      'createPostPromotion',
      'stopPromotion',
    ]);
  });

  it('referral, partner terms and DMCA statements are the attorney’s own', () => {
    expect(attorneyOnlyHandlers(ReferralsController)).toHaveLength(1);
    expect(attorneyOnlyHandlers(PartnersController)).toHaveLength(2);
    expect(attorneyOnlyHandlers(LegalController)).toHaveLength(2);
  });
});
