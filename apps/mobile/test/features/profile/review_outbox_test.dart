import 'dart:async';
import 'dart:typed_data';

import 'package:drift/native.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/uploads/upload_queue_database.dart';
import 'package:lawbid/features/profile/application/profile_providers.dart';
import 'package:lawbid/features/profile/application/review_outbox.dart';
import 'package:lawbid/features/profile/domain/profile_models.dart';
import 'package:lawbid/features/social/application/social_providers.dart';

import '../../helpers/upload_queue_overrides.dart';
import '../social/social_fakes.dart';
import 'profile_fakes.dart';

class _Reviews extends FakeReviewsRepo {
  _Reviews() : super();

  final saves = <(String, int, List<String>?)>[];
  ApiException? failWith;

  @override
  Future<Review> saveMine(
    String attorneyId, {
    required int rating,
    String? body,
    List<String>? photoIds,
  }) async {
    final e = failWith;
    if (e != null) throw e;
    saves.add((attorneyId, rating, photoIds));
    return super.saveMine(
      attorneyId,
      rating: rating,
      body: body,
      photoIds: photoIds,
    );
  }
}

class _Photos extends FakeSocialRepository {
  final sent = <int>[];

  @override
  Future<String> uploadPostPhoto(
    Uint8List bytes, {
    void Function(double progress)? onProgress,
    bool casePhoto = false,
    bool reviewPhoto = false,
    String? fileName,
    int? maxBytes,
    String? path,
  }) async {
    sent.add(bytes.length);
    return 'photo-${sent.length}';
  }
}

const _offline =
    ApiException(code: ApiException.networkErrorCode, message: 'offline');

ProviderContainer _container(
  _Reviews reviews,
  _Photos photos, {
  UploadQueueDatabase? db,
}) {
  final c = ProviderContainer(
    overrides: [
      reviewsRepositoryProvider.overrideWithValue(reviews),
      socialRepositoryProvider.overrideWithValue(photos),
      ...uploadQueueOverrides(db: db, fixedOnline: true),
    ],
  );
  addTearDown(c.dispose);
  return c;
}

Future<void> _until(bool Function() done) async {
  for (var i = 0; i < 100 && !done(); i++) {
    await Future<void>.delayed(const Duration(milliseconds: 50));
  }
}

const _attorney = (kind: ReviewTargetKind.attorney, id: 'att-1');

/// Owner 2026-11-08 (instant everywhere): «Сохранить» on a review closes the
/// sheet at once; the review goes through the app's queue, waits for its
/// photos (never sending one twice) and survives closing the app.
void main() {
  test('a photo still uploading in the sheet is awaited, not sent again',
      () async {
    final reviews = _Reviews();
    final photos = _Photos();
    final c = _container(reviews, photos);
    final upload = Completer<String>();
    await c.read(reviewOutboxProvider).submit(
      _attorney,
      rating: 5,
      body: 'Great',
      photos: [
        (fileId: 'kept-1', bytes: null, upload: null),
        (fileId: null, bytes: Uint8List(4), upload: upload.future),
      ],
    );
    await Future<void>.delayed(const Duration(milliseconds: 150));
    expect(reviews.saves, isEmpty, reason: 'waits for the photo');
    upload.complete('sheet-2');
    await _until(() => reviews.saves.isNotEmpty);
    final (who, stars, ids) = reviews.saves.single;
    expect((who, stars), ('att-1', 5));
    expect(ids, ['kept-1', 'sheet-2']);
    expect(photos.sent, isEmpty);
  });

  test('closing the app mid-way: saved at the next start, exactly once',
      () async {
    final db = UploadQueueDatabase(NativeDatabase.memory());
    addTearDown(db.close);
    final first = _Reviews()..failWith = _offline;
    final photos = _Photos();
    final c1 = _container(first, photos, db: db);
    await c1.read(reviewOutboxProvider).submit(
      _attorney,
      rating: 4,
      body: 'Good',
      photos: [(fileId: null, bytes: Uint8List(3), upload: null)],
    );
    await _until(() => photos.sent.isNotEmpty);
    await Future<void>.delayed(const Duration(milliseconds: 150));
    expect(first.saves, isEmpty);
    c1.dispose(); // the app is closed

    final second = _Reviews();
    final again = _Photos();
    final c2 = _container(second, again, db: db)..read(reviewOutboxProvider);
    await _until(() => second.saves.isNotEmpty);
    expect(second.saves, hasLength(1));
    expect(second.saves.single.$1, 'att-1');
    expect(second.saves.single.$3, ['photo-1']);
    expect(again.sent, isEmpty, reason: 'the stored photo id is reused');
    await Future<void>.delayed(const Duration(milliseconds: 150));
    expect(second.saves, hasLength(1));
    c2.dispose();
  });
}
