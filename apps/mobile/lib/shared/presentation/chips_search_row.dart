import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/shared/presentation/flip_search_bar.dart';
import 'package:lawbid/shared/presentation/list_search_field.dart';

/// Owner 2026-10-20 (Telegram): the chips and the search in ONE row —
/// the folder chips on the left (they scroll when the words are long), a
/// round magnifier on the right. A tap on it opens the search over the whole
/// row; the cross brings the chips back.
class ChipsSearchRow extends ConsumerStatefulWidget {
  const ChipsSearchRow({
    required this.chips,
    required this.hintKey,
    required this.query,
    required this.onQuery,
    this.leading,
    this.trailing,
    this.openSignal = 0,
    this.openKey = const ValueKey('list-search-open'),
    this.fieldKey = const ValueKey('list-search'),
    this.closeKey = const ValueKey('list-search-close'),
    super.key,
  });

  /// The chips at the left (they scroll themselves when the words are long).
  final Widget chips;

  /// An icon between the chips and the magnifier (a section's own door, like
  /// the channels).
  final Widget? leading;

  /// Owner 2026-10-21: a button in the magnifier's place (Chats: «+»; the
  /// magnifier then lives in the top bar and opens the row by [openSignal]).
  final Widget? trailing;

  /// Each change opens the search (a magnifier outside the row).
  final int openSignal;

  /// Translation key of the placeholder and of the magnifier's label.
  final String hintKey;
  final String query;
  final ValueChanged<String> onQuery;
  final Key openKey;
  final Key fieldKey;
  final Key closeKey;

  /// The bar's height in both states.
  static const double height = 48;

  @override
  ConsumerState<ChipsSearchRow> createState() => _ChipsSearchRowState();
}

class _ChipsSearchRowState extends ConsumerState<ChipsSearchRow> {
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

  @override
  void didUpdateWidget(ChipsSearchRow old) {
    super.didUpdateWidget(old);
    if (widget.openSignal != old.openSignal && !_open) _openSearch();
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
          child: SizedBox(height: ChipsSearchRow.height, child: child),
        );
    if (_open) {
      return bar(
        Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.screenSide,
            vertical: AppSpacing.xs,
          ),
          child: FlipSearchBar(
            key: widget.fieldKey,
            controller: _text,
            focusNode: _focus,
            semanticLabel: t.t(widget.hintKey),
            cancelLabel: t.t('common.cancel'),
            clearLabel: t.t('search.clear'),
            showCancel: false,
            hints: [t.t(widget.hintKey)],
            onSubmitted: widget.onQuery,
            trailing: AppIconButton(
              key: widget.closeKey,
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
            child: widget.chips,
          ),
          if (widget.leading != null) widget.leading!,
          if (widget.trailing != null)
            Padding(
              padding: const EdgeInsetsDirectional.only(
                start: AppSpacing.xs,
                end: AppSpacing.sm,
              ),
              child: widget.trailing,
            )
          else
            Padding(
              padding: const EdgeInsetsDirectional.only(
                start: AppSpacing.xs,
                end: AppSpacing.sm,
              ),
              child: AppIconButton(
                key: widget.openKey,
                compact: true,
                icon: AppIcon(
                  AppIcons.searchRounded,
                  size: 22,
                  color: colors.text,
                ),
                semanticLabel: t.t(widget.hintKey),
                onPressed: _openSearch,
              ),
            ),
        ],
      ),
    );
  }
}
