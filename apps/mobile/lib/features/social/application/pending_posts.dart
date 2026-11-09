import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/idempotency_interceptor.dart';
import 'package:lawbid/core/uploads/queued_photos.dart';
import 'package:lawbid/core/uploads/upload_queue.dart';
import 'package:lawbid/core/uploads/upload_queue_database.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/data/social_repository.dart';
import 'package:lawbid/features/social/domain/social_models.dart';

export 'package:lawbid/core/uploads/queued_photos.dart' show PendingPhoto;

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

/// The queue kind of a post being published (core/uploads/upload_queue.dart).
const kPostJobKind = 'post.publish';
const _postTarget = 'posts';

/// Owner 2026-11-08 (instant everywhere, decision: the app's own queue):
/// a post is a job of the persistent upload queue. «Publish» works while the
/// photos still go up; the form closes at once, the card stays until the
/// server has the post, and a post interrupted by closing the app goes on
/// at the next start. The job id is the Idempotency-Key, so a repeat never
/// makes a second post.
class PendingPosts extends Notifier<List<PendingPost>> {
  @override
  List<PendingPost> build() {
    // Audit C9: a failed post never carries over to the next account.
    ref.watch(currentUserIdProvider);
    final queue = ref.watch(uploadQueueProvider)
      ..register(PostPublishHandler(ref, this));
    final owner = queue.ownerId;
    if (owner != null) {
      unawaited(
        queue.db
            .ofKind(owner, kPostJobKind)
            .then(_restore, onError: (_) {}),
      );
    }
    return const [];
  }

  /// Cards of the posts the last run left in the queue.
  Future<void> _restore(List<UploadJobRow> rows) async {
    for (final r in rows) {
      if (!ref.mounted || _find(r.id) != null || _done.contains(r.id)) {
        continue;
      }
      final job = UploadJob.fromRow(r);
      final thumb = await ref.read(uploadFilesProvider).read('${r.id}.p0');
      if (!ref.mounted || _find(r.id) != null || _done.contains(r.id)) {
        continue;
      }
      state = [
        ...state,
        PendingPost(
          id: r.id,
          draft: postDraftFromJson(job.payload, idempotencyKey: r.id),
          phase: r.failedCode == null
              ? PendingPostPhase.posting
              : PendingPostPhase.failed,
          thumbnail: thumb,
          error: r.failedCode == null
              ? null
              : ApiException(code: r.failedCode!, message: 'post'),
        ),
      ];
    }
  }

  /// Starts sending [draft] in the background; returns at once.
  /// [onPublished] runs with the live post (a snackbar, haptics). [photos]
  /// replace `draft.mediaFileIds` when given (some may still be uploading).
  String submit(
    PostDraft draft, {
    Uint8List? thumbnail,
    void Function(Post post)? onPublished,
    List<PendingPhoto>? photos,
  }) {
    final id = draft.idempotencyKey ?? generateIdempotencyKey();
    final item = PendingPost(
      id: id,
      draft: _withKey(draft, id),
      phase: PendingPostPhase.posting,
      thumbnail: thumbnail,
    );
    state = [item, ...state];
    _onPublished[id] = onPublished;
    final list = photos ??
        [
          for (final f in draft.mediaFileIds)
            (fileId: f, bytes: null, upload: null),
        ];
    unawaited(_enqueue(id, draft, list, thumbnail));
    return id;
  }

  Future<void> _enqueue(
    String id,
    PostDraft draft,
    List<PendingPhoto> photos,
    Uint8List? thumbnail,
  ) async {
    try {
      final entries = await QueuedPhotos.keep(
        ref.read(uploadFilesProvider),
        id,
        photos,
        first: thumbnail,
        keepFirst: true,
      );
      if (!ref.mounted) return;
      await ref.read(uploadQueueProvider).enqueue(
            id: id,
            kind: kPostJobKind,
            target: _postTarget,
            payload: {...postDraftToJson(draft), 'photos': entries},
          );
    } on Object catch (e) {
      failed(id, e);
    }
  }

  final _onPublished = <String, void Function(Post)?>{};

  /// Posts the queue sent in this run (a card restored late is not shown).
  final _done = <String>{};

  PendingPost? _find(String id) {
    for (final p in state) {
      if (p.id == id) return p;
    }
    return null;
  }

  /// The queue sent it: the card gives way to the live post.
  void published(String id, Post post) {
    if (!ref.mounted) return;
    _done.add(id);
    state = [
      for (final p in state)
        if (p.id != id) p,
    ];
    ref.read(feedProvider.notifier).prepend(post);
    _onPublished.remove(id)?.call(post);
  }

  /// A try failed: the card says so and offers «Retry» (the queue also
  /// tries again by itself after a lost connection).
  void failed(String id, Object error) {
    if (!ref.mounted) return;
    state = [
      for (final p in state)
        if (p.id == id)
          p.copyWith(phase: PendingPostPhase.failed, error: error)
        else
          p,
    ];
  }

  /// «Retry»: the same job, the same Idempotency-Key.
  void retry(String id) {
    final item = _find(id);
    if (item == null || !item.failed) return;
    state = [
      for (final p in state)
        if (p.id == id) p.copyWith(phase: PendingPostPhase.posting) else p,
    ];
    unawaited(ref.read(uploadQueueProvider).retry(id));
  }

  /// «×» on a failed card: the job and its kept photos go.
  void dismiss(String id) {
    _onPublished.remove(id);
    state = [
      for (final p in state)
        if (p.id != id) p,
    ];
    unawaited(ref.read(uploadQueueProvider).discard(id));
  }
}

PostDraft _withKey(PostDraft d, String key) => PostDraft(
      title: d.title,
      body: d.body,
      practiceCode: d.practiceCode,
      isNews: d.isNews,
      mediaFileIds: d.mediaFileIds,
      videoAssetId: d.videoAssetId,
      locationName: d.locationName,
      commentsEnabled: d.commentsEnabled,
      attachments: d.attachments,
      markedLegal: d.markedLegal,
      idempotencyKey: key,
    );

Map<String, Object?> postDraftToJson(PostDraft d) => {
      'title': d.title,
      'body': d.body,
      if (d.practiceCode != null) 'practiceCode': d.practiceCode,
      'isNews': d.isNews,
      if (d.locationName != null) 'location': d.locationName,
      'commentsEnabled': d.commentsEnabled,
      'markedLegal': d.markedLegal,
      'attachments': [
        for (final a in d.attachments)
          {'fileId': a.fileId, 'fileName': a.fileName},
      ],
    };

PostDraft postDraftFromJson(
  Map<String, Object?> j, {
  required String idempotencyKey,
  List<String> mediaFileIds = const [],
}) =>
    PostDraft(
      title: j['title'] as String? ?? '',
      body: j['body'] as String? ?? '',
      practiceCode: j['practiceCode'] as String?,
      isNews: j['isNews'] as bool? ?? false,
      locationName: j['location'] as String?,
      commentsEnabled: j['commentsEnabled'] as bool? ?? true,
      markedLegal: j['markedLegal'] as bool? ?? false,
      mediaFileIds: mediaFileIds,
      attachments: [
        for (final a in (j['attachments'] as List? ?? const []))
          PostDocumentRef(
            fileId: (a as Map)['fileId'] as String,
            fileName: a['fileName'] as String? ?? 'file',
          ),
      ],
      idempotencyKey: idempotencyKey,
    );

/// Sends a queued post: [prepare] uploads the photos the form had not sent
/// yet (waiting for the form's own upload when it is still running, so
/// nothing goes twice), saving each id; [commit] creates the post with the
/// job id as its Idempotency-Key.
class PostPublishHandler extends UploadJobHandler {
  PostPublishHandler(this._ref, this._cards);

  final Ref _ref;

  /// The cards (the notifier that registered this handler).
  final PendingPosts _cards;

  @override
  String get kind => kPostJobKind;

  @override
  Future<void> prepare(UploadJob job, UploadJobScope scope) async {
    try {
      await QueuedPhotos.send(
        job,
        scope,
        _ref.read(uploadFilesProvider),
        (bytes, _) =>
            _ref.read(socialRepositoryProvider).uploadPostPhoto(bytes),
      );
    } on Object catch (e) {
      _cards.failed(job.id, e);
      rethrow;
    }
  }

  @override
  Future<void> commit(UploadJob job, UploadJobScope scope) async {
    final draft = postDraftFromJson(
      job.payload,
      idempotencyKey: job.id,
      mediaFileIds: [for (final id in QueuedPhotos.idsOf(job)) id!],
    );
    final Post post;
    try {
      post = await _ref.read(socialRepositoryProvider).createPost(draft);
    } on Object catch (e) {
      _cards.failed(job.id, e);
      rethrow;
    }
    _cards.published(job.id, post);
  }

  @override
  void refused(UploadJob job, String code) =>
      _cards.failed(job.id, ApiException(code: code, message: 'post'));

  @override
  Future<void> removed(UploadJob job, {required bool sent}) =>
      QueuedPhotos.removeFiles(_ref.read(uploadFilesProvider), job);
}

final pendingPostsProvider =
    NotifierProvider<PendingPosts, List<PendingPost>>(PendingPosts.new);
