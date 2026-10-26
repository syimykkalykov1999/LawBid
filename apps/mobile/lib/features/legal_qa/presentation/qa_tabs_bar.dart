import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/legal_qa/domain/qa_models.dart';

/// Owner 2026-10-21: the four sections of «Вопрос юристу» as a compact
/// segment in the header, right of the back arrow: All · Mine · Best ·
/// Unanswered. [labels] are in [QaTab.values] order. Each tab is as wide
/// as its label needs; when the four do not fit (long languages at
/// 360 dp) the labels shrink instead of being cut.
///
/// Owner 2026-10-22: the client's tabs looked cramped next to the attorney's.
/// The bar owns its whole placement (the screen just hands it over as the
/// header title, for every role alike): centred in the header, up to
/// [maxWidth] wide, the four tabs EQUAL when every label fits its share, and
/// only sized by label when one is longer (long languages).
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

  /// The widest the segment grows on a big screen.
  static const maxWidth = 340.0;
  static const _height = 32.0;
  static const _padding = 8.0;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final bold = type.caption.copyWith(fontWeight: FontWeight.w700);
    final scaler = MediaQuery.textScalerOf(context);
    final direction = Directionality.of(context);
    int flex(String label) {
      final painter = TextPainter(
        text: TextSpan(text: label, style: bold),
        textDirection: direction,
        textScaler: scaler,
        maxLines: 1,
      )..layout();
      final width = painter.width + _padding * 2;
      painter.dispose();
      return width.ceil();
    }

    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: maxWidth),
        child: LayoutBuilder(
          builder: (context, box) {
            final widths = [for (final l in labels) flex(l)];
            // Inside the 2 dp frame, every tab gets a quarter of the room.
            final share = (box.maxWidth - 4) / QaTab.values.length;
            final equal = widths.every((w) => w <= share);
            return _segment(
              colors,
              type,
              equal ? const [1, 1, 1, 1] : widths,
            );
          },
        ),
      ),
    );
  }

  Widget _segment(
    AppColorTokens colors,
    AppTypographyTokens type,
    List<int> flexes,
  ) {
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
              flex: flexes[tab.index],
              child: Semantics(
                button: true,
                selected: tab == value,
                label: labels[tab.index],
                excludeSemantics: true,
                child: AppPressable(
                  onTap: () => onChanged(tab),
                  child: Container(
                    alignment: Alignment.center,
                    padding: const EdgeInsets.symmetric(horizontal: _padding),
                    decoration: BoxDecoration(
                      color: tab == value ? colors.surface : null,
                      borderRadius: BorderRadius.circular(AppRadii.pill),
                      border:
                          tab == value ? Border.all(color: colors.gold) : null,
                    ),
                    child: FittedBox(
                      fit: BoxFit.scaleDown,
                      child: Text(
                        labels[tab.index],
                        maxLines: 1,
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
            ),
        ],
      ),
    );
  }
}
