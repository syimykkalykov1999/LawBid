import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../theme/app_color_tokens.dart';
import '../../theme/app_typography_tokens.dart';
import '../../tokens/app_radii.dart';

const int _kOtpLength = 6;

/// 6-digit OTP input (file 07 §4 "AppOtpField"): 6 cells, 8px gap, 54px
/// height, radius 12, digit Source Serif 4 600 22, focused cell gold 1.5
/// border (+ [AppColorTokens.focusRingGlow] in light theme — see
/// AppTextField's a11y doc comment, same WCAG 1.4.11 mitigation applies here).
///
/// RESTRUCTURED for stage 1.7 (docs/CHANGELOG.md): the stage-1.5 version of
/// this widget used 6 independent `TextField`s, one per cell. The stage-1.7
/// accessibility review (ecc:a11y-architect) flagged two real problems with
/// that shape: (1) a screen reader walks it as 6 separate, individually
/// focusable text fields instead of one "код подтверждения" field, which is
/// confusing to navigate; (2) `AutofillHints.oneTimeCode` (SMS autofill)
/// needs ONE real text input to attach to — 6 competing autofill targets do
/// not reliably receive the OS's "use code from SMS" suggestion.
///
/// Fixed by backing this widget with exactly ONE real (but invisible)
/// `TextField` that owns focus, keyboard input, and autofill; the 6 boxes
/// are now a purely presentational, `IgnorePointer`-wrapped overlay that
/// reads the same controller and repaints as it changes. Tapping anywhere
/// on the row hits the real field underneath (an `Opacity`-0 widget stays
/// hit-testable in Flutter — this is not a hack, it's the standard way to
/// build an invisible-but-tappable input). Public API is unchanged
/// (`onCompleted`/`onChanged`/`errorText`/`autofocus`), so no call site
/// needs to change for this restructuring.
class AppOtpField extends StatefulWidget {
  const AppOtpField({
    super.key,
    required this.onCompleted,
    this.onChanged,
    this.errorText,
    this.autofocus = true,
    this.controller,
    this.semanticLabel,
  });

  final ValueChanged<String> onCompleted;
  final ValueChanged<String>? onChanged;
  final String? errorText;
  final bool autofocus;

  /// Optional external controller (p12 leaf-1.4): lets the OTP screen show
  /// a code that arrived by itself (Android SMS Retriever, email magic
  /// link). Setting its text does NOT fire [onChanged]/[onCompleted] — the
  /// caller already knows the code. Owned by the caller when provided.
  final TextEditingController? controller;
  /// Screen-reader label for the whole code field — callers pass
  /// `t('...')` (docs/01 §9: no hardcoded UI strings). The Russian default
  /// only keeps pre-existing call sites working unchanged.
  final String? semanticLabel;

  @override
  State<AppOtpField> createState() => _AppOtpFieldState();
}

class _AppOtpFieldState extends State<AppOtpField> {
  TextEditingController? _ownController;
  final _focusNode = FocusNode();
  bool _completedFired = false;

  TextEditingController get _controller =>
      widget.controller ?? (_ownController ??= TextEditingController());

  @override
  void dispose() {
    _ownController?.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  void _handleChanged(String value) {
    widget.onChanged?.call(value);
    if (value.length == _kOtpLength) {
      if (!_completedFired) {
        _completedFired = true;
        widget.onCompleted(value);
      }
    } else {
      _completedFired = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final hasError = widget.errorText != null && widget.errorText!.isNotEmpty;

    return AnimatedBuilder(
      animation: Listenable.merge([_controller, _focusNode]),
      builder: (context, _) {
        final text = _controller.text;
        final caretIndex = text.length.clamp(0, _kOtpLength - 1);

        return Semantics(
          textField: true,
          label: widget.semanticLabel ?? 'Код подтверждения',
          value: text,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SizedBox(
                height: 54,
                child: Stack(
                  children: [
                    // The one real input: invisible (opacity 0, which stays
                    // hit-testable in Flutter), owns focus/keyboard/autofill.
                    ExcludeSemantics(
                      child: Opacity(
                        opacity: 0,
                        child: TextField(
                          controller: _controller,
                          focusNode: _focusNode,
                          autofocus: widget.autofocus,
                          textAlign: TextAlign.center,
                          keyboardType: TextInputType.number,
                          maxLength: _kOtpLength,
                          autofillHints: const [AutofillHints.oneTimeCode],
                          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                          cursorWidth: 0,
                          decoration: const InputDecoration(
                            counterText: '',
                            border: InputBorder.none,
                          ),
                          onChanged: _handleChanged,
                        ),
                      ),
                    ),
                    // Presentational overlay: 6 boxes, taps pass through to
                    // the real field above via IgnorePointer.
                    IgnorePointer(
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: List.generate(_kOtpLength, (index) {
                          final isFocused = _focusNode.hasFocus && index == caretIndex;
                          final borderColor =
                              hasError ? colors.danger : (isFocused ? colors.gold : colors.border);
                          final digit = index < text.length ? text[index] : '';
                          return Expanded(
                            child: Padding(
                              padding: EdgeInsets.only(right: index == _kOtpLength - 1 ? 0 : 8),
                              child: Container(
                                height: 54,
                                decoration: BoxDecoration(
                                  color: colors.surface,
                                  borderRadius: BorderRadius.circular(AppRadii.otpCell),
                                  border: Border.all(
                                    color: borderColor,
                                    width: isFocused || hasError ? 1.5 : 1.0,
                                  ),
                                  boxShadow: isFocused && !hasError
                                      ? [
                                          BoxShadow(
                                            color: colors.focusRingGlow,
                                            blurRadius: 4,
                                            spreadRadius: 1,
                                          ),
                                        ]
                                      : null,
                                ),
                                alignment: Alignment.center,
                                child: Text(
                                  digit,
                                  style: typography.otpDigit.copyWith(color: colors.text),
                                ),
                              ),
                            ),
                          );
                        }),
                      ),
                    ),
                  ],
                ),
              ),
              if (hasError) ...[
                const SizedBox(height: 4),
                Text(widget.errorText!, style: typography.caption.copyWith(color: colors.danger)),
              ],
            ],
          ),
        );
      },
    );
  }
}
