import 'package:flutter/material.dart';

import 'package:lawbid/core/design_system/design_system.dart';

/// Checkbox row for the consents step (docs/01_FOUNDATION_AUTH.md §10.2 H).
/// The whole row toggles (≥ 44px tall, grows with text scale); [content]
/// may contain its own tappable links (e.g. [LegalText]) — those win their
/// own taps. Announced as a checkbox with [semanticLabel].
class ConsentCheckTile extends StatelessWidget {
  const ConsentCheckTile({
    required this.value,
    required this.onChanged,
    required this.semanticLabel,
    required this.content,
    super.key,
    this.showError = false,
  });

  final bool value;
  final ValueChanged<bool> onChanged;
  final String semanticLabel;
  final Widget content;

  /// Required-but-unchecked after a Continue attempt: danger border.
  final bool showError;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final duration = context.reduceMotion ? Duration.zero : AppMotion.stateChange;
    final borderColor = showError ? colors.danger : (value ? colors.gold : colors.border);

    return MergeSemantics(
      child: Semantics(
        checked: value,
        label: semanticLabel,
        child: InkWell(
          onTap: () => onChanged(!value),
          borderRadius: BorderRadius.circular(AppRadii.field),
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: AppSizes.touchTarget),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  AnimatedContainer(
                    duration: duration,
                    curve: AppMotion.enterCurve,
                    width: AppSizes.iconMd,
                    height: AppSizes.iconMd,
                    decoration: BoxDecoration(
                      color: value ? colors.gold : colors.surface,
                      borderRadius: BorderRadius.circular(AppRadii.proBadge),
                      border: Border.all(color: borderColor, width: 1.5),
                    ),
                    child: AnimatedOpacity(
                      duration: duration,
                      opacity: value ? 1 : 0,
                      child: Icon(Icons.check_rounded, size: AppSizes.iconSm, color: colors.navy),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.md),
                  Expanded(child: ExcludeSemantics(child: content)),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
