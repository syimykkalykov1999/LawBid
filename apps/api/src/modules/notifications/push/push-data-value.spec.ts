import { pushDataValue, pushDeepLink } from './push-dispatcher';

describe('pushDataValue (push data are strings only)', () => {
  it('keeps strings, writes finite numbers as digits, drops the rest', () => {
    expect(pushDataValue('r-1')).toBe('r-1');
    // owner row 87: the hotline notice's «until when» reaches the phone
    expect(pushDataValue(1795579271328)).toBe('1795579271328');
    expect(pushDataValue(Number.NaN)).toBeUndefined();
    expect(pushDataValue(null)).toBeUndefined();
    expect(pushDataValue({ a: 1 })).toBeUndefined();
    expect(pushDataValue(true)).toBeUndefined();
  });
});

describe('pushDeepLink (pack C, round 2 #1): a tap opens the right screen', () => {
  it.each([
    // [type, payload the server stores, fields the app router needs]
    [
      'legal_answer_update',
      { kind: 'answered', questionId: 'q1' },
      { questionId: 'q1' },
    ],
    ['legal_question_new', { questionId: 'q2' }, { questionId: 'q2' }],
    [
      'case_workspace_activity',
      { caseId: 'c1', kind: 'deal_record_signed', dealRecordId: 'd1' },
      { caseId: 'c1', dealRecordId: 'd1' },
    ],
    ['consultation_update', { consultationId: 'k1' }, { consultationId: 'k1' }],
    [
      'review_received',
      { reviewId: 'r1', reply: true, actorUsername: 'jane' },
      { reviewId: 'r1', reply: 'true', actorUsername: 'jane' },
    ],
    [
      'review_received',
      { reviewId: 'r2', reply: true, clientReview: true },
      { reply: 'true', clientReview: 'true' },
    ],
    ['channel_post', { channelId: 'ch1', postId: 'p1' }, { channelId: 'ch1' }],
    ['group_invite', { inviteId: 'i1' }, { inviteId: 'i1' }],
    ['new_message', { groupId: 'g1', conversationId: 'x' }, { groupId: 'g1' }],
  ])('%s carries %j', (type, payload, wanted) => {
    const data = pushDeepLink('n1', type, payload);
    expect(data).toMatchObject({ notificationId: 'n1', type, ...wanted });
    for (const v of Object.values(data)) expect(typeof v).toBe('string');
  });

  it('a false flag is not sent; a missed call stays «1»', () => {
    expect(pushDeepLink('n', 't', { reply: false })).not.toHaveProperty(
      'reply',
    );
    expect(pushDeepLink('n', 't', { missed: true }).missed).toBe('1');
  });
});
