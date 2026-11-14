import 'dart:async';

import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

/// One page of hits: message ids, newest first.
typedef InChatSearchPage = Future<CursorPage<String>> Function(
  String q, {
  String? cursor,
});

/// Row 110 (Telegram 🔍 in a chat: the field in the top bar, the bottom bar
/// with «N of M» and ↑ / ↓ that jump to the message and flash it; WhatsApp
/// contact info → Search): the search of one chat, shared by direct chats
/// and groups. The server matches the words ([InChatSearchPage]); this
/// holds the hits, the current one, and walks to older pages on ↑.
class InChatSearch extends ChangeNotifier {
  InChatSearch({
    required this.search,
    required this.jump,
    this.debounce = const Duration(milliseconds: 300),
  });

  final InChatSearchPage search;

  /// Scrolls the chat to the message and flashes it.
  final Future<bool> Function(String messageId) jump;
  final Duration debounce;

  String _q = '';
  List<String> _hits = const [];
  String? _cursor;
  int _index = -1;
  bool _busy = false;
  Object? _error;
  int _run = 0;
  Timer? _wait;

  /// The typed text.
  String get query => _q;

  /// The hits loaded so far, newest first.
  List<String> get hits => _hits;

  /// The shown hit (0 = newest), -1 while there is none.
  int get index => _index;

  /// A request is in flight.
  bool get busy => _busy;
  Object? get error => _error;

  /// More (older) hits wait on the server.
  bool get hasMore => _cursor != null && _cursor!.isNotEmpty;

  /// ↑ may go further back.
  bool get canOlder => _index + 1 < _hits.length || hasMore;

  /// ↓ may come back toward the newest.
  bool get canNewer => _index > 0;

  /// The field changed: a new search after a short pause.
  void type(String q) {
    _wait?.cancel();
    _q = q;
    if (q.trim().isEmpty) {
      _run++;
      _hits = const [];
      _cursor = null;
      _index = -1;
      _busy = false;
      _error = null;
      notifyListeners();
      return;
    }
    _wait = Timer(debounce, () => unawaited(submit()));
  }

  /// Searches now (Enter, or the pause after typing).
  Future<void> submit() async {
    _wait?.cancel();
    final q = _q.trim();
    if (q.isEmpty) return;
    final run = ++_run;
    _busy = true;
    _error = null;
    notifyListeners();
    try {
      final page = await search(q);
      if (run != _run) return;
      _hits = page.items;
      _cursor = page.nextCursor;
      _index = _hits.isEmpty ? -1 : 0;
    } on Object catch (e) {
      if (run != _run) return;
      _error = e;
      _hits = const [];
      _cursor = null;
      _index = -1;
    }
    _busy = false;
    notifyListeners();
    if (_index == 0) await jump(_hits.first);
  }

  /// ↑ — the next older hit (loads the next page when needed).
  Future<void> older() async {
    if (_busy || !canOlder) return;
    if (_index + 1 >= _hits.length) {
      final run = _run;
      _busy = true;
      notifyListeners();
      try {
        final page = await search(_q.trim(), cursor: _cursor);
        if (run != _run) return;
        _hits = [..._hits, ...page.items];
        _cursor = page.nextCursor;
      } on Object catch (e) {
        if (run != _run) return;
        _error = e;
      }
      _busy = false;
      if (_index + 1 >= _hits.length) {
        notifyListeners();
        return;
      }
    }
    _index++;
    notifyListeners();
    await jump(_hits[_index]);
  }

  /// ↓ — the next newer hit.
  Future<void> newer() async {
    if (_busy || !canNewer) return;
    _index--;
    notifyListeners();
    await jump(_hits[_index]);
  }

  @override
  void dispose() {
    _wait?.cancel();
    _run++;
    super.dispose();
  }
}

/// The search field that stands in the top bar while searching.
class InChatSearchField extends StatelessWidget {
  const InChatSearchField({
    required this.search,
    required this.controller,
    required this.t,
    super.key,
  });

  final InChatSearch search;
  final TextEditingController controller;
  final Translator t;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return TextField(
      key: const ValueKey('in-chat-search-field'),
      controller: controller,
      autofocus: true,
      textInputAction: TextInputAction.search,
      style: type.body.copyWith(color: colors.text),
      decoration: InputDecoration(
        hintText: t.t('common.search'),
        border: InputBorder.none,
        isDense: true,
      ),
      onChanged: search.type,
      onSubmitted: (_) => unawaited(search.submit()),
    );
  }
}

/// The bottom bar while searching: «N of M» and ↑ / ↓.
class InChatSearchBar extends StatelessWidget {
  const InChatSearchBar({required this.search, required this.t, super.key});

  final InChatSearch search;
  final Translator t;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return ListenableBuilder(
      listenable: search,
      builder: (context, _) {
        final String label;
        if (search.query.trim().isEmpty) {
          label = '';
        } else if (search.busy && search.hits.isEmpty) {
          label = '…';
        } else if (search.hits.isEmpty) {
          label = t.t('chat.search.empty.title');
        } else {
          label = t.t('cases.dossier.score', {
            'n': '${search.index + 1}',
            'total': search.hasMore
                ? '${search.hits.length}+'
                : '${search.hits.length}',
          });
        }
        return Material(
          color: colors.surface,
          child: SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.md,
                vertical: AppSpacing.xs,
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      label,
                      key: const ValueKey('in-chat-search-count'),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: type.body.copyWith(color: colors.textSecondary),
                    ),
                  ),
                  AppIconButton(
                    key: const ValueKey('in-chat-search-older'),
                    icon: AppIcon(
                      AppIcons.arrowUpwardRounded,
                      color:
                          search.canOlder ? colors.text : colors.textSecondary,
                    ),
                    semanticLabel: t.t('chat.search.older'),
                    onPressed: search.canOlder
                        ? () => unawaited(search.older())
                        : null,
                  ),
                  AppIconButton(
                    key: const ValueKey('in-chat-search-newer'),
                    icon: AppIcon(
                      AppIcons.arrowDownwardRounded,
                      color:
                          search.canNewer ? colors.text : colors.textSecondary,
                    ),
                    semanticLabel: t.t('chat.search.newer'),
                    onPressed: search.canNewer
                        ? () => unawaited(search.newer())
                        : null,
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}
