import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/features/cases/application/paged_notifier.dart';
import 'package:lawbid/features/consultations/data/consultations_repository.dart';
import 'package:lawbid/features/consultations/domain/consultation_models.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

final consultationsRepositoryProvider = Provider<ConsultationsRepository>(
  (ref) => ConsultationsRepository(ref.watch(dioProvider)),
);

/// The `consultations` flag — hides every entry point when off.
final consultationsFlagProvider = Provider<bool>(
  (ref) => ref.watch(featureFlagsControllerProvider).isEnabled('consultations'),
);

final consultationSettingsProvider =
    FutureProvider.autoDispose<ConsultationSettings>(
  (ref) => ref.watch(consultationsRepositoryProvider).settings(),
);

/// Free starts of one attorney for the next two weeks.
final consultationSlotsProvider =
    FutureProvider.autoDispose.family<ConsultationSlots, String>(
  (ref, attorneyId) =>
      ref.watch(consultationsRepositoryProvider).slots(attorneyId),
);

final consultationProvider =
    FutureProvider.autoDispose.family<Consultation, String>(
  (ref, id) => ref.watch(consultationsRepositoryProvider).get(id),
);

class ConsultationsNotifier extends PagedNotifier<Consultation> {
  ConsultationsNotifier(this.view);

  final ConsultationView view;

  @override
  Future<CursorPage<Consultation>> fetch(String? cursor) =>
      ref.read(consultationsRepositoryProvider).list(view, cursor: cursor);

  @override
  Object idOf(Consultation item) => item.id;
}

final consultationsListProvider = AsyncNotifierProvider.autoDispose.family<
    ConsultationsNotifier, PaginatedList<Consultation>, ConsultationView>(
  ConsultationsNotifier.new,
);

/// Re-reads every list and one booking after a change.
void refreshConsultations(WidgetRef ref, {String? id}) {
  ref
    ..invalidate(consultationsListProvider)
    ..invalidate(consultationSlotsProvider);
  if (id != null) ref.invalidate(consultationProvider(id));
}
