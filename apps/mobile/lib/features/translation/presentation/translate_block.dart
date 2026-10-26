import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/language_providers.dart';
import 'package:lawbid/features/plans/presentation/plan_offer.dart';
import 'package:lawbid/features/translation/data/device_translator.dart';

/// Owner 2026-10-20: a text with «Перевести» under it. The translation
/// runs on the phone (Google ML Kit: free, offline after a one-time download
/// of the language); [server] is the old paid Google Translate path, used
/// only while the admin has switched it on (`serverOn`) and the phone cannot
/// translate the pair. On the web there is no ML Kit: the line says the
/// translation is in the app.
///
/// [builder] draws the text: `null` = the original, otherwise the
/// translation. The original is never replaced on the server, and a second
/// tap shows it again.
class TranslateBlock extends ConsumerStatefulWidget {
  const TranslateBlock({
    required this.text,
    required this.builder,
    super.key,
    this.enabled = true,
    this.serverOn = false,
    this.server,
    this.identity,
  });

  /// The text to translate (what the original shows).
  final String text;

  /// Draws the original (`null`) or the translation.
  final Widget Function(BuildContext context, String? translation) builder;

  /// False for the person's own text.
  final bool enabled;

  /// The paid server translation is switched on in the admin.
  final bool serverOn;

  /// Translates on the server into the given language code.
  final Future<String> Function(String target)? server;

  /// Changes when the source changes (an id), to drop the old translation.
  final Object? identity;

  @override
  ConsumerState<TranslateBlock> createState() => _TranslateBlockState();
}

enum _Phase { idle, working, downloading }

class _TranslateBlockState extends ConsumerState<TranslateBlock> {
  String? _translated;
  bool _showTranslation = false;
  _Phase _phase = _Phase.idle;

  @override
  void didUpdateWidget(TranslateBlock old) {
    super.didUpdateWidget(old);
    if (old.identity != widget.identity || old.text != widget.text) {
      _translated = null;
      _showTranslation = false;
    }
  }

  String get _target =>
      (ref.read(languageControllerProvider).value ?? AppLanguage.fallback).code;

  bool get _serverCan => widget.serverOn && widget.server != null;

  Future<void> _toggle() async {
    if (_translated != null) {
      setState(() => _showTranslation = !_showTranslation);
      return;
    }
    final target = _target;
    final t = ref.read(translatorProvider);
    final device = ref.read(deviceTranslatorProvider);
    setState(() => _phase = _Phase.working);
    try {
      String text;
      try {
        if (!device.supportsTarget(target)) {
          throw const DeviceTranslateException(
            DeviceTranslateFailure.targetUnsupported,
          );
        }
        text = await device.translate(
          widget.text,
          target,
          onDownloading: () {
            if (mounted) setState(() => _phase = _Phase.downloading);
          },
        );
      } on DeviceTranslateException catch (e) {
        // The phone cannot do this pair (Kyrgyz, Kazakh…): the paid server
        // does it only when the admin allowed it. A text already in the
        // app language needs no translation at all.
        if (e.reason == DeviceTranslateFailure.sameLanguage || !_serverCan) {
          if (mounted) showAppSnackBar(context, t.t(e.reason.key));
          return;
        }
        text = await widget.server!(target);
      }
      if (!mounted) return;
      setState(() {
        _translated = text;
        _showTranslation = true;
      });
    } on Object catch (e) {
      if (mounted) showErrorOrPlans(context, ref, e);
    } finally {
      if (mounted) setState(() => _phase = _Phase.idle);
    }
  }

  @override
  Widget build(BuildContext context) {
    final showing = _showTranslation && _translated != null;
    final body = widget.builder(context, showing ? _translated : null);
    if (!widget.enabled || widget.text.trim().isEmpty) return body;
    // Owner 2026-10-20: the translator is off until the admin switches
    // `chat_translate` on: no button, and no model download starts.
    if (!ref
        .watch(featureFlagsControllerProvider)
        .isEnabled('chat_translate')) {
      return body;
    }
    final device = ref.watch(deviceTranslatorProvider);
    final target =
        (ref.watch(languageControllerProvider).value ?? AppLanguage.fallback)
            .code;
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final style = type.caption.copyWith(
      color: colors.goldDark,
      fontWeight: FontWeight.w600,
    );
    final canDevice = device.supportsTarget(target);
    Widget line;
    if (!canDevice && !_serverCan) {
      // Web: the phone app translates. Elsewhere an app language ML Kit has
      // no model for shows nothing (a dead button would only annoy).
      if (!kIsWeb) return body;
      line = Text(
        t.t('translate.web'),
        style: style.copyWith(color: colors.textSecondary),
      );
    } else {
      final busy = _phase != _Phase.idle;
      line = Semantics(
        button: true,
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: busy ? null : _toggle,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (busy) ...[
                SizedBox(
                  width: 11,
                  height: 11,
                  child: CircularProgressIndicator(
                    strokeWidth: 1.6,
                    color: colors.goldDark,
                  ),
                ),
                const SizedBox(width: 6),
              ],
              Flexible(
                child: Text(
                  switch (_phase) {
                    _Phase.downloading => t.t('translate.download'),
                    _Phase.working => t.t('chat.translate.loading'),
                    _Phase.idle when showing =>
                      '${t.t('chat.translate.note')} · '
                          '${t.t('chat.translate.original')}',
                    _Phase.idle => t.t('chat.translate'),
                  },
                  style: style,
                ),
              ),
            ],
          ),
        ),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        body,
        const SizedBox(height: 4),
        Padding(padding: const EdgeInsets.symmetric(vertical: 2), child: line),
      ],
    );
  }
}
