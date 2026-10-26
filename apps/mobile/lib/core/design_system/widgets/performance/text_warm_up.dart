import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/design_system.dart';

/// Lays out the app's text styles and one text field once, off screen, right
/// after the first frame. The first use of a font, a text field or a script
/// costs tens of milliseconds (glyph and line-break caches); paying it here
/// keeps the first open of Search, a sheet or a profile under the frame
/// budget. Removed after two frames.
class TextWarmUp extends StatefulWidget {
  const TextWarmUp({required this.child, super.key});

  final Widget child;

  @override
  State<TextWarmUp> createState() => _TextWarmUpState();
}

class _TextWarmUpState extends State<TextWarmUp> {
  int _step = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _next());
  }

  void _next() {
    if (!mounted || _step >= 2) return;
    // Wait for the first screen to settle, then build once, then drop.
    Future<void>.delayed(
      Duration(milliseconds: _step == 0 ? 1500 : 300),
      () {
        if (!mounted) return;
        setState(() => _step++);
        WidgetsBinding.instance.addPostFrameCallback((_) => _next());
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    // Always the same shape: the app subtree must never be re-parented.
    return Stack(
      textDirection: TextDirection.ltr,
      fit: StackFit.passthrough,
      clipBehavior: Clip.none,
      children: [
        widget.child,
        if (_step == 1) _sample(context) else const SizedBox.shrink(),
      ],
    );
  }

  Widget _sample(BuildContext context) {
    final type = Theme.of(context).extension<AppTypographyTokens>();
    if (type == null) return const SizedBox.shrink();
    const sample = 'Attorney Адвокат @username #topic 123 Иммиграция ещё';
    final styles = [
      type.body,
      type.bodySmall,
      type.caption,
      type.titleMedium,
      type.button,
      type.body.copyWith(fontWeight: FontWeight.w600),
      type.body.copyWith(fontWeight: FontWeight.w700),
    ];
    return Positioned(
      left: 0,
      top: 0,
      child: Offstage(
        child: SizedBox(
          width: 320,
          child: Material(
            type: MaterialType.transparency,
            child: Column(
              children: [
                for (final s in styles) Text(sample, style: s),
                const TextField(),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
