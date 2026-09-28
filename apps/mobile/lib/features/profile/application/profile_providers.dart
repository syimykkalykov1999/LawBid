import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_translator.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/core/session/session_providers.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/onboarding/application/onboarding_providers.dart';
import 'package:lawbid/features/profile/data/avatar_upload_repository.dart';
import 'package:lawbid/features/profile/data/profile_repositories.dart';
import 'package:lawbid/features/profile/domain/profile_models.dart';
import 'package:lawbid/features/profile/domain/verification_gate.dart';

export 'package:lawbid/features/profile/domain/verification_gate.dart';

// --- Repositories (swappable in tests) -----------------------------------

final attorneyProfileRepositoryProvider = Provider<AttorneyProfileRepository>(
  (ref) => ApiAttorneyProfileRepository(ref.watch(dioProvider)),
);

final practicesRepositoryProvider = Provider<PracticesRepository>(
  (ref) => ApiPracticesRepository(ref.watch(dioProvider)),
);

final reviewsRepositoryProvider = Provider<ReviewsRepository>(
  (ref) => ApiReviewsRepository(ref.watch(dioProvider)),
);

final clientProfileRepositoryProvider = Provider<ClientProfileRepository>(
  (ref) => ApiClientProfileRepository(ref.watch(dioProvider)),
);

final avatarUploadRepositoryProvider = Provider<AvatarUploadRepository>(
  (ref) => ApiAvatarUploadRepository(
    apiDio: ref.watch(dioProvider),
    storageDio: ref.watch(storageDioProvider),
    users: ref.watch(usersApiClientProvider),
  ),
);

/// "Now" for time-window rules (14-day review edit, 30-day username
/// cooldown) — overridable so tests are deterministic.
final clockProvider = Provider<DateTime Function()>((ref) => DateTime.now);

// --- Gate ------------------------------------------------------------------

/// Riverpod view of [attorneyNeedsVerification] for the signed-in user.
final attorneyNeedsVerificationProvider = Provider<bool>((ref) {
  final user = ref.watch(currentUserControllerProvider.select((s) => s.user));
  final tokenVerified =
      ref.watch(sessionControllerProvider.select((s) => s?.verified ?? false));
  return attorneyNeedsVerification(user, tokenVerified: tokenVerified);
});

// --- Reads -----------------------------------------------------------------

/// The practice tree (docs/03 §3.2, 42 categories). Kept for the session —
/// it only changes with a release of the directory.
final practiceTreeProvider = FutureProvider<List<PracticeCategory>>(
  (ref) => ref.watch(practicesRepositoryProvider).fetchTree(),
  retry: (_, __) => null,
);

/// `GET /attorneys/:username`. The caller's own profile also gets the
/// photo from `GET /users/me` (the public DTO has no avatar yet).
final publicAttorneyProfileProvider =
    FutureProvider.autoDispose.family<PublicAttorneyProfile, String>(
  (ref, username) async {
    final profile =
        await ref.watch(attorneyProfileRepositoryProvider).fetchPublic(username);
    if (!profile.isSelf) return profile;
    final avatar =
        ref.read(currentUserControllerProvider.select((s) => s.user?.avatarUrl));
    return profile.withAvatar(avatar);
  },
  retry: (_, __) => null,
);

final reviewSummaryProvider =
    FutureProvider.autoDispose.family<ReviewSummary, String>(
  (ref, attorneyId) => ref.watch(reviewsRepositoryProvider).summary(attorneyId),
  retry: (_, __) => null,
);

final ownAttorneyProfileProvider = FutureProvider.autoDispose<OwnAttorneyProfile>(
  (ref) => ref.watch(attorneyProfileRepositoryProvider).fetchOwn(),
  retry: (_, __) => null,
);

final clientProfileProvider = FutureProvider.autoDispose<ClientProfileDetails>(
  (ref) => ref.watch(clientProfileRepositoryProvider).fetch(),
  retry: (_, __) => null,
);

// --- Reviews list (cursor pagination) ----------------------------------------

class ReviewsListState {
  const ReviewsListState({
    this.items = const [],
    this.nextCursor,
    this.status = AppPaginationStatus.idle,
  });

  final List<Review> items;
  final String? nextCursor;
  final AppPaginationStatus status;

  ReviewsListState copyWith({
    List<Review>? items,
    String? nextCursor,
    bool clearCursor = false,
    AppPaginationStatus? status,
  }) =>
      ReviewsListState(
        items: items ?? this.items,
        nextCursor: clearCursor ? null : nextCursor ?? this.nextCursor,
        status: status ?? this.status,
      );
}

/// `GET /attorneys/:id/reviews?cursor=` — first page is the AsyncValue
/// (skeleton / error / offline states), later pages drive the footer.
class ReviewsListController extends AsyncNotifier<ReviewsListState> {
  ReviewsListController(this.attorneyId);

  final String attorneyId;

  @override
  Future<ReviewsListState> build() => _firstPage();

  Future<ReviewsListState> _firstPage() async {
    final page = await ref.read(reviewsRepositoryProvider).list(attorneyId);
    return ReviewsListState(
      items: page.items,
      nextCursor: page.nextCursor,
      status: page.nextCursor == null ? AppPaginationStatus.end : AppPaginationStatus.idle,
    );
  }

  Future<void> refresh() async {
    final next = await AsyncValue.guard(_firstPage);
    if (ref.mounted) state = next;
  }

  Future<void> loadMore() async {
    final current = state.value;
    if (current == null ||
        current.nextCursor == null ||
        current.status == AppPaginationStatus.loading) {
      return;
    }
    state = AsyncData(current.copyWith(status: AppPaginationStatus.loading));
    try {
      final page = await ref
          .read(reviewsRepositoryProvider)
          .list(attorneyId, cursor: current.nextCursor);
      if (!ref.mounted) return;
      state = AsyncData(
        current.copyWith(
          items: [...current.items, ...page.items],
          nextCursor: page.nextCursor,
          clearCursor: page.nextCursor == null,
          status: page.nextCursor == null ? AppPaginationStatus.end : AppPaginationStatus.idle,
        ),
      );
    } catch (_) {
      if (ref.mounted) {
        state = AsyncData(current.copyWith(status: AppPaginationStatus.error));
      }
    }
  }
}

final reviewsListProvider = AsyncNotifierProvider.autoDispose
    .family<ReviewsListController, ReviewsListState, String>(
  ReviewsListController.new,
  retry: (_, __) => null,
);

// --- Localized practice names ------------------------------------------------

/// Display name of a practice area / category: the translation for
/// [i18nKey] when the bundle has one, else the English name from the API.
/// (Never `t.t()` directly — practice keys live in the server bundle, and
/// the compiled-in translator asserts on a missing key.)
String localizedName(Translator t, String i18nKey, String fallback) {
  final String? value = switch (t) {
    final L10nTranslator l => l.lookup(i18nKey),
    final StaticTranslatorEn s => s.seedEntries[i18nKey],
    final StaticTranslatorRu s => s.seedEntries[i18nKey],
    _ => null,
  };
  return value ?? fallback;
}

/// Human fallback for a category known only by its code ("family_law" →
/// "Family law").
String humanizeCode(String code) {
  final words = code.split('.').first.replaceAll('_', ' ');
  return words.isEmpty ? code : '${words[0].toUpperCase()}${words.substring(1)}';
}
