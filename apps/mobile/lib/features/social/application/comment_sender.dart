import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/network/idempotency_interceptor.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/shared/domain/user_role.dart';

/// SPEED_MATRIX 2026-11-09 §3 №14 (Instagram, Telegram, WhatsApp): a
/// comment is under the post the moment «Send» is tapped. The row carries a
/// local id ([kPendingCommentPrefix]) until the server answers; the answer
/// replaces it in place, a refusal removes it and the caller shows the
/// error. The same path the app already uses for messages
/// (`ChatOutbox`) and posts (`PendingPosts`): the screen never waits for
/// the network.
const kPendingCommentPrefix = 'pending:';

/// Not on the server yet: no like, reply or delete until it is.
bool isPendingComment(Comment c) => c.id.startsWith(kPendingCommentPrefix);

/// How the signed-in person appears as the author of their own comment
/// before the server's row arrives (the server's row then carries its own
/// author).
final myCommentAuthorProvider = Provider<CommentAuthor>((ref) {
  final me = ref.watch(currentUserControllerProvider.select((s) => s.user));
  final attorney = me?.attorneyProfile;
  final name = [me?.firstName, me?.lastName]
      .whereType<String>()
      .map((s) => s.trim())
      .where((s) => s.isNotEmpty)
      .join(' ');
  return CommentAuthor(
    isAttorney: me?.role == UserRole.attorney,
    attorneyId: me?.role == UserRole.attorney ? me?.id : null,
    username: attorney?.username,
    displayName: name.isNotEmpty ? name : (attorney?.username ?? ''),
    avatarUrl: me?.avatarUrl,
    verified: attorney?.verificationStatus == 'verified',
  );
});

/// Sends comments without holding the screen.
class CommentSender extends Notifier<void> {
  @override
  void build() {}

  /// Sends `body` as a comment on `postId` (a reply when `parentId` is
  /// given): the pending row is shown at once, the live comment comes
  /// back. Throws what the server threw after taking the pending row away.
  CommentRows _rowsOf(String postId, String? parentId) => parentId == null
      ? ref.read(commentsProvider(postId).notifier)
      : ref.read(repliesProvider(parentId).notifier);

  Future<Comment> send({
    required String postId,
    required String body,
    String? parentId,
  }) async {
    final pending = Comment(
      id: '$kPendingCommentPrefix${generateIdempotencyKey()}',
      postId: postId,
      parentId: parentId,
      author: ref.read(myCommentAuthorProvider),
      body: body,
      likeCount: 0,
      replyCount: 0,
      likedByMe: false,
      canDelete: false,
      isMine: true,
      createdAt: DateTime.now(),
    );
    final list = _rowsOf(postId, parentId)..add(pending);
    try {
      final live = await ref
          .read(socialRepositoryProvider)
          .addComment(postId, body, parentId: parentId);
      list.settle(pending.id, live);
      return live;
    } on Object {
      list.remove(pending.id);
      rethrow;
    }
  }
}

final commentSenderProvider =
    NotifierProvider<CommentSender, void>(CommentSender.new);
