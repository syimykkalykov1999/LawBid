import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/features/cases/application/case_history_controller.dart';
import 'package:lawbid/features/settings/data_export/data/data_export_repository.dart';

final dataExportRepositoryProvider = Provider<DataExportRepository>(
  (ref) => ApiDataExportRepository(ref.watch(dioProvider)),
);

/// How often the status is re-read while the ZIP is being built; tests
/// shorten it.
final dataExportPollIntervalProvider =
    Provider<Duration>((ref) => const Duration(seconds: 3));

/// docs/06 §5.2: the export requested in this session (`null` until the
/// attorney/client asks for one), polled while queued/processing. The
/// reauth token comes from the shared gate ([historyAccessProvider]).
final dataExportControllerProvider =
    AsyncNotifierProvider.autoDispose<DataExportController, DataExport?>(
  DataExportController.new,
  retry: (_, __) => null,
);

class DataExportController extends AsyncNotifier<DataExport?> {
  static const _maxPolls = 40;
  Timer? _timer;

  @override
  Future<DataExport?> build() async {
    ref.onDispose(() => _timer?.cancel());
    return null;
  }

  /// `POST /users/me/data-export`; a reauth failure locks the gate again.
  Future<void> request() async {
    final token = ref.read(historyAccessProvider).token;
    if (token == null) return;
    state = const AsyncLoading();
    try {
      final job = await ref.read(dataExportRepositoryProvider).request(token);
      if (!ref.mounted) return;
      state = AsyncData(job);
      _poll(job.id, 0);
    } on ApiException catch (e) {
      if (!ref.mounted) return;
      if (e.code == ApiErrorCodes.reauthRequired ||
          e.code == ApiErrorCodes.reauthInvalid) {
        ref.read(historyAccessProvider.notifier).lock();
        state = const AsyncData(null);
        return;
      }
      state = AsyncError(e, StackTrace.current);
    } on Object catch (e, st) {
      if (ref.mounted) state = AsyncError(e, st);
    }
  }

  Future<void> refresh() async {
    final current = state.value;
    if (current == null) return;
    try {
      final next =
          await ref.read(dataExportRepositoryProvider).status(current.id);
      if (ref.mounted) state = AsyncData(next);
    } on Object {
      // Offline: keep the last known status; the next poll retries.
    }
  }

  void _poll(String id, int attempt) {
    _timer?.cancel();
    if (attempt >= _maxPolls) return;
    _timer = Timer(ref.read(dataExportPollIntervalProvider), () async {
      if (!ref.mounted) return;
      await refresh();
      if (!ref.mounted) return;
      final s = state.value;
      if (s != null && s.id == id && s.status.inProgress) {
        _poll(id, attempt + 1);
      }
    });
  }
}
