import 'package:flutter/material.dart';

import '../../theme/app_color_tokens.dart';
import '../../theme/app_typography_tokens.dart';
import '../../tokens/app_radii.dart';

const int _kOtpLength = 6;

/// 6-digit OTP input (file 07 §4 "AppOtpField"): 6 cells, 8px gap, 54px
/// height, radius 12, digit Source Serif 4 600 22, focused cell gold 1.5
/// border (+ [AppColorTokens.focusRingGlow] in light theme — see
/// AppTextField's a11y doc comment, same WCAG 1.4.11 mitigation applies here).
class AppOtpField extends StatefulWidget {
  const AppOtpField({
    super.key,
    required this.onCompleted,
    this.onChanged,
    this.errorText,
    this.autofocus = true,
  });

  final ValueChanged<String> onCompleted;
  final ValueChanged<String>? onChanged;
  final String? errorText;
  final bool autofocus;

  @override
  State<AppOtpField> createState() => _AppOtpFieldState();
}

class _AppOtpFieldState extends State<AppOtpField> {
  late final List<TextEditingController> _controllers =
      List.generate(_kOtpLength, (_) => TextEditingController());
  late final List<FocusNode> _focusNodes = List.generate(_kOtpLength, (_) => FocusNode());
  int _focusedIndex = -1;

  @override
  void initState() {
    super.initState();
    for (var i = 0; i < _kOtpLength; i++) {
      _focusNodes[i].addListener(() {
        if (_focusNodes[i].hasFocus) setState(() => _focusedIndex = i);
      });
    }
  }

  @override
  void dispose() {
    for (final c in _controllers) {
      c.dispose();
    }
    for (final f in _focusNodes) {
      f.dispose();
    }
    super.dispose();
  }

  String get _code => _controllers.map((c) => c.text).join();

  void _handleChanged(int index, String value) {
    if (value.length > 1) {
      // Handles SMS autofill / paste dropping the whole code into one cell.
      final digits = value.replaceAll(RegExp(r'\D'), '');
      for (var i = 0; i < _kOtpLength; i++) {
        _controllers[i].text = i < digits.length ? digits[i] : '';
      }
      final lastIndex = (digits.length - 1).clamp(0, _kOtpLength - 1);
      _focusNodes[lastIndex].requestFocus();
    } else if (value.isNotEmpty) {
      if (index < _kOtpLength - 1) _focusNodes[index + 1].requestFocus();
    }
    widget.onChanged?.call(_code);
    if (_code.length == _kOtpLength) widget.onCompleted(_code);
  }

  void _handleBackspace(int index) {
    if (_controllers[index].text.isEmpty && index > 0) {
      _focusNodes[index - 1].requestFocus();
      _controllers[index - 1].clear();
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final hasError = widget.errorText != null && widget.errorText!.isNotEmpty;

    return Semantics(
      label: 'Код подтверждения',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: List.generate(_kOtpLength, (index) {
              final isFocused = _focusedIndex == index;
              final borderColor =
                  hasError ? colors.danger : (isFocused ? colors.gold : colors.border);
              return Expanded(
                child: Padding(
                  padding: EdgeInsets.only(right: index == _kOtpLength - 1 ? 0 : 8),
                  child: KeyboardListener(
                    focusNode: FocusNode(skipTraversal: true),
                    onKeyEvent: (event) {
                      if (event is KeyDownEvent &&
                          event.logicalKey == LogicalKeyboardKey.backspace) {
                        _handleBackspace(index);
                      }
                    },
                    child: Container(
                      height: 54,
                      constraints: const BoxConstraints(minHeight: 54),
                      decoration: BoxDecoration(
                        color: colors.surface,
                        borderRadius: BorderRadius.circular(AppRadii.otpCell),
                        border: Border.all(
                          color: borderColor,
                          width: isFocused || hasError ? 1.5 : 1.0,
                        ),
                        boxShadow: isFocused && !hasError
                            ? [BoxShadow(color: colors.focusRingGlow, blurRadius: 4, spreadRadius: 1)]
                            : null,
                      ),
                      alignment: Alignment.center,
                      child: TextField(
                        controller: _controllers[index],
                        focusNode: _focusNodes[index],
                        autofocus: widget.autofocus && index == 0,
                        textAlign: TextAlign.center,
                        keyboardType: TextInputType.number,
                        maxLength: _kOtpLength, // allows autofill to drop the whole code
                        inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                        style: typography.otpDigit.copyWith(color: colors.text),
                        decoration: const InputDecoration(
                          counterText: '',
                          border: InputBorder.none,
                        ),
                        onChanged: (v) => _handleChanged(index, v),
                      ),
                    ),
                  ),
                ),
              );
            }),
          ),
          if (hasError) ...[
            const SizedBox(height: 4),
            Text(widget.errorText!, style: typography.caption.copyWith(color: colors.danger)),
          ],
        ],
      ),
    );
  }
}
