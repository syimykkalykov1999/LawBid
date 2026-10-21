import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/legal_qa/domain/qa_models.dart';

/// Owner 2026-10-21: the four sections of «Вопрос юристу» as a compact
/// segment in the header, right of the back arrow: All · Mine · Best ·
/// Unanswered. [labels] are in [QaTab.values] order.
class QaTabsBar extends StatelessWidget {
  const QaTabsBar({
    required this.value,
    required this.labels,
    required this.onChanged,
    super.key,
  });

  final QaTab value;
  final List<String> labels;
  final ValueChanged<QaTab> onChanged;

  static const _height = 32.0;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Container(
      key: const ValueKey('qa-tabs'),
      height: _height,
      padding: const EdgeInsets.all(2),
      decoration: BoxDecoration(
        color: colors.chip,
        borderRadius: BorderRadius.circular(AppRadii.pill),
      ),
      child: Row(
        children: [
          for (final tab in QaTab.values)
            Expanded(
              child: Semantics(
                button: true,
                selected: tab == value,
                label: labels[tab.index],
                excludeSemantics: true,
                child: AppPressable(
                  onTap: () => onChanged(tab),
                  child: Container(
                    alignment: Alignment.center,
                    padding: const EdgeInsets.symmetric(horizontal: 2),
                    decoration: BoxDecoration(
                      color: tab == value ? colors.surface : null,
                      borderRadius: BorderRadius.circular(AppRadii.pill),
                      border:
                          tab == value ? Border.all(color: colors.gold) : null,
                    ),
                    child: Text(
                      labels[tab.index],
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: type.caption.copyWith(
                        color:
                            tab == value ? colors.text : colors.textSecondary,
                        fontWeight:
                            tab == value ? FontWeight.w700 : FontWeight.w500,
                      ),
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
