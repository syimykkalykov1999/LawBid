import 'package:flutter/material.dart';

import '../../theme/app_color_tokens.dart';
import '../../theme/app_typography_tokens.dart';
import '../../tokens/app_radii.dart';
import '../../tokens/app_spacing.dart';

/// General-purpose text field (file 07 §4 "AppTextField"): height 52, radius
/// 12, `surface` fill, 1px `border`, focused border `gold` 1.5px, text 16.
/// [leading] hosts the country-code chip on the phone screen (file 07 §6.2)
/// but is optional/generic so other screens can reuse this widget.
///
/// A11y note (docs/CHANGELOG.md stage 1.5): in light theme, a bare 1.5px gold
/// focus border alone fails WCAG 2.2 SC 1.4.11 non-text contrast (2.40:1 vs
/// the 3:1 minimum). Without changing the approved gold border, a soft gold
/// glow (`AppColorTokens.focusRingGlow`) is added as a second, non-color
/// visual cue when focused. No-op in dark theme (border already 7.51:1).
class AppTextField extends StatefulWidget {
  const AppTextField({
    super.key,
    this.controller,
    this.leading,
    this.hintText,
    this.errorText,
    this.keyboardType,
    this.inputFormatters,
    this.onChanged,
    this.autofocus = false,
    this.semanticLabel,
  });

  final TextEditingController? controller;
  final Widget? leading;
  final String? hintText;
  final String? errorText;
  final TextInputType? keyboardType;
  final List<TextInputFormatter>? inputFormatters;
  final ValueChanged<String>? onChanged;
  final bool autofocus;
  final String? semanticLabel;

  @override
  State<AppTextField> createState() => _AppTextFieldState();
}

class _AppTextFieldState extends State<AppTextField> {
  final _focusNode = FocusNode();
  bool _focused = false;

  @override
  void initState() {
    super.initState();
    _focusNode.addListener(() => setState(() => _focused = _focusNode.hasFocus));
  }

  @override
  void dispose() {
    _focusNode.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final hasError = widget.errorText != null && widget.errorText!.isNotEmpty;

    final borderColor = hasError ? colors.danger : (_focused ? colors.gold : colors.border);
    final borderWidth = _focused || hasError ? 1.5 : 1.0;

    return Semantics(
      textField: true,
      label: widget.semanticLabel,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            constraints: const BoxConstraints(minHeight: 52),
            decoration: BoxDecoration(
              color: colors.surface,
              borderRadius: BorderRadius.circular(AppRadii.field),
              border: Border.all(color: borderColor, width: borderWidth),
              boxShadow: _focused && !hasError
                  ? [
                      BoxShadow(
                        color: colors.focusRingGlow,
                        blurRadius: 4,
                        spreadRadius: 1,
                      ),
                    ]
                  : null,
            ),
            child: Row(
              children: [
                if (widget.leading != null) ...[
                  const SizedBox(width: AppSpacing.md),
                  widget.leading!,
                  const SizedBox(width: 6),
                ] else
                  const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: TextField(
                    controller: widget.controller,
                    focusNode: _focusNode,
                    autofocus: widget.autofocus,
                    keyboardType: widget.keyboardType,
                    inputFormatters: widget.inputFormatters,
                    onChanged: widget.onChanged,
                    cursorColor: colors.gold,
                    cursorWidth: 1.5,
                    style: const TextStyle(fontSize: 16).copyWith(color: colors.text),
                    decoration: InputDecoration(
                      hintText: widget.hintText,
                      hintStyle: typography.body.copyWith(color: colors.textSecondary),
                      border: InputBorder.none,
                      isDense: true,
                      contentPadding: const EdgeInsets.symmetric(vertical: AppSpacing.md),
                    ),
                  ),
                ),
                const SizedBox(width: AppSpacing.md),
              ],
            ),
          ),
          if (hasError) ...[
            const SizedBox(height: AppSpacing.xs),
            Text(widget.errorText!, style: typography.caption.copyWith(color: colors.danger)),
          ],
        ],
      ),
    );
  }
}
