import 'package:dio/dio.dart';
import 'package:image_picker/image_picker.dart' show XFile;
import 'package:lawbid/features/chat/data/chat_repository.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/stories/data/stories_repository.dart';
import 'package:lawbid/features/stories/domain/story_models.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

const meUser = StoryUser(id: 'me', username: 'me', firstName: 'Mia');
const anna = StoryUser(
  id: 'u1',
  username: 'anna',
  firstName: 'Anna',
  lastName: 'Lee',
  verified: true,
);
const bob = StoryUser(id: 'u2', username: 'bob', firstName: 'Bob');

Story fakeStory(
  String id, {
  StoryUser author = anna,
  StoryKind kind = StoryKind.text,
  bool mine = false,
  bool viewed = false,
  bool canReply = true,
  int views = 0,
  String? text = 'Hello',
  List<StoryOverlay> overlays = const [],
}) =>
    Story(
      id: id,
      author: author,
      kind: kind,
      text: text,
      background: 'gold',
      overlays: overlays,
      audience: StoryAudience.all,
      createdAt: DateTime.now().subtract(const Duration(minutes: 5)),
      expiresAt: DateTime.now().add(const Duration(hours: 23)),
      viewedByMe: viewed || mine,
      isMine: mine,
      viewCount: views,
      canReply: canReply && !mine,
    );

StoryTrayItem trayItem(
  StoryUser user, {
  bool isMe = false,
  int count = 1,
  int unseen = 1,
}) =>
    StoryTrayItem(
      user: user,
      isMe: isMe,
      storyCount: count,
      unseenCount: unseen,
      latestAt: DateTime.now(),
    );

/// A [StoriesRepository] that answers from memory and records the calls.
class FakeStoriesRepository extends StoriesRepository {
  FakeStoriesRepository({
    this.trayItems = const [],
    this.byUser = const {},
    this.viewerPages = const [],
    this.failCreate,
  }) : super(apiDio: Dio(), storageDio: Dio());

  List<StoryTrayItem> trayItems;
  Map<String, List<Story>> byUser;
  List<CursorPage<StoryViewer>> viewerPages;
  Object? failCreate;

  final viewed = <String>[];
  final removed = <String>[];
  final created = <Map<String, Object?>>[];
  final reported = <String>[];
  int trayCalls = 0;

  @override
  Future<List<StoryTrayItem>> tray() async {
    trayCalls++;
    return trayItems;
  }

  @override
  Future<List<Story>> ofUser(String userId) async => byUser[userId] ?? [];

  @override
  Future<void> markViewed(String storyId) async => viewed.add(storyId);

  @override
  Future<void> remove(String storyId) async => removed.add(storyId);

  @override
  Future<void> report(String storyId, String reason) async =>
      reported.add('$storyId:$reason');

  @override
  Future<CursorPage<StoryViewer>> viewers(
    String storyId, {
    String? cursor,
  }) async {
    final i = cursor == null ? 0 : int.parse(cursor);
    return viewerPages[i];
  }

  StorySettings current = const StorySettings(
    audience: StoryAudience.followers,
    allowReplies: true,
    hiddenCount: 0,
  );
  final hiddenUsers = <StoryUser>[];
  final unhidden = <String>[];

  @override
  Future<StorySettings> settings() async => StorySettings(
        audience: current.audience,
        allowReplies: current.allowReplies,
        hiddenCount: hiddenUsers.length,
      );

  @override
  Future<StorySettings> updateSettings({
    StoryAudience? audience,
    bool? allowReplies,
  }) async {
    current = StorySettings(
      audience: audience ?? current.audience,
      allowReplies: allowReplies ?? current.allowReplies,
      hiddenCount: hiddenUsers.length,
    );
    return settings();
  }

  @override
  Future<List<StoryUser>> hidden() async => List.of(hiddenUsers);

  @override
  Future<void> hide(String userId) async {}

  @override
  Future<void> unhide(String userId) async {
    unhidden.add(userId);
    hiddenUsers.removeWhere((u) => u.id == userId);
  }

  @override
  Future<CursorPage<StoryUser>> following(
    String myId, {
    String? cursor,
    String? q,
  }) async =>
      const CursorPage(items: [anna, bob]);

  @override
  Future<Story> create({
    required StoryKind kind,
    required StoryAudience audience,
    String? fileId,
    String? videoAssetId,
    String? text,
    String? background,
    List<StoryOverlay> overlays = const [],
  }) async {
    final fail = failCreate;
    if (fail != null) {
      // ignore: only_throw_errors
      throw fail;
    }
    created.add({
      'kind': kind,
      'audience': audience,
      'fileId': fileId,
      'videoAssetId': videoAssetId,
      'text': text,
      'background': background,
      'overlays': overlays.length,
    });
    return fakeStory('new', author: meUser, mine: true, text: text);
  }

  @override
  Future<StoryUpload> createVideoUpload({
    required int sizeBytes,
    required int durationSec,
    int? trimStartMs,
    int? trimEndMs,
  }) async =>
      const StoryUpload(
        videoAssetId: 'asset-1',
        tusEndpoint: 'https://tus.test/upload',
        libraryId: 'lib',
        videoId: 'vid',
        signature: 'sig',
        expire: 1,
        maxDurationSec: 15,
      );

  int uploads = 0;

  @override
  Future<void> upload(
    XFile file,
    StoryUpload u, {
    void Function(double)? onProgress,
    CancelToken? cancel,
  }) async {
    uploads++;
    onProgress?.call(1);
  }

  int statusCalls = 0;

  @override
  Future<String> videoStatus(String videoAssetId) async =>
      ++statusCalls < 2 ? 'processing' : 'ready';
}

/// The chat repository seen by a story reply: records what is sent where.
class FakeReplyChat implements ChatRepository {
  final started = <String>[];
  final sent = <({String conversationId, String clientId, String body})>[];

  @override
  Future<Conversation> startDirect(String userId) async {
    started.add(userId);
    return Conversation(
      id: 'conv-$userId',
      caseId: null,
      caseTitle: null,
      status: ConversationStatus.active,
      contactsUnlocked: false,
      counterpart: const Counterpart(isAttorney: false, verified: false),
      unreadCount: 0,
      updatedAt: DateTime(2026),
      isDirect: true,
    );
  }

  @override
  Future<ChatMessage> send(
    String id,
    String clientMessageId,
    String body,
  ) async {
    sent.add((conversationId: id, clientId: clientMessageId, body: body));
    return ChatMessage(
      id: 'm1',
      conversationId: id,
      senderId: 'me',
      kind: MessageKind.text,
      body: body,
      clientMessageId: clientMessageId,
      createdAt: DateTime.now(),
    );
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => Future<void>.value();
}
