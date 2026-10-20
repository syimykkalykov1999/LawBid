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
/// unanswered questions of their practice (0 for everyone else, offline,
/// or while the flag is off).
final qaNewCountProvider = FutureProvider.autoDispose<int>((ref) async {
  if (!ref.watch(legalQaEnabledProvider) ||
      !ref.watch(actsAsAttorneyProvider)) {
    return 0;
  }
  try {
    return await ref.watch(legalQaRepositoryProvider).newCount();
  } on Object {
    return 0;
  }
});

const _kBannerDay = 'qa.banner.day';

String _today() => DateTime.now().toIso8601String().substring(0, 10);

/// Whether the feed banner was already used today (shown at most once a
/// day: a tap or a swipe puts it away until tomorrow).
class QaBannerHidden extends Notifier<bool> {
  @override
  bool build() =>
      ref.watch(sharedPreferencesProvider).getString(_kBannerDay) == _today();

  void hideToday() {
    state = true;
    ref.read(sharedPreferencesProvider).setString(_kBannerDay, _today());
  }
}

final qaBannerHiddenProvider =
    NotifierProvider<QaBannerHidden, bool>(QaBannerHidden.new);
