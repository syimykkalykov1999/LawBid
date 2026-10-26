import 'package:flutter/material.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/chat_folders.dart';
import 'package:lawbid/shared/presentation/chips_search_row.dart';

/// Owner 2026-10-20 (Telegram): the chat folders and the search in ONE row.
class ChatsFilterRow extends StatelessWidget {
  const ChatsFilterRow({
    required this.folder,
    required this.onFolder,
    required this.query,
    required this.onQuery,
    this.leading,
    this.trailing,
    this.openSignal = 0,
    super.key,
  });

  final ChatListFolder folder;
  final ValueChanged<ChatListFolder> onFolder;
  final String query;
  final ValueChanged<String> onQuery;
  final Widget? leading;
  final Widget? trailing;
  final int openSignal;

  /// The bar's height in both states.
  static const double height = ChipsSearchRow.height;

  @override
  Widget build(BuildContext context) => ChipsSearchRow(
        leading: leading,
        // Owner 2026-10-22: the magnifier is in the top bar, the «+» is a
        // floating button — nothing at the row's end.
        trailing: trailing ?? const SizedBox.shrink(),
        openSignal: openSignal,
        chips: ChatFolderPills(value: folder, onChanged: onFolder),
        hintKey: 'chat.search.hint',
        query: query,
        onQuery: onQuery,
        openKey: const ValueKey('chat-search-open'),
        fieldKey: const ValueKey('chat-search'),
        closeKey: const ValueKey('chat-search-close'),
      );
}
