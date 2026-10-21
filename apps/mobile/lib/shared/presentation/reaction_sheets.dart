import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/shared/domain/reaction_palette.dart';

/// Owner 2026-10-21 (inbox 26b/26c, Telegram): one round emoji button of
/// the reaction pickers (≥ 44 dp to tap); [selected] = my reaction / ticked.
class ReactionEmojiButton extends StatelessWidget {
  const ReactionEmojiButton({
    required this.emoji,
    required this.selected,
    required this.label,
    required this.onTap,
    super.key,
  });

  final String emoji;
  final bool selected;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Semantics(
      button: true,
      selected: selected,
      label: label,
      excludeSemantics: true,
      onTap: onTap,
      child: InkWell(
        onTap: onTap,
        customBorder: const CircleBorder(),
        child: Container(
          width: AppSizes.hitTarget,
          height: AppSizes.hitTarget,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: selected ? colors.goldTint : null,
            border: Border.all(
              color: selected ? colors.goldStroke : colors.border,
            ),
          ),
          child: Text(emoji, style: type.titleLarge),
        ),
      ),
    );
  }
}

/// The «pick a reaction» sheet: [choices] in rows; returns the emoji, or
/// null when dismissed. [mine] is marked.
Future<String?> showReactionPickerSheet(
  BuildContext context,
  Translator t, {
  required List<String> choices,
  String? mine,
  String keyPrefix = 'reaction-pick',
}) =>
    showAppBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      builder: (sheet) => SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.screenSide,
            0,
            AppSpacing.screenSide,
            AppSpacing.lg,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const AppSheetHandle(),
              Wrap(
                alignment: WrapAlignment.center,
                spacing: AppSpacing.sm,
                runSpacing: AppSpacing.sm,
                children: [
                  for (final e in choices)
                    ReactionEmojiButton(
                      key: ValueKey('$keyPrefix-$e'),
                      emoji: e,
                      selected: mine == e,
                      label: t.t('channel.react.pick', {'emoji': e}),
                      onTap: () => Navigator.of(sheet).pop(e),
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );

/// What [showReactionSettingsSheet] returns.
typedef ReactionSettings = ({ReactionsMode mode, List<String> allowed});

/// The admins' «Reactions» setting: all / selected / off, and with
/// «selected» the emojis left open (at least one). Returns the new setting,
/// or null when dismissed.
Future<ReactionSettings?> showReactionSettingsSheet(
  BuildContext context,
  Translator t, {
  required ReactionsMode mode,
  required List<String> allowed,
}) =>
    showAppBottomSheet<ReactionSettings>(
      context: context,
      isScrollControlled: true,
      builder: (sheet) => _ReactionSettingsSheet(
        t: t,
        mode: mode,
        allowed: allowed,
      ),
    );

/// The subtitle of a «Reactions» row: «All reactions», «3 reactions» …
String reactionSettingsLabel(
  Translator t,
  ReactionsMode mode,
  List<String> allowed,
) =>
    switch (mode) {
      ReactionsMode.all => t.t('reactions.mode.all'),
      ReactionsMode.off => t.t('reactions.mode.off'),
      ReactionsMode.some => reactionChoices(mode, allowed).join(' '),
    };

class _ReactionSettingsSheet extends StatefulWidget {
  const _ReactionSettingsSheet({
    required this.t,
    required this.mode,
    required this.allowed,
  });

  final Translator t;
  final ReactionsMode mode;
  final List<String> allowed;

  @override
  State<_ReactionSettingsSheet> createState() => _ReactionSettingsSheetState();
}

class _ReactionSettingsSheetState extends State<_ReactionSettingsSheet> {
  late ReactionsMode _mode = widget.mode;
  late final Set<String> _picked = {
    ...(widget.allowed.isEmpty && widget.mode != ReactionsMode.some
        ? kReactionPalette.take(6)
        : widget.allowed),
  };

  bool get _ready => _mode != ReactionsMode.some || _picked.isNotEmpty;

  @override
  Widget build(BuildContext context) {
    final t = widget.t;
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    Widget mode(ReactionsMode m, IconData icon, String key) => Padding(
          padding: const EdgeInsets.only(bottom: AppSpacing.xs),
          child: AppListRow(
            key: ValueKey('reactions-mode-${m.name}'),
            icon: icon,
            label: t.t(key),
            selected: _mode == m,
            showChevron: false,
            onTap: () => setState(() => _mode = m),
          ),
        );
    return SafeArea(
      top: false,
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.screenSide,
          AppSpacing.md,
          AppSpacing.screenSide,
          AppSpacing.lg,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Center(child: AppSheetHandle()),
            Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.md,
                vertical: AppSpacing.sm,
              ),
              child: Text(
                t.t('reactions.title'),
                style: type.titleMedium.copyWith(color: colors.text),
              ),
            ),
            mode(
              ReactionsMode.all,
              AppIcons.faceOutlined,
              'reactions.mode.all',
            ),
            mode(
              ReactionsMode.some,
              AppIcons.selectChecksRounded,
              'reactions.mode.some',
            ),
            mode(
              ReactionsMode.off,
              AppIcons.blockRounded,
              'reactions.mode.off',
            ),
            if (_mode == ReactionsMode.some) ...[
              Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.md,
                  vertical: AppSpacing.sm,
                ),
                child: Text(
                  t.t('reactions.pickNote'),
                  style: type.caption.copyWith(color: colors.textSecondary),
                ),
              ),
              Wrap(
                alignment: WrapAlignment.center,
                spacing: AppSpacing.sm,
                runSpacing: AppSpacing.sm,
                children: [
                  for (final e in kReactionPalette)
                    ReactionEmojiButton(
                      key: ValueKey('reactions-allow-$e'),
                      emoji: e,
                      selected: _picked.contains(e),
                      label: e,
                      onTap: () => setState(() {
                        if (!_picked.remove(e)) _picked.add(e);
                      }),
                    ),
                ],
              ),
            ],
            const SizedBox(height: AppSpacing.md),
            AppButton(
              key: const ValueKey('reactions-done'),
              label: t.t('common.save'),
              height: AppSizes.touchTarget,
              isEnabled: _ready,
              disabledHint: t.t('reactions.pickOne'),
              onPressed: () {
                final out = (
                  mode: _mode,
                  allowed: _mode == ReactionsMode.some
                      ? reactionChoices(ReactionsMode.some, _picked.toList())
                      : const <String>[],
                );
                Navigator.of(context).pop(out);
              },
            ),
          ],
        ),
      ),
    );
  }
}
