import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/features/search/data/public_directory_repository.dart';

export 'package:lawbid/features/search/data/public_directory_repository.dart'
    show PublicAttorney, PublicAttorneyPage, PublicDirectoryRepository;

final publicDirectoryRepositoryProvider = Provider<PublicDirectoryRepository>(
  (ref) => ApiPublicDirectoryRepository(ref.watch(dioProvider)),
);

/// The guest's list of verified attorneys (owner 2026-10-22, guest
/// browsing): the first pages of `GET /public/directory/attorneys`, kept
/// while the app runs so the feed and the search tab share one load.
class PublicDirectoryNotifier extends AsyncNotifier<PublicAttorneyPage> {
  @override
  Future<PublicAttorneyPage> build() =>
      ref.watch(publicDirectoryRepositoryProvider).attorneys();

  bool _loadingMore = false;

  /// Appends the next page (no-op at the end or while one is in flight).
  Future<void> loadMore() async {
    final current = state.value;
    final cursor = current?.nextCursor;
    if (current == null || cursor == null || _loadingMore) return;
    _loadingMore = true;
    try {
      final next = await ref
          .read(publicDirectoryRepositoryProvider)
          .attorneys(cursor: cursor);
      state = AsyncData(
        PublicAttorneyPage(
          items: [...current.items, ...next.items],
          nextCursor: next.nextCursor,
        ),
      );
    } catch (_) {
      // The rows on screen stay; a pull to refresh retries.
    } finally {
      _loadingMore = false;
    }
  }
}

final publicDirectoryProvider =
    AsyncNotifierProvider<PublicDirectoryNotifier, PublicAttorneyPage>(
  PublicDirectoryNotifier.new,
);
