import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/theme/app_color_tokens.dart';
import 'package:lawbid/core/design_system/theme/app_typography_tokens.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/text/bidi.dart';

/// Owner 2026-10-19: a field's «18/2200» sits INSIDE the field, in its
/// bottom right corner, small and grey, out of the text's way — never under
/// or beside the field. Every length-limited field in the app uses this.
///
/// Use: wrap the field in [InsideCounter], give the TextField
/// `buildCounter: noFieldCounter` (Flutter's own counter below the field
/// goes away) and leave [kInsideCounterRoom] free at the bottom of its
/// content padding so the last line never runs under the counter.
class InsideCounter extends StatelessWidget {
  const InsideCounter({
    required this.controller,
    required this.max,
    required this.child,
    this.showFrom = 0,
    this.end = 12,
    this.bottom = 6,
    super.key,
  });

  final TextEditingController controller;
  final int max;
  final Widget child;

  /// Shown only from this many characters (a chat shows it near the limit).
  final int showFrom;

  /// Distance from the field's end and bottom edges.
  final double end;
  final double bottom;

  @override
  Widget build(BuildContext context) => Stack(
        children: [
          child,
          PositionedDirectional(
            end: end,
            bottom: bottom,
            child: IgnorePointer(
              child: ExcludeSemantics(
                child: ListenableBuilder(
                  listenable: controller,
                  builder: (context, _) => FieldCounterText(
                    length: controller.text.characters.length,
                    max: max,
                    showFrom: showFrom,
                  ),
                ),
              ),
            ),
          ),
        ],
      );
}

/// The counter's text: small and grey, red at the limit.
class FieldCounterText extends StatelessWidget {
  const FieldCounterText({
    required this.length,
    required this.max,
    this.showFrom = 0,
    super.key,
  });

  final int length;
  final int max;
  final int showFrom;

  @override
  Widget build(BuildContext context) {
    if (length < showFrom) return const SizedBox.shrink();
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Text(
      // Keeps «18/2200» in order in right-to-left languages.
      ltrIsolate(context.digits('$length/$max')),
      style: type.caption.copyWith(
        fontSize: 11,
        height: 1,
        color: length >= max ? colors.danger : colors.textSecondary,
      ),
    );
  }
}

/// Room the counter takes at the bottom of a field's content.
const double kInsideCounterRoom = 14;

/// For `TextField.buildCounter`: no counter under the field (the
/// [InsideCounter] shows it inside).
Widget? noFieldCounter(
  BuildContext context, {
  required int currentLength,
  required bool isFocused,
  required int? maxLength,
}) =>
    null;
