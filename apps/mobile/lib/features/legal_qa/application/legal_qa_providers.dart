import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/cases/application/paged_notifier.dart';
import 'package:lawbid/features/legal_qa/data/legal_qa_repository.dart';
import 'package:lawbid/features/legal_qa/domain/qa_models.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

/// Owner 2026-10-20: the `legal_qa` flag hides every entry point.
const kLegalQaFlag = 'legal_qa';

final legalQaEnabledProvider = Provider<bool>(
  (ref) => ref.watch(featureFlagsControllerProvider).isEnabled(kLegalQaFlag),
);

final legalQaRepositoryProvider = Provider<LegalQaRepository>(
  (ref) => LegalQaRepository(ref.watch(dioProvider)),
);

class QuestionsNotifier extends PagedNotifier<Question> {
  QuestionsNotifier(this.query);

  final QuestionsQuery query;

  @override
  Future<CursorPage<Question>> fetch(String? cursor) =>
      ref.read(legalQaRepositoryProvider).list(query, cursor: cursor);

  @override
  Object idOf(Question item) => item.id;
}

final questionsProvider = AsyncNotifierProvider.autoDispose
    .family<QuestionsNotifier, PaginatedList<Question>, QuestionsQuery>(
  QuestionsNotifier.new,
  retry: (_, __) => null,
);

/// One question with its answers.
final questionDetailProvider =
    FutureProvider.autoDispose.family<Question, String>(
  (ref, id) => ref.watch(legalQaRepositoryProvider).detail(id),
);

/// Owner 2026-10-20: no pushes to attorneys; instead a quiet count of fresh
/// unanswered questions of their practice (zeros for everyone else, offline,
/// or while the flag is off) plus the admin's display settings.
final qaSummaryProvider = FutureProvider.autoDispose<QaSummary>((ref) async {
  if (!ref.watch(legalQaEnabledProvider) ||
      !ref.watch(actsAsAttorneyProvider)) {
    return const QaSummary();
  }
  try {
    return await ref.watch(legalQaRepositoryProvider).summary();
  } on Object {
    return const QaSummary();
  }
});

const _kBannerAt = 'qa.banner.at';

/// When the feed card was last used (tapped or swiped away), as epoch ms;
/// it comes back after the admin's interval (default 24 h).
class QaBannerLastUsed extends Notifier<int?> {
  @override
  int? build() => ref.watch(sharedPreferencesProvider).getInt(_kBannerAt);

  void markUsed() {
    final now = DateTime.now().millisecondsSinceEpoch;
    state = now;
    ref.read(sharedPreferencesProvider).setInt(_kBannerAt, now);
  }
}

final qaBannerLastUsedProvider =
    NotifierProvider<QaBannerLastUsed, int?>(QaBannerLastUsed.new);

/// Whether the card shows now: switched on, enough new questions, and the
/// interval since it was last used has passed.
final qaBannerVisibleProvider = Provider.autoDispose<bool>((ref) {
  final s = ref.watch(qaSummaryProvider).value;
  if (s == null || !s.bannerEnabled || s.newCount < s.bannerMinNew) {
    return false;
  }
  if (s.newCount <= 0) return false;
  final last = ref.watch(qaBannerLastUsedProvider);
  if (last == null) return true;
  final due = last + s.bannerIntervalHours * Duration.millisecondsPerHour;
  return DateTime.now().millisecondsSinceEpoch >= due;
});
