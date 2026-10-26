import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';

/// A compact set of stickers for a story.
const List<String> kStoryEmojis = [
  '😀', '😂', '🥹', '😍', '🥰', '😎', '🤩', '😇', //
  '😉', '😘', '🤗', '🤔', '😮', '😢', '😭', '😡',
  '🥳', '😴', '🤝', '👍', '👎', '👏', '🙌', '🙏',
  '💪', '👀', '✌️', '🤞', '👌', '🔥', '✨', '⭐',
  '💥', '🎉', '🎊', '🎁', '🏆', '🥇', '💯', '✅',
  '❌', '❗', '❓', '💡', '📌', '📍', '📅', '⏰',
  '⚖️', '📜', '🏛️', '🔒', '🔑', '📞', '✉️', '💼',
  '📎', '🖊️', '📚', '🎓', '💰', '🚗', '🏠', '✈️',
  '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '💔',
  '🌞', '🌙', '⚡', '🌈', '☕', '🍀', '🌸', '🎵',
];

/// Opens the sticker grid; the picked emoji, or null.
Future<String?> showStoryEmojiPicker(BuildContext context, WidgetRef ref) {
  final t = ref.read(translatorProvider);
  return showAppBottomSheet<String>(
    context: context,
    isScrollControlled: true,
    builder: (sheet) {
      final type = Theme.of(sheet).extension<AppTypographyTokens>()!;
      final height = MediaQuery.sizeOf(sheet).height * 0.55;
      return SafeArea(
        child: SizedBox(
          height: height,
          child: Column(
            children: [
              const AppSheetHandle(),
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.screenSide,
                  AppSpacing.sm,
                  AppSpacing.screenSide,
                  AppSpacing.sm,
                ),
                child: Align(
                  alignment: AlignmentDirectional.centerStart,
                  child: Text(
                    t.t('story.emoji.title'),
                    style: type.titleMedium,
                  ),
                ),
              ),
              Expanded(
                child: GridView.builder(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.sm,
                  ),
                  gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                    maxCrossAxisExtent: 52,
                    mainAxisExtent: 52,
                  ),
                  itemCount: kStoryEmojis.length,
                  itemBuilder: (context, i) => Semantics(
                    button: true,
                    label: kStoryEmojis[i],
                    excludeSemantics: true,
                    child: InkResponse(
                      onTap: () => Navigator.of(sheet).pop(kStoryEmojis[i]),
                      child: Center(
                        child: Text(
                          kStoryEmojis[i],
                          textScaler: TextScaler.noScaling,
                          style: type.titleLarge,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      );
    },
  );
}
