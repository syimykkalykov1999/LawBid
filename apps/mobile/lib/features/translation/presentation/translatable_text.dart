import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/features/translation/data/content_translation_repository.dart';
import 'package:lawbid/features/translation/presentation/translate_block.dart';

/// Owner 2026-10-05, changed 2026-10-20: a text with «Перевести» under it.
/// The translation runs on the phone ([TranslateBlock]); the paid server
/// translation of this zone ([TranslatableKind.flag]) is the fallback only
/// while the admin has switched it on. [builder] draws the text (the
/// original or the translation).
class TranslatableText extends ConsumerWidget {
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
  Widget build(BuildContext context, WidgetRef ref) {
    // Owner 2026-11-08 (one control): a zone switched off in the admin
    // («Только выбранные») hides «Перевести» there, on-phone path included;
    // the other zones keep it.
    final zoneOn =
        ref.watch(featureFlagsControllerProvider).translationOn(kind.flag);
    return TranslateBlock(
      text: text,
      enabled: enabled && zoneOn,
      identity: id,
      serverOn: zoneOn,
      server: (target) => ref
          .read(contentTranslationRepositoryProvider)
          .translate(kind, id, target),
      builder: (context, translation) => builder(context, translation ?? text),
    );
  }
}
