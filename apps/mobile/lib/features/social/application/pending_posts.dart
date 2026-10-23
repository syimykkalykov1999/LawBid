import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/network/idempotency_interceptor.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/data/social_repository.dart';
import 'package:lawbid/features/social/domain/social_models.dart';

/// Owner 2026-10-23 (Instagram): «Publish» never holds the form. The post
/// (a brief, a post with photos, a document post) is a card at the top of
/// the feed in the «Publishing…» state with a thin line along its bottom
/// edge, the form closes at once, and this controller sends it. When the
/// server has it the card gives way to the live post; when it fails the
/// card says so and offers «Retry» (the same Idempotency-Key, so a repeat
/// after a lost answer never makes a second post).
enum PendingPostPhase { posting, failed }

@immutable
class PendingPost {
  const PendingPost({
    required this.id,
    required this.draft,
    required this.phase,
    this.thumbnail,
    this.error,
  });

  /// Local id (also the Idempotency-Key of the create).
  final String id;
  final PostDraft draft;
  final PendingPostPhase phase;

  /// The first picked photo, as the form had it.
  final Uint8List? thumbnail;
  final Object? error;

  bool get failed => phase == PendingPostPhase.failed;

  /// The words shown in the card: the caption, else the title.
  String get preview {
    final body = draft.body.trim();
    return body.isNotEmpty ? body : draft.title.trim();
  }

  PendingPost copyWith({PendingPostPhase? phase, Object? error}) => PendingPost(
        id: id,
        draft: draft,
        phase: phase ?? this.phase,
        thumbnail: thumbnail,
        error: phase == PendingPostPhase.posting ? null : error ?? this.error,
      );
}

class PendingPosts extends Notifier<List<PendingPost>> {
  @override
  List<PendingPost> build() => const [];

  /// Starts sending [draft] in the background; returns at once.
  /// [onPublished] runs with the live post (a snackbar, haptics).
  String submit(
    PostDraft draft, {
    Uint8List? thumbnail,
    void Function(Post post)? onPublished,
  }) {
    final id = draft.idempotencyKey ?? generateIdempotencyKey();
    final item = PendingPost(
      id: id,
      draft: PostDraft(
        title: draft.title,
        body: draft.body,
        practiceCode: draft.practiceCode,
        isNews: draft.isNews,
        mediaFileIds: draft.mediaFileIds,
        videoAssetId: draft.videoAssetId,
        locationName: draft.locationName,
        commentsEnabled: draft.commentsEnabled,
        attachments: draft.attachments,
        markedLegal: draft.markedLegal,
        idempotencyKey: id,
      ),
      phase: PendingPostPhase.posting,
      thumbnail: thumbnail,
    );
    state = [item, ...state];
    _onPublished[id] = onPublished;
    unawaited(_send(id));
    return id;
  }

  final _onPublished = <String, void Function(Post)?>{};

  PendingPost? _find(String id) {
    for (final p in state) {
      if (p.id == id) return p;
    }
    return null;
  }

  Future<void> _send(String id) async {
    final item = _find(id);
    if (item == null) return;
    try {
      final post = await ref.read(socialRepositoryProvider).createPost(
            item.draft,
          );
      if (!ref.mounted) return;
      // Still wanted? («×» on a card that was in flight keeps the post —
      // the server has it — but there is nothing to swap.)
      state = [
        for (final p in state)
          if (p.id != id) p,
      ];
      ref.read(feedProvider.notifier).prepend(post);
      _onPublished.remove(id)?.call(post);
    } on Object catch (e) {
      if (!ref.mounted) return;
      state = [
        for (final p in state)
          if (p.id == id)
            p.copyWith(phase: PendingPostPhase.failed, error: e)
          else
            p,
      ];
    }
  }

  /// «Retry»: the same draft, the same Idempotency-Key.
  void retry(String id) {
    final item = _find(id);
    if (item == null || !item.failed) return;
    state = [
      for (final p in state)
        if (p.id == id) p.copyWith(phase: PendingPostPhase.posting) else p,
    ];
    unawaited(_send(id));
  }

  /// «×» on a failed card.
  void dismiss(String id) {
    _onPublished.remove(id);
    state = [
      for (final p in state)
        if (p.id != id) p,
    ];
  }
}

final pendingPostsProvider =
    NotifierProvider<PendingPosts, List<PendingPost>>(PendingPosts.new);
