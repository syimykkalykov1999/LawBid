import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/text/bidi.dart';

/// Owner 2026-10-18 («как в инсте»): free @usernames under the username
/// field; a tap puts one in the field.
class UsernameSuggestions extends ConsumerWidget {
  const UsernameSuggestions({
    required this.suggestions,
    required this.onPick,
    super.key,
  });

  final List<String> suggestions;
  final ValueChanged<String> onPick;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (suggestions.isEmpty) return const SizedBox.shrink();
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.sm),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            t.t('profile.username.suggestions'),
            style: type.caption.copyWith(color: colors.textSecondary),
          ),
          const SizedBox(height: AppSpacing.xs),
          Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.sm,
            children: [
              for (final s in suggestions)
                Semantics(
                  button: true,
                  label: atHandle(s),
                  child: AppPressable(
                    key: ValueKey('username-suggestion-$s'),
                    onTap: () => onPick(s),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: AppSpacing.md,
                        vertical: AppSpacing.xs + 2,
                      ),
                      decoration: BoxDecoration(
                        color: colors.chip,
                        borderRadius: BorderRadius.circular(AppRadii.pill),
                        border: Border.all(color: colors.border),
                      ),
                      child: Text(
                        atHandle(s),
                        style: type.bodySmall.copyWith(color: colors.text),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}
