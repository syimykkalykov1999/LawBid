import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/root_messenger.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/uploads/upload_queue.dart';
import 'package:lawbid/core/uploads/upload_queue_database.dart';

/// Owner 2026-11-08 («never lose the user's input»): a queued job the server
/// refused for good, where its screen has no «not sent» element (a review,
/// a case update), says so in the app-wide snackbar with «Повторить» — the
/// same message + action the app shows elsewhere. The job stays in the queue
/// (with its files) until it is sent.
void showQueueRefused(Ref ref, UploadQueue queue, String jobId, String code) {
  final t = ref.read(translatorProvider);
  rootMessengerKey.currentState
    ?..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        key: const ValueKey('queue-refused'),
        content: Text(apiErrorText(t, ApiException(code: code, message: code))),
        duration: const Duration(seconds: 10),
        action: SnackBarAction(
          label: t.t('error.retry'),
          onPressed: () => unawaited(queue.retry(jobId)),
        ),
      ),
    );
}

/// At start: jobs of [kind] refused in an earlier run say so again (they
/// were never sent; the user's input is still here).
Future<void> showRefusedAtStart(Ref ref, UploadQueue queue, String kind) async {
  final owner = queue.ownerId;
  if (owner == null) return;
  final List<UploadJobRow> rows;
  try {
    rows = await queue.db.ofKind(owner, kind);
  } on Object {
    return;
  }
  for (final r in rows) {
    final code = r.failedCode;
    if (code != null) showQueueRefused(ref, queue, r.id, code);
  }
}
