import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/features/cases/application/case_history_controller.dart';
import 'package:lawbid/features/settings/data_export/data/data_export_repository.dart';
import 'package:url_launcher/url_launcher.dart';

final dataExportRepositoryProvider = Provider<DataExportRepository>(
  (ref) => ApiDataExportRepository(ref.watch(dioProvider)),
);

/// Opens the ZIP link outside the app (the browser downloads it); tests
/// replace it.
final dataExportLauncherProvider = Provider<Future<bool> Function(Uri)>(
  (ref) => (uri) => launchUrl(uri, mode: LaunchMode.externalApplication),
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

  /// The gate's token while it is still fresh (5 minutes), else null.
  String? get freshToken {
    final access = ref.read(historyAccessProvider);
    return access.isOpen ? access.token : null;
  }

  /// The server wants a (new) reauth.
  static bool isReauthError(Object e) =>
      e is ApiException &&
      (e.code == ApiErrorCodes.reauthRequired ||
          e.code == ApiErrorCodes.reauthInvalid);

  /// Re-reads the status. Detective R2B-12 (14.11): the gate's token goes
  /// along while it is fresh; a token the server refuses (used up, expired
  /// a second early) is not a failed poll — the status is read without it.
  Future<void> refresh() async {
    final current = state.value;
    if (current == null) return;
    final repo = ref.read(dataExportRepositoryProvider);
    final token = freshToken;
    try {
      DataExport next;
      try {
        next = await repo.status(current.id, reauthToken: token);
      } on Object catch (e) {
        if (token == null || !isReauthError(e)) rethrow;
        next = await repo.status(current.id);
      }
      if (ref.mounted) state = AsyncData(next);
    } on Object {
      // Offline: keep the last known status; the next poll retries.
    }
  }

  /// Detective R2B-12 (14.11): the download link, read with a fresh
  /// [reauthToken] (the server gives it out only then). Null when the
  /// export is no longer ready. Throws [ApiException] — a reauth error
  /// means «ask again» (the caller opens the reauth sheet).
  Future<String?> linkWith(String reauthToken) async {
    final current = state.value;
    if (current == null) return null;
    final next = await ref
        .read(dataExportRepositoryProvider)
        .status(current.id, reauthToken: reauthToken);
    if (ref.mounted) state = AsyncData(next);
    return next.status == DataExportStatus.ready ? next.url : null;
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
