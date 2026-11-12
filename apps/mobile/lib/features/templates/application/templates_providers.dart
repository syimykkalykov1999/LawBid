import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/features/cases/application/paged_notifier.dart';
import 'package:lawbid/features/templates/data/templates_repository.dart';
import 'package:lawbid/features/templates/domain/doc_template.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

/// Owner 2026-10-05: the flag that turns the templates library on.
const kDocumentTemplatesFlag = 'document_templates';

final templatesEnabledProvider = Provider<bool>(
  (ref) => ref
      .watch(featureFlagsControllerProvider)
      .isEnabled(kDocumentTemplatesFlag),
);

final templatesRepositoryProvider = Provider<TemplatesRepository>(
  (ref) => TemplatesRepository(
    apiDio: ref.watch(dioProvider),
    storageDio: ref.watch(storageDioProvider),
  ),
);

class TemplatesNotifier extends PagedNotifier<DocTemplate> {
  TemplatesNotifier(this.query);

  final TemplatesQuery query;

  // Owner 2026-11-11 (speed, Instagram / Telegram): opens at once on the
  // page this phone showed last time; the live page swaps in behind it
  // (PagedNotifier.phoneCopy, no extra request).
  @override
  Future<CursorPage<DocTemplate>?> cachedFirstPage() {
    final repo = ref.read(templatesRepositoryProvider);
    return phoneCopy(() => repo.list(query), when: query.q.trim().isEmpty);
  }

  @override
  Future<CursorPage<DocTemplate>> fetch(String? cursor) => ref
      .read(templatesRepositoryProvider)
      .list(query, cursor: cursor, fresh: refreshing);

  @override
  Object idOf(DocTemplate item) => item.id;
}

/// Templates for one search / state / order.
final templatesProvider = AsyncNotifierProvider.autoDispose
    .family<TemplatesNotifier, PaginatedList<DocTemplate>, TemplatesQuery>(
  TemplatesNotifier.new,
  retry: (_, __) => null,
);
