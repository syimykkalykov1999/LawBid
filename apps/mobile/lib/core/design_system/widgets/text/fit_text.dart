import 'package:flutter/material.dart';

/// One line of text that shrinks its font to fit the width it gets instead
/// of wrapping or overflowing (owner 2026-10-05: in long languages buttons
/// keep their place and size; the label gets smaller, nothing moves).
/// Never grows past [style]'s size.
class FitText extends StatelessWidget {
  const FitText(
    this.text, {
    super.key,
    this.style,
    this.textAlign,
    this.alignment = AlignmentDirectional.center,
  });

  final String text;
  final TextStyle? style;
  final TextAlign? textAlign;
  final AlignmentGeometry alignment;

  @override
  Widget build(BuildContext context) => FittedBox(
        fit: BoxFit.scaleDown,
        alignment: alignment,
        child: Text(text, maxLines: 1, style: style, textAlign: textAlign),
      );
}
