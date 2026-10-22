import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/cache/cache_providers.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/core/session/session_providers.dart';
import 'package:lawbid/core/sync/synced_list_notifier.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
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

bool _eventFor(RealtimeEvent e, String id) =>
    e.name == 'consultation:update' &&
    e.data is Map &&
    (e.data! as Map)['consultationId'] == id;

/// One booking; re-read on its own `consultation:update` (package E).
final consultationProvider =
    FutureProvider.autoDispose.family<Consultation, String>(
  (ref, id) {
    final sub = ref.watch(realtimeEventsProvider).listen((e) {
      if (_eventFor(e, id)) ref.invalidateSelf();
    });
    ref.onDispose(sub.cancel);
    return ref.watch(consultationsRepositoryProvider).get(id);
  },
);

/// Bumped after my own booking change: the lists ask one `?updatedSince`.
class ConsultationsTouched extends Notifier<int> {
  @override
  int build() => 0;

  void bump() => state++;
}

final consultationsTouchedProvider =
    NotifierProvider<ConsultationsTouched, int>(ConsultationsTouched.new);

/// Owner 2026-10-22 (package E): never reloaded whole — a
/// `consultation:update`, a reconnect or my own change is one
/// `?updatedSince` (rows that left this view come as `deletedIds`).
class ConsultationsNotifier extends SyncedListNotifier<Consultation> {
  ConsultationsNotifier(this.view);

  final ConsultationView view;

  @override
  String get listKey => 'consultations:${view.name}';

  @override
  String? get syncOwner =>
      ref.read(sessionControllerProvider.select((s) => s?.sub));

  @override
  SyncStateStore? get syncStore => ref.read(cacheDatabaseProvider);

  @override
  Future<PaginatedList<Consultation>> build() {
    final sub = ref.watch(realtimeEventsProvider).listen((e) {
      if (e.name == 'consultation:update' ||
          e.name == RealtimeEvent.reconnected) {
        catchUp();
      }
    });
    ref
      ..onDispose(sub.cancel)
      ..listen(consultationsTouchedProvider, (_, __) => catchUp());
    return super.build();
  }

  @override
  Future<CursorPage<Consultation>> fetchPage(String? cursor) =>
      ref.read(consultationsRepositoryProvider).list(view, cursor: cursor);

  @override
  Future<SyncedPage<Consultation>> fetchChanged(DateTime since) =>
      ref.read(consultationsRepositoryProvider).listChangedSince(view, since);

  @override
  String keyOf(Consultation item) => item.id;

  @override
  DateTime? updatedAtOf(Consultation item) => null;

  @override
  Object idOf(Consultation item) => item.id;
}

final consultationsListProvider = AsyncNotifierProvider.autoDispose.family<
    ConsultationsNotifier, PaginatedList<Consultation>, ConsultationView>(
  ConsultationsNotifier.new,
);

/// After a change of mine: the lists ask one delta, the slots and the one
/// booking are re-read.
void refreshConsultations(WidgetRef ref, {String? id}) {
  ref.read(consultationsTouchedProvider.notifier).bump();
  ref.invalidate(consultationSlotsProvider);
  if (id != null) ref.invalidate(consultationProvider(id));
}
