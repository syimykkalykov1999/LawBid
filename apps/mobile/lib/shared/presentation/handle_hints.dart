import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/profile/presentation/widgets/username_suggestions.dart';
import 'package:lawbid/shared/application/handle_check.dart';

/// Owner 2026-10-20 (Telegram): under a channel / group @username field —
/// free / taken / reserved / just released / too similar, and up to five free
/// ideas to tap. Waits 400 ms after the last key; checks only [enabled]
/// (locally valid) text; [onVerdict] tells the form whether it may submit.
class HandleHints extends ConsumerStatefulWidget {
  const HandleHints({
    required this.text,
    required this.kind,
    required this.onPick,
    this.title,
    this.id,
    this.unchangedText,
    this.enabled = true,
    this.onVerdict,
    super.key,
  });

  /// The typed @username without `@`.
  final String text;
  final String kind;
  final String? title;
  final String? id;

  /// The handle the edited object already has (shown as fine, not checked).
  final String? unchangedText;
  final bool enabled;
  final ValueChanged<String> onPick;

  /// true = free, false = refused, null = unknown (not checked / offline).
  final ValueChanged<bool?>? onVerdict;

  @override
  ConsumerState<HandleHints> createState() => _HandleHintsState();
}

class _HandleHintsState extends ConsumerState<HandleHints> {
  Timer? _debounce;
  HandleQuery? _query;

  String get _lower => widget.text.trim().toLowerCase();

  bool get _unchanged =>
      widget.unchangedText != null &&
      _lower == widget.unchangedText!.toLowerCase();

  @override
  void initState() {
    super.initState();
    _schedule();
  }

  @override
  void didUpdateWidget(HandleHints old) {
    super.didUpdateWidget(old);
    if (old.text != widget.text || old.enabled != widget.enabled) _schedule();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    super.dispose();
  }

  void _schedule() {
    _debounce?.cancel();
    if (!widget.enabled || _lower.isEmpty || _unchanged) {
      if (_query != null) setState(() => _query = null);
      _report(_unchanged ? true : null);
      return;
    }
    _report(null);
    _debounce = Timer(const Duration(milliseconds: 400), () {
      if (!mounted) return;
      setState(
        () => _query = (
          u: _lower,
          kind: widget.kind,
          title: widget.title,
          id: widget.id,
        ),
      );
    });
  }

  void _report(bool? v) {
    final cb = widget.onVerdict;
    if (cb == null) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) cb(v);
    });
  }

  @override
  Widget build(BuildContext context) {
    final q = _query;
    if (q == null || q.u != _lower || !widget.enabled) {
      return const SizedBox.shrink();
    }
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final verdict = ref.watch(handleCheckProvider(q));
    return verdict.when(
      loading: () => const SizedBox.shrink(),
      error: (_, __) {
        _report(null);
        return const SizedBox.shrink();
      },
      data: (v) {
        _report(v.available);
        final (String text, Color color) = switch (v.reason) {
          null => (t.t('profile.username.available'), colors.successText),
          'reserved' => (t.t('error.api.USERNAME_RESERVED'), colors.dangerText),
          'held' => (t.t('handle.held'), colors.dangerText),
          'similar' => (t.t('handle.similar'), colors.dangerText),
          'taken' => (t.t('error.api.USERNAME_TAKEN'), colors.dangerText),
          _ => (t.t('profile.username.invalid'), colors.dangerText),
        };
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.only(top: AppSpacing.xs),
              child: Text(
                text,
                key: const ValueKey('handle-verdict'),
                style: type.caption.copyWith(color: color),
              ),
            ),
            if (!v.available)
              UsernameSuggestions(
                suggestions: v.suggestions.take(5).toList(),
                onPick: widget.onPick,
              ),
          ],
        );
      },
    );
  }
}
