import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/network/idempotency_interceptor.dart';
import 'package:lawbid/core/uploads/queued_photos.dart';
import 'package:lawbid/core/uploads/upload_queue.dart';
import 'package:lawbid/features/profile/application/profile_providers.dart';
import 'package:lawbid/features/profile/data/client_reviews_repository.dart';
import 'package:lawbid/features/social/application/social_providers.dart';

/// Who a review is about.
enum ReviewTargetKind {
  /// A client's review of their attorney (the attorney's profile).
  attorney,

  /// An attorney's review of the client of a case.
  caseClient,

  /// Anyone's review of a client (the client's profile).
  openClient,
}

typedef ReviewTarget = ({ReviewTargetKind kind, String id});

/// The queue kind of a review being saved (core/uploads/upload_queue.dart).
const kReviewJobKind = 'review.publish';

/// Owner 2026-11-08 (instant everywhere, decision: the app's own queue):
/// «Сохранить» on a review closes the sheet at once, also while its photos
/// still go up. The review is a job of the persistent queue: it goes on
/// after the app is closed and is saved once the photos are in. Saving a
/// review replaces the earlier one, so a repeat never makes a second review.
/// There is no «sending» element for reviews: the review appears when saved.
class ReviewOutbox {
  ReviewOutbox(this._ref, this._queue);

  final Ref _ref;
  final UploadQueue _queue;

  /// Queues the review of [target]; returns at once.
  Future<void> submit(
    ReviewTarget target, {
    required int rating,
    required String body,
    required List<PendingPhoto> photos,
  }) async {
    final id = generateIdempotencyKey();
    final entries = await QueuedPhotos.keep(
      _ref.read(uploadFilesProvider),
      id,
      photos,
    );
    await _queue.enqueue(
      id: id,
      kind: kReviewJobKind,
      target: 'review:${target.kind.name}:${target.id}',
      payload: {
        'target': target.kind.name,
        'id': target.id,
        'rating': rating,
        'body': body,
        'photos': entries,
      },
    );
  }
}

/// Sends a queued review: [prepare] uploads the photos the sheet had not
/// sent yet (waiting for the sheet's own upload when it still runs);
/// [commit] saves the review and refreshes what shows it.
class ReviewPublishHandler extends UploadJobHandler {
  ReviewPublishHandler(this._ref);

  final Ref _ref;

  @override
  String get kind => kReviewJobKind;

  @override
  Future<void> prepare(UploadJob job, UploadJobScope scope) async {
    await QueuedPhotos.send(
      job,
      scope,
      _ref.read(uploadFilesProvider),
      (bytes, _) => _ref
          .read(socialActionsProvider)
          .uploadPhoto(bytes, reviewPhoto: true),
    );
  }

  @override
  Future<void> commit(UploadJob job, UploadJobScope scope) async {
    final p = job.payload;
    final id = p['id']! as String;
    final rating = (p['rating']! as num).toInt();
    final body = p['body'] as String? ?? '';
    final photoIds = [for (final x in QueuedPhotos.idsOf(job)) x!];
    switch (ReviewTargetKind.values.byName(p['target']! as String)) {
      case ReviewTargetKind.attorney:
        await _ref
            .read(reviewsRepositoryProvider)
            .saveMine(id, rating: rating, body: body, photoIds: photoIds);
        _ref
          ..invalidate(reviewSummaryProvider(id))
          ..invalidate(reviewsListProvider)
          ..invalidate(myAttorneyReviewProvider(id));
      case ReviewTargetKind.caseClient:
        await _ref
            .read(clientReviewsRepositoryProvider)
            .save(id, rating: rating, body: body, photoIds: photoIds);
        _ref.invalidate(myClientReviewProvider(id));
      case ReviewTargetKind.openClient:
        await _ref
            .read(clientReviewsRepositoryProvider)
            .saveOpen(id, rating: rating, body: body, photoIds: photoIds);
        _ref
          ..invalidate(clientReviewsProvider)
          ..invalidate(clientReviewSummaryProvider(id))
          ..invalidate(myOpenClientReviewProvider(id));
    }
  }

  @override
  Future<void> removed(UploadJob job, {required bool sent}) =>
      QueuedPhotos.removeFiles(_ref.read(uploadFilesProvider), job);
}

/// The review outbox on the app's queue (read at start by the shell, so a
/// review left by the last run goes on).
final reviewOutboxProvider = Provider<ReviewOutbox>((ref) {
  final queue = ref.watch(uploadQueueProvider)
    ..register(ReviewPublishHandler(ref));
  return ReviewOutbox(ref, queue);
});
