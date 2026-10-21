import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/design_system.dart';

/// One button of an [ActionGroup].
class GroupAction {
  const GroupAction({
    required this.keyName,
    required this.label,
    required this.onPressed,
    this.variant = AppButtonVariant.secondary,
    this.isLoading = false,
  });

  final String keyName;
  final String label;
  final VoidCallback? onPressed;
  final AppButtonVariant variant;
  final bool isLoading;
}

/// Owner 2026-10-20: buttons sit side by side in one row, not one per
/// full-width line. All of them go into a single row when every label fits
/// on one line; otherwise the row is split into pairs (a lone last button
/// takes the full width), so a label never wraps in a cramped cell.
class ActionGroup extends StatelessWidget {
  const ActionGroup({required this.actions, super.key});

  final List<GroupAction> actions;

  @override
  Widget build(BuildContext context) {
    if (actions.isEmpty) return const SizedBox.shrink();
    final style = Theme.of(context).extension<AppTypographyTokens>()!.button;
    final dir = Directionality.of(context);
    final scaler = MediaQuery.textScalerOf(context);
    return LayoutBuilder(
      builder: (context, box) {
        bool fits(int perRow) {
          final gaps = AppSpacing.sm * (perRow - 1);
          final cell = (box.maxWidth - gaps) / perRow - AppSpacing.md * 2;
          for (final a in actions) {
            final p = TextPainter(
              text: TextSpan(text: a.label, style: style),
              textDirection: dir,
              textScaler: scaler,
              maxLines: 1,
            )..layout();
            if (p.width > cell) return false;
          }
          return true;
        }

        var perRow = actions.length;
        while (perRow > 1 && !fits(perRow)) {
          perRow--;
        }
        final rows = <List<GroupAction>>[];
        for (var i = 0; i < actions.length; i += perRow) {
          rows.add(actions.sublist(i, (i + perRow).clamp(0, actions.length)));
        }
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (var r = 0; r < rows.length; r++) ...[
              if (r > 0) const SizedBox(height: AppSpacing.sm),
              Row(
                children: [
                  for (var c = 0; c < rows[r].length; c++) ...[
                    if (c > 0) const SizedBox(width: AppSpacing.sm),
                    Expanded(
                      child: AppButton(
                        key: ValueKey(rows[r][c].keyName),
                        label: rows[r][c].label,
                        variant: rows[r][c].variant,
                        isLoading: rows[r][c].isLoading,
                        onPressed: rows[r][c].onPressed,
                      ),
                    ),
                  ],
                ],
              ),
            ],
          ],
        );
      },
    );
  }
}
