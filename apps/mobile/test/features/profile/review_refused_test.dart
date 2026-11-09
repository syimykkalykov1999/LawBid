import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/navigation/root_messenger.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/profile/application/profile_providers.dart';
import 'package:lawbid/features/profile/application/review_outbox.dart';
import 'package:lawbid/features/profile/domain/profile_models.dart';
import 'package:lawbid/features/social/application/social_providers.dart';

import '../../helpers/upload_queue_overrides.dart';
import '../social/social_fakes.dart';
import 'profile_fakes.dart';

class _Reviews extends FakeReviewsRepo {
  int saves = 0;
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
    saves++;
    return super.saveMine(
      attorneyId,
      rating: rating,
      body: body,
      photoIds: photoIds,
    );
  }
}

class _Photos extends FakeSocialRepository {
  @override
  Future<String> uploadPostPhoto(
    Uint8List bytes, {
    void Function(double progress)? onProgress,
    bool casePhoto = false,
    bool reviewPhoto = false,
    String? fileName,
    int? maxBytes,
  }) async =>
      'photo-1';
}

/// Owner 2026-11-08 («never lose the user's input»): a review the server
/// refused for good is not silent — the app-wide snackbar says why and
/// offers «Повторить»; the review is kept and sent by it.
void main() {
  testWidgets('a refused review: snackbar with «Повторить», which sends it',
      (tester) async {
    final reviews = _Reviews()
      ..failWith = const ApiException(
        code: 'VALIDATION_ERROR',
        message: 'bad',
        statusCode: 422,
      );
    final c = ProviderContainer(
      overrides: [
        reviewsRepositoryProvider.overrideWithValue(reviews),
        socialRepositoryProvider.overrideWithValue(_Photos()),
        translatorProvider.overrideWithValue(const StaticTranslatorRu()),
        ...uploadQueueOverrides(fixedOnline: true),
      ],
    );
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: c,
        child: MaterialApp(
          scaffoldMessengerKey: rootMessengerKey,
          home: const Scaffold(body: SizedBox()),
        ),
      ),
    );
    await tester.runAsync(
      () => c.read(reviewOutboxProvider).submit(
        (kind: ReviewTargetKind.attorney, id: 'att-1'),
        rating: 5,
        body: 'Great',
        photos: const [],
      ),
    );
    for (var i = 0; i < 40; i++) {
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 50)),
      );
      await tester.pump();
      if (find.byKey(const ValueKey('queue-refused')).evaluate().isNotEmpty) {
        break;
      }
    }
    expect(find.byKey(const ValueKey('queue-refused')), findsOneWidget);
    expect(find.text('Повторить'), findsOneWidget);
    expect(reviews.saves, 0);

    reviews.failWith = null;
    // The snackbar has finished sliding in.
    await tester.pump(const Duration(milliseconds: 800));
    await tester.tap(find.text('Повторить'));
    await tester.pump();
    for (var i = 0; i < 60 && reviews.saves == 0; i++) {
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 50)),
      );
      await tester.pump();
    }
    expect(reviews.saves, 1);
    await tester.pumpWidget(const SizedBox());
    c.dispose();
    await tester.pump(const Duration(seconds: 11));
  });
}
