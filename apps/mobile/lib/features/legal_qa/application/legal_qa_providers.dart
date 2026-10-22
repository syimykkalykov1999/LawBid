import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/cache/cache_providers.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/core/session/session_providers.dart';
import 'package:lawbid/core/sync/synced_list_notifier.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
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

/// Bumped after my own question / answer action: every list on screen
/// catches up («Mine» by one `?updatedSince`, the other tabs by a page).
class QuestionsTouched extends Notifier<int> {
  @override
  int build() => 0;

  void bump() => state++;
}

final questionsTouchedProvider =
    NotifierProvider<QuestionsTouched, int>(QuestionsTouched.new);

/// Owner 2026-10-22 (client economy plan, package F): «Mine» catches up
/// with `?updatedSince` (deleted ones leave); the other tabs are pull.
class QuestionsNotifier extends SyncedListNotifier<Question> {
  QuestionsNotifier(this.query);

  final QuestionsQuery query;

  @override
  String get listKey =>
      'questions:mine:${query.practiceAreaId ?? ''}:${query.stateCode ?? ''}';

  @override
  String? get syncOwner =>
      ref.read(sessionControllerProvider.select((s) => s?.sub));

  @override
  SyncStateStore? get syncStore => ref.read(cacheDatabaseProvider);

  @override
  bool get catchesUp => query.filter == QaFilter.mine && query.q.trim().isEmpty;

  @override
  Future<PaginatedList<Question>> build() {
    final sub = ref.watch(realtimeEventsProvider).listen((e) {
      if (e.name == RealtimeEvent.reconnected) catchUp();
    });
    ref
      ..onDispose(sub.cancel)
      ..listen(questionsTouchedProvider, (_, __) => catchUp());
    return super.build();
  }

  @override
  Future<CursorPage<Question>> fetchPage(String? cursor) =>
      ref.read(legalQaRepositoryProvider).list(query, cursor: cursor);

  @override
  Future<SyncedPage<Question>> fetchChanged(DateTime since) =>
      ref.read(legalQaRepositoryProvider).listChangedSince(query, since);

  @override
  String keyOf(Question item) => item.id;

  @override
  DateTime? updatedAtOf(Question item) => null;

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
