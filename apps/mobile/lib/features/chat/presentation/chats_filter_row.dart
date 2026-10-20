import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/chat_folders.dart';
import 'package:lawbid/shared/presentation/flip_search_bar.dart';
import 'package:lawbid/shared/presentation/list_search_field.dart';

/// Owner 2026-10-20 (Telegram): the folders and the search in ONE row —
/// the folder chips on the left (they scroll when the words are long), a
/// round magnifier on the right. A tap on it opens the search over the whole
/// row; the cross brings the chips back.
class ChatsFilterRow extends ConsumerStatefulWidget {
  const ChatsFilterRow({
    required this.folder,
    required this.onFolder,
    required this.query,
    required this.onQuery,
    super.key,
  });

  final ChatListFolder folder;
  final ValueChanged<ChatListFolder> onFolder;
  final String query;
  final ValueChanged<String> onQuery;

  /// The bar's height in both states.
  static const double height = 56;

  @override
  ConsumerState<ChatsFilterRow> createState() => _ChatsFilterRowState();
}

class _ChatsFilterRowState extends ConsumerState<ChatsFilterRow> {
  late bool _open = widget.query.isNotEmpty;
  late final _text = TextEditingController(text: widget.query)
    ..addListener(_onText);
  final _focus = FocusNode();
  Timer? _timer;
  late String _last = widget.query.trim();

  /// Same rule as the other list searches: typing waits 300 ms, clearing
  /// the box brings the normal list back at once.
  void _onText() {
    final v = _text.text.trim();
    if (v == _last) return;
    _timer?.cancel();
    if (v.isEmpty) {
      _last = v;
      widget.onQuery(v);
      return;
    }
    _timer = Timer(ListSearchField.debounce, () {
      if (!mounted) return;
      _last = v;
      widget.onQuery(v);
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    _text.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _openSearch() {
    setState(() => _open = true);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _focus.requestFocus();
    });
  }

  void _close() {
    _timer?.cancel();
    _last = '';
    _text.clear();
    _focus.unfocus();
    widget.onQuery('');
    setState(() => _open = false);
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    // Owner 2026-10-20: the bar is opaque and a whole number of pixels high in
    // both states, so a row never shows through or sticks half-hidden under it.
    Widget bar(Widget child) => ColoredBox(
          color: colors.bg,
          child: SizedBox(height: ChatsFilterRow.height, child: child),
        );
    if (_open) {
      return bar(
        Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.screenSide,
            vertical: AppSpacing.xs,
          ),
          child: FlipSearchBar(
            key: const ValueKey('chat-search'),
            controller: _text,
            focusNode: _focus,
            semanticLabel: t.t('chat.search.hint'),
            cancelLabel: t.t('common.cancel'),
            clearLabel: t.t('search.clear'),
            showCancel: false,
            hints: [t.t('chat.search.hint')],
            onSubmitted: widget.onQuery,
            trailing: AppIconButton(
              key: const ValueKey('chat-search-close'),
              icon: AppIcon(AppIcons.closeRounded, color: colors.textSecondary),
              semanticLabel: t.t('common.close'),
              onPressed: _close,
            ),
          ),
        ),
      );
    }
    return bar(
      Row(
        children: [
          Expanded(
            child: ChatFolderPills(
              value: widget.folder,
              onChanged: widget.onFolder,
            ),
          ),
          Padding(
            padding: const EdgeInsetsDirectional.only(
              start: AppSpacing.xs,
              end: AppSpacing.screenSide,
            ),
            child: AppIconButton(
              key: const ValueKey('chat-search-open'),
              icon: AppIcon(AppIcons.searchRounded, color: colors.text),
              semanticLabel: t.t('chat.search.hint'),
              onPressed: _openSearch,
            ),
          ),
        ],
      ),
    );
  }
}
