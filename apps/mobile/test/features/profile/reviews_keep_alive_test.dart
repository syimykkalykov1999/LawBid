import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/session/guest_mode.dart';
import 'package:lawbid/features/profile/application/profile_providers.dart';
import 'package:lawbid/features/profile/data/profile_repositories.dart';
import 'package:lawbid/features/profile/domain/profile_models.dart';

/// Owner 2026-11-04 (R-383): the profile's «Reviews» tab and its star /
/// sort filters keep what they loaded — switching back asks nothing.
class _CountingReviews implements ReviewsRepository {
  final reads = <int?>[];

  @override
  Future<ReviewPage> list(
    String attorneyId, {
    String? cursor,
    int? rating,
    ReviewsSort sort = ReviewsSort.newest,
  }) async {
    reads.add(rating);
    return const ReviewPage(items: []);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  test('a star filter switched away and back is not read again', () async {
    final repo = _CountingReviews();
    final container = ProviderContainer(
      overrides: [
        reviewsRepositoryProvider.overrideWithValue(repo),
        isGuestProvider.overrideWithValue(false),
      ],
    );
    addTearDown(container.dispose);
    const all = (attorneyId: 'a', rating: null, sort: ReviewsSort.newest);
    const five = (attorneyId: 'a', rating: 5, sort: ReviewsSort.newest);

    Future<void> show(ReviewsKey key) async {
      final sub = container.listen(reviewsListProvider(key), (_, __) {});
      await container.read(reviewsListProvider(key).future);
      sub.close();
      await Future<void>.delayed(Duration.zero);
    }

    for (var i = 0; i < 3; i++) {
      await show(all);
      await show(five);
    }
    expect(repo.reads, [null, 5]);
  });

  test('the keep-alive window is five minutes', () {
    expect(ReviewsListController.keepAliveFor, const Duration(minutes: 5));
  });
}
