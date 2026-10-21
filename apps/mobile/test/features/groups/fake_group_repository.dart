import 'dart:math' as math;

import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/groups/data/group_repository.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// A group repository for widget tests: the Chats list (one page of
/// [items], the pin / mute / hide calls recorded in [updates]) and, with the
/// optional data, a whole group: [detail], its [thread], [topicList], join
/// [requestList], public search [found], the invite [previewed] and the
/// poll voters. Every other call answers with an empty future.
class FakeGroupRepository implements GroupRepository {
  FakeGroupRepository([
    this.items = const [],
    this.detail,
    this.thread = const [],
    this.topicList = const [],
    this.requestList = const [],
    this.found = const [],
    this.previewed,
    this.voterList = const [],
  ]);

  final List<api.GroupDto> items;
  final api.GroupDetailDto? detail;

  /// Newest first.
  final List<api.GroupMessageDto> thread;
  final List<api.GroupTopicDto> topicList;
  final List<api.GroupJoinRequestDto> requestList;
  final List<api.GroupInvitePreviewDto> found;
  final api.GroupInvitePreviewDto? previewed;
  final List<api.PollVoterOptionDto> voterList;
  final updates = <String>[];

  /// Makes every send fail, so a message stays «not delivered».
  bool failSend = false;

  @override
  Future<CursorPage<api.GroupDto>> groups({
    String? cursor,
    bool archived = false,
  }) async =>
      CursorPage(items: items);

  @override
  Future<api.GroupDetailDto> group(String id) async => detail!;

  @override
  Future<CursorPage<api.GroupMessageDto>> messages(
    String id, {
    String? topicId,
    String? cursor,
  }) async =>
      CursorPage(items: thread);

  @override
  Future<List<api.GroupTopicDto>> topics(String id) async => topicList;

  @override
  Future<List<api.GroupJoinRequestDto>> requests(String id) async =>
      requestList;

  @override
  Future<List<api.GroupInvitePreviewDto>> searchPublic(String q) async => found;

  @override
  Future<CursorPage<api.GroupInvitePreviewDto>> discover({
    String? cursor,
  }) async =>
      CursorPage(items: found);

  @override
  Future<api.GroupInvitePreviewDto> preview(String code) async => previewed!;

  @override
  Future<List<api.PollVoterOptionDto>> voters(
    String id,
    String pollId,
  ) async =>
      voterList;

  @override
  Future<api.GroupMessageDto> send(
    String id,
    api.SendGroupMessageDto body,
  ) async {
    if (failSend) {
      throw const ApiException(code: 'NETWORK_ERROR', message: 'offline');
    }
    return thread.first;
  }

  @override
  Future<void> read(String id, String lastReadMessageId) async {}

  @override
  Future<api.GroupDto> updateMine(String id, api.UpdateGroupMeDto body) async {
    updates.add(
      '$id:pinned=${body.pinned}:hidden=${body.hidden}:'
      'muted=${body.mutedUntil != null}:archived=${body.archived}',
    );
    return items.firstWhere((g) => g.id == id);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => Future<void>.value();
}

// --- Long-ish realistic data for the overflow tests ----------------------

final _at = DateTime.utc(2026, 10, 20, 12);

const _longTitle =
    'Alexandra Montgomery-Kim & partners: immigration and family law cases';
const _longDescription =
    'A place for the whole team to discuss open cases, share court dates, '
    'ask colleagues for a second opinion and keep every deadline visible.';

api.GroupPersonDto person(
  String id,
  String name, {
  bool attorney = false,
  bool verified = false,
}) =>
    api.GroupPersonDto(
      userId: id,
      displayName: name,
      username: name.toLowerCase().replaceAll(RegExp('[^a-z]'), '_'),
      kind: attorney
          ? api.GroupPersonDtoKind.attorney
          : api.GroupPersonDtoKind.client,
      verifiedBadge: verified,
    );

final people = [
  person('me', 'Alexandra Montgomery-Kim', attorney: true, verified: true),
  person('u1', 'Bartholomew Featherstonehaugh', attorney: true),
  person('u2', 'Anastasia Konstantinopolskaya'),
  person('u3', 'Jo'),
  person('u4', 'Wolfeschlegelsteinhausenberger Dorff', attorney: true),
];

api.GroupMemberDto member(api.GroupPersonDto p, api.GroupRole role) =>
    api.GroupMemberDto(
      userId: p.userId,
      rights: const [],
      displayName: p.displayName,
      username: p.username,
      kind: p.kind == api.GroupPersonDtoKind.attorney
          ? api.GroupMemberDtoKind.attorney
          : api.GroupMemberDtoKind.client,
      verifiedBadge: p.verifiedBadge,
      role: role,
      joinedAt: _at,
    );

api.GroupMessageDto message(
  String id, {
  required String body,
  api.GroupMessageDtoType type = api.GroupMessageDtoType.text,
  bool mine = false,
  int minutes = 0,
  api.GroupPersonDto? sender,
  api.GroupReplyPreviewDto? replyTo,
  api.ChatAttachmentDto? attachment,
  api.PollDto? poll,
  String? systemKind,
  List<api.GroupPersonDto>? systemPeople,
  String? systemText,
  bool mentionsMe = false,
  String? topicId,
  DateTime? expiresAt,
}) =>
    api.GroupMessageDto(
      id: id,
      groupId: 'g1',
      topicId: topicId,
      type: type,
      sender: mine ? people[0] : (sender ?? people[1]),
      body: body,
      mine: mine,
      clientMessageId: 'c-$id',
      systemKind: systemKind,
      systemPeople: systemPeople,
      systemText: systemText,
      replyTo: replyTo,
      mentions: const [],
      mentionsMe: mentionsMe,
      attachment: attachment,
      poll: poll,
      deleted: false,
      createdAt: _at.add(Duration(minutes: minutes)),
      expiresAt: expiresAt,
    );

api.PollDto poll(
  String id, {
  String question =
      'Which day suits the whole team best for the quarterly case review '
          'with all the partners and the external experts?',
  bool multiple = false,
  bool anonymous = false,
  bool closed = false,
  List<String> myVotes = const [],
  int voters = 12,
}) {
  const texts = [
    'Monday morning, right after the weekly stand-up meeting',
    'Wednesday afternoon in the main conference room',
    'Friday',
    'Any day works for me, I will adapt to the majority decision',
  ];
  return api.PollDto(
    id: id,
    question: question,
    multiple: multiple,
    anonymous: anonymous,
    closed: closed,
    closedAt: closed ? _at : null,
    creatorId: 'me',
    totalVoters: voters,
    options: [
      for (var i = 0; i < texts.length; i++)
        api.PollOptionDto(
          id: 'o$i',
          text: texts[i],
          votes: math.max(0, voters - i * 3),
          percent: voters == 0
              ? 0
              : (100 * math.max(0, voters - i * 3) / (voters * 2)).round(),
          voted: myVotes.contains('o$i'),
          recentVoters: anonymous ? const [] : [people[1], people[2]],
        ),
    ],
    myOptionIds: myVotes,
  );
}

api.GroupMessageDto pollMessage(String id, api.PollDto p, {int minutes = 0}) =>
    message(
      id,
      body: '',
      type: api.GroupMessageDtoType.poll,
      poll: p,
      minutes: minutes,
    );

/// A conversation with every kind of message, newest first.
List<api.GroupMessageDto> richThread() => [
      message(
        'm10',
        body: 'Failed to deliver this one because the network dropped out',
        mine: true,
        minutes: 10,
      ),
      pollMessage('m9', poll('p3', multiple: true), minutes: 9),
      pollMessage(
        'm8',
        poll('p2', anonymous: true, closed: true, myVotes: ['o1']),
        minutes: 8,
      ),
      pollMessage('m7', poll('p1', myVotes: ['o0']), minutes: 7),
      message(
        'm6',
        body: '',
        type: api.GroupMessageDtoType.attachment,
        attachment: const api.ChatAttachmentDto(
          fileId: 'f1',
          name: 'Settlement-agreement-final-version-signed-by-both-parties.pdf',
          isImage: false,
          sizeBytes: 482113,
        ),
        minutes: 6,
      ),
      message(
        'm5',
        body: 'Yes, @Alexandra, I will file the motion by Friday morning.',
        mine: true,
        replyTo: const api.GroupReplyPreviewDto(
          id: 'm1',
          senderName: 'Bartholomew Featherstonehaugh',
          type: api.GroupReplyPreviewDtoType.text,
          snippet: 'Who is going to file the motion before the deadline?',
          deleted: false,
        ),
        minutes: 5,
      ),
      message(
        'm4',
        body: '',
        type: api.GroupMessageDtoType.system,
        systemKind: 'added',
        systemPeople: [people[0], people[1], people[2]],
        minutes: 4,
      ),
      message(
        'm3',
        body: 'Anastasia Konstantinopolskaya, please check '
            'https://example.com/a/very/long/link/that/has/no/spaces/at/all/'
            'and-keeps-going-and-going-for-the-whole-line',
        sender: people[2],
        mentionsMe: true,
        minutes: 3,
      ),
      message(
        'm2',
        body: 'Supercalifragilisticexpialidocious'
            'Supercalifragilisticexpialidocious'
            'Supercalifragilisticexpialidocious',
        sender: people[4],
        minutes: 2,
      ),
      message(
        'm1',
        body: 'Who is going to file the motion before the deadline? '
            'The court closes at five and the clerk is strict about it.',
        sender: people[1],
        minutes: 1,
      ),
    ];

api.GroupDetailDto groupDetail({
  String id = 'g1',
  bool owner = true,
  bool forum = false,
  bool onlyAdminsWrite = false,
  bool readOnly = false,
  api.GroupType type = api.GroupType.public,
  bool withPinned = true,
  int? disappearAfterS,
  bool canEditInfo = true,
}) {
  final canPost = !readOnly;
  return api.GroupDetailDto(
    callsMuted: false,
    id: id,
    title: _longTitle,
    description: _longDescription,
    memberCount: 128,
    type: type,
    username: type == api.GroupType.public
        ? 'immigration_and_family_law_partners'
        : null,
    joinApproval: type == api.GroupType.closed,
    topicsEnabled: forum,
    generalTopicId: forum ? 't0' : null,
    pendingRequests: owner ? 3 : 0,
    myRole: owner ? api.GroupRole.owner : api.GroupRole.member,
    whoCanPost: onlyAdminsWrite ? api.GroupWho.admins : api.GroupWho.all,
    whoCanAdd: api.GroupWho.admins,
    whoCanEditInfo: api.GroupWho.admins,
    whoCanCall: api.GroupWho.all,
    showServiceMessages: true,
    disappearAfterS: disappearAfterS,
    whoCanMedia: api.GroupWho.all,
    whoCanPoll: api.GroupWho.all,
    whoCanPin: api.GroupWho.admins,
    myRights: owner
        ? [
            for (final r in api.GroupDetailDtoMyRights.values)
              if (r.json != null) r,
          ]
        : const [],
    canPost: canPost,
    canAdd: owner,
    canEditInfo: owner && canEditInfo,
    canCall: true,
    isAdmin: owner,
    inviteEnabled: true,
    inviteLink: 'https://lawbid.dev/g/AbCdEfGhIjKlMnOpQrStUvWx',
    pinnedMessage: withPinned
        ? message(
            'm1',
            body: 'Please read the new court filing rules before Friday, '
                'they changed again.',
            minutes: 1,
          )
        : null,
    lastMessageAt: _at,
    unreadCount: 0,
    unreadMentions: 0,
    pinned: false,
    createdAt: _at,
    updatedAt: _at,
    members: [
      member(people[0], api.GroupRole.owner),
      member(people[1], api.GroupRole.admin),
      member(people[2], api.GroupRole.member),
      member(people[3], api.GroupRole.member),
      member(people[4], api.GroupRole.admin),
    ],
  );
}

List<api.GroupTopicDto> topics() => [
      for (var i = 0; i < 4; i++)
        api.GroupTopicDto(
          id: 't$i',
          title: i == 0
              ? 'General'
              : 'Discussion of the open settlement negotiations $i',
          iconEmoji: i == 2 ? '\u{1F4C4}' : null,
          color: i,
          isGeneral: i == 0,
          closed: i == 3,
          pinned: i == 1,
          lastMessage: message(
            'tm$i',
            body: 'The last message in this topic is rather long as well',
            topicId: 't$i',
          ),
          lastMessageAt: _at,
          unreadCount: i * 7,
          unreadMentions: i == 2 ? 1 : 0,
          createdAt: _at,
        ),
    ];

List<api.GroupJoinRequestDto> joinRequests() => [
      api.GroupJoinRequestDto(user: people[2], createdAt: _at),
      api.GroupJoinRequestDto(user: people[4], createdAt: _at),
    ];

api.GroupInvitePreviewDto invitePreview({
  String title = _longTitle,
  bool approval = true,
  bool alreadyMember = false,
  bool requestPending = false,
  api.GroupType type = api.GroupType.closed,
}) =>
    api.GroupInvitePreviewDto(
      id: 'g1',
      code: 'AbCdEf',
      type: type,
      username: type == api.GroupType.public
          ? 'immigration_and_family_law_partners'
          : null,
      requiresApproval: approval,
      requestPending: requestPending,
      title: title,
      description: _longDescription,
      memberCount: 12345,
      alreadyMember: alreadyMember,
      mutualCount: 12345,
    );

List<api.PollVoterOptionDto> pollVoters() => [
      api.PollVoterOptionDto(optionId: 'o0', voters: people),
      api.PollVoterOptionDto(optionId: 'o1', voters: [people[2]]),
    ];

/// A chat-list entry; pinned, muted, unread and mention counts are options.
api.GroupDto listGroup(
  String id, {
  bool pinned = false,
  bool muted = false,
  int unread = 0,
  int mentions = 0,
  api.GroupType type = api.GroupType.private,
  int minutes = 0,
}) =>
    api.GroupDto(
      id: id,
      title: _longTitle,
      description: _longDescription,
      memberCount: 128,
      type: type,
      joinApproval: false,
      topicsEnabled: false,
      pendingRequests: 0,
      myRole: api.GroupRole.member,
      whoCanPost: api.GroupWho.all,
      whoCanAdd: api.GroupWho.all,
      whoCanEditInfo: api.GroupWho.admins,
      whoCanCall: api.GroupWho.all,
      showServiceMessages: true,
      whoCanMedia: api.GroupWho.all,
      whoCanPoll: api.GroupWho.all,
      whoCanPin: api.GroupWho.admins,
      myRights: const [],
      canPost: true,
      canAdd: true,
      canEditInfo: false,
      canCall: true,
      isAdmin: false,
      inviteEnabled: true,
      lastMessage: message(
        'lm-$id',
        body: 'Bartholomew has sent a rather long message to the whole group '
            'about tomorrow',
        minutes: minutes,
      ),
      lastMessageAt: DateTime.now().subtract(const Duration(hours: 3)),
      unreadCount: unread,
      unreadMentions: mentions,
      mutedUntil: muted ? DateTime.now().add(const Duration(days: 365)) : null,
      callsMuted: false,
      pinned: pinned,
      createdAt: _at,
      updatedAt: _at.add(Duration(minutes: minutes)),
    );
