import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/config/client_tuning.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Row 109 (Telegram «Chat deleted · Undo», Gmail «Archived · Undo»): the
/// message after a chat or a group left my list (deleted for me or moved to
/// the Archive), with «Undo» for `client.undo_window_s`. Undo puts them
/// back on the server (both moves are only mine and reversible) and the
/// lists re-read. Works after the row that started it is gone.
void showChatMoveUndo(
  BuildContext context, {
  required String message,
  required bool archived,
  Iterable<String> chatIds = const [],
  Iterable<String> groupIds = const [],
}) {
  final container = ProviderScope.containerOf(context, listen: false);
  final t = container.read(translatorProvider);
  final chats = [...chatIds];
  final groups = [...groupIds];
  showUndoSnackBar(
    context,
    message: message,
    undoLabel: t.t('tasks.undo'),
    window: ClientTuning.undoWindow,
    onUndo: () => unawaited(
      _undo(container, chats, groups, archived: archived),
    ),
  );
}

Future<void> _undo(
  ProviderContainer container,
  List<String> chats,
  List<String> groups, {
  required bool archived,
}) async {
  try {
    final repo = container.read(chatRepositoryProvider);
    for (final id in chats) {
      await (archived
          ? repo.organize(id, archived: false)
          : repo.organize(id, hidden: false));
    }
    final groupRepo = container.read(groupRepositoryProvider);
    for (final id in groups) {
      await groupRepo.updateMine(
        id,
        archived
            ? const api.UpdateGroupMeDto(archived: false)
            : const api.UpdateGroupMeDto(hidden: false),
      );
    }
  } on Object {
    // Best effort: the chat stays where it went; the lists show the truth.
  }
  container
    ..invalidate(folderConversationsProvider)
    ..invalidate(conversationsProvider)
    ..invalidate(chatFolderCountsProvider)
    ..invalidate(groupsProvider)
    ..invalidate(archivedGroupsProvider);
}
