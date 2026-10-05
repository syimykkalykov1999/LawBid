import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/language_providers.dart';
import 'package:lawbid/features/translation/data/content_translation_repository.dart';

/// Owner 2026-10-05: a text with «Перевести» under it, shown only while
/// the zone of [kind] is on (bootstrap flag). [builder] draws the text
/// (the original or the translation); the original is never replaced on
/// the server, and a second tap shows it again.
class TranslatableText extends ConsumerStatefulWidget {
  const TranslatableText({
    required this.kind,
    required this.id,
    required this.text,
    required this.builder,
    super.key,
    this.enabled = true,
  });

  final TranslatableKind kind;
  final String id;
  final String text;
  final Widget Function(BuildContext context, String text) builder;

  /// False for the person's own text.
  final bool enabled;

  @override
  ConsumerState<TranslatableText> createState() => _TranslatableTextState();
}

class _TranslatableTextState extends ConsumerState<TranslatableText> {
  String? _translated;
  bool _showTranslation = false;
  bool _loading = false;

  @override
  void didUpdateWidget(TranslatableText old) {
    super.didUpdateWidget(old);
    if (old.id != widget.id || old.text != widget.text) {
      _translated = null;
      _showTranslation = false;
    }
  }

  Future<void> _toggle() async {
    if (_translated != null) {
      setState(() => _showTranslation = !_showTranslation);
      return;
    }
    final t = ref.read(translatorProvider);
    final target =
        (ref.read(languageControllerProvider).value ?? AppLanguage.fallback)
            .code;
    setState(() => _loading = true);
    try {
      final text = await ref
          .read(contentTranslationRepositoryProvider)
          .translate(widget.kind, widget.id, target);
      if (!mounted) return;
      setState(() {
        _translated = text;
        _showTranslation = true;
      });
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, errorText(t, e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final showing = _showTranslation && _translated != null;
    final body = widget.builder(context, showing ? _translated! : widget.text);
    final on = widget.enabled &&
        widget.text.trim().isNotEmpty &&
        ref.watch(featureFlagsControllerProvider).isEnabled(widget.kind.flag);
    if (!on) return body;
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        body,
        const SizedBox(height: 4),
        Semantics(
          button: true,
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: _loading ? null : _toggle,
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 2),
              child: Text(
                _loading
                    ? t.t('chat.translate.loading')
                    : showing
                        ? '${t.t('chat.translate.note')} · '
                            '${t.t('chat.translate.original')}'
                        : t.t('chat.translate'),
                style: type.caption.copyWith(
                  color: colors.goldDark,
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}
