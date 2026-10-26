import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/features/auth/application/auth_providers.dart';
import 'package:lawbid/features/auth/domain/reauth_result.dart';
import 'package:lawbid/features/cases/application/cases_providers.dart';
import 'package:lawbid/features/cases/application/paged_notifier.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

/// docs/04 §12 "reauthToken 5 минут": the token is valid for viewing for
/// its lifetime; each export/download consumes one on the server.
const Duration kReauthViewWindow = Duration(minutes: 5);

@immutable
class HistoryAccess {
  const HistoryAccess({
    this.token,
    this.issuedAt,
    this.codeSent = false,
    this.busy = false,
    this.error,
  });

  final String? token;
  final DateTime? issuedAt;
  final bool codeSent;
  final bool busy;

  /// 'invalid' | 'network' | 'rateLimited'
  final String? error;

  bool get isOpen =>
      token != null &&
      issuedAt != null &&
      DateTime.now().difference(issuedAt!) < kReauthViewWindow;
}

/// Re-authentication for "История кейсов" (docs/04 §12: code to the
/// verified phone, `POST /auth/reauth`). Kept in memory only.
class HistoryAccessController extends Notifier<HistoryAccess> {
  @override
  HistoryAccess build() => const HistoryAccess();

  String? get phone => ref.read(currentUserControllerProvider).user?.phone;

  Future<void> sendCode() async {
    final p = phone;
    if (p == null) return;
    state = const HistoryAccess(busy: true);
    try {
      await ref.read(authRepositoryProvider).requestOtp(p);
      state = const HistoryAccess(codeSent: true);
    } on Object {
      state = const HistoryAccess(error: 'network');
    }
  }

  Future<void> submitCode(String code) async {
    final p = phone;
    if (p == null) return;
    state = const HistoryAccess(codeSent: true, busy: true);
    final result = await ref
        .read(authRepositoryProvider)
        .reauthWithOtp(identifier: p, code: code);
    state = switch (result) {
      ReauthSuccess(:final reauthToken) =>
        HistoryAccess(token: reauthToken, issuedAt: DateTime.now()),
      ReauthInvalid() => const HistoryAccess(codeSent: true, error: 'invalid'),
      ReauthRateLimited() =>
        const HistoryAccess(codeSent: true, error: 'rateLimited'),
      _ => const HistoryAccess(codeSent: true, error: 'network'),
    };
  }

  /// A token was consumed (export / download) or refused: ask again.
  void lock() => state = const HistoryAccess();
}

final historyAccessProvider =
    NotifierProvider<HistoryAccessController, HistoryAccess>(
  HistoryAccessController.new,
);

class CaseHistoryNotifier extends PagedNotifier<HistoryCase> {
  @override
  Future<CursorPage<HistoryCase>> fetch(String? cursor) {
    final token = ref.read(historyAccessProvider).token;
    if (token == null) throw StateError('reauth required');
    return ref.read(casesRepositoryProvider).history(token, cursor: cursor);
  }

  @override
  Object idOf(HistoryCase item) => item.id;
}

final caseHistoryProvider = AsyncNotifierProvider.autoDispose<
    CaseHistoryNotifier, PaginatedList<HistoryCase>>(
  CaseHistoryNotifier.new,
  retry: (_, __) => null,
);

final caseHistoryDetailProvider =
    FutureProvider.autoDispose.family<HistoryCaseDetail, String>(
  (ref, id) {
    final token = ref.watch(historyAccessProvider.select((a) => a.token));
    if (token == null) throw StateError('reauth required');
    return ref.watch(casesRepositoryProvider).historyCase(token, id);
  },
  retry: (_, __) => null,
);
