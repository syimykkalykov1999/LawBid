import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/shared/presentation/flip_search_bar.dart';

/// Owner 2026-10-18: the search box above a list whose matching the server
/// does (chats, followers, following) — the app's 36 px search field, a
/// magnifier at the end, the placeholder says what is searched. [onChanged]
/// gets the trimmed text after a short pause in typing ('' = cleared).
class ListSearchField extends ConsumerStatefulWidget {
  const ListSearchField({
    required this.hintKey,
    required this.onChanged,
    this.initial = '',
    this.fieldKey,
    super.key,
  });

  /// Translation key of the placeholder.
  final String hintKey;
  final ValueChanged<String> onChanged;
  final String initial;
  final Key? fieldKey;

  static const debounce = Duration(milliseconds: 300);

  @override
  ConsumerState<ListSearchField> createState() => _ListSearchFieldState();
}

class _ListSearchFieldState extends ConsumerState<ListSearchField> {
  late final _text = TextEditingController(text: widget.initial)
    ..addListener(_onText);
  final _focus = FocusNode();
  Timer? _timer;
  late String _last = widget.initial.trim();

  @override
  void dispose() {
    _timer?.cancel();
    _text.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _onText() {
    final v = _text.text.trim();
    if (v == _last) return;
    _timer?.cancel();
    // Clearing the box brings the normal list back at once.
    if (v.isEmpty) {
      _last = v;
      widget.onChanged(v);
      return;
    }
    _timer = Timer(ListSearchField.debounce, () {
      if (!mounted) return;
      _last = v;
      widget.onChanged(v);
    });
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenSide,
        AppSpacing.sm,
        AppSpacing.screenSide,
        AppSpacing.sm,
      ),
      child: FlipSearchBar(
        key: widget.fieldKey ?? const ValueKey('list-search'),
        controller: _text,
        focusNode: _focus,
        semanticLabel: t.t(widget.hintKey),
        cancelLabel: t.t('common.cancel'),
        clearLabel: t.t('search.clear'),
        showCancel: false,
        hints: [t.t(widget.hintKey)],
        trailing: AppIconButton(
          icon: AppIcon(AppIcons.searchRounded, color: colors.textSecondary),
          semanticLabel: t.t(widget.hintKey),
          onPressed: _focus.requestFocus,
        ),
      ),
    );
  }
}
