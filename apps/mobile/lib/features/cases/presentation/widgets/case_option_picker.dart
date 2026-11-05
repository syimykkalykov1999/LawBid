import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/design_system.dart';

/// One line of a [CaseOptionPicker]: the name and a short hint under it.
class CaseOption<T> {
  const CaseOption(this.value, this.title, this.hint);

  final T value;
  final String title;
  final String hint;
}

/// Owner 2026-11-05: how a payment is chosen, everywhere. A field with the
/// list open and nothing picked; a pick folds the list and the field shows it;
/// a tap on the field opens the list again.
class CaseOptionPicker<T> extends StatefulWidget {
  const CaseOptionPicker({
    required this.label,
    required this.value,
    required this.options,
    required this.onChanged,
    this.clearLabel,
    this.enabled = true,
    super.key,
  });

  final String label;
  final T? value;
  final List<CaseOption<T>> options;
  final ValueChanged<T?> onChanged;

  /// A first line that takes the choice back (an optional choice).
  final String? clearLabel;
  final bool enabled;

  @override
  State<CaseOptionPicker<T>> createState() => _CaseOptionPickerState<T>();
}

class _CaseOptionPickerState<T> extends State<CaseOptionPicker<T>> {
  late bool _open = widget.value == null;

  @override
  void didUpdateWidget(CaseOptionPicker<T> old) {
    super.didUpdateWidget(old);
    if (old.value != widget.value) _open = widget.value == null;
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final chosen = [
      for (final o in widget.options)
        if (o.value == widget.value) o,
    ];
    Widget line({
      required Key key,
      required String title,
      required VoidCallback onTap,
      String? hint,
    }) =>
        Semantics(
          button: true,
          label: hint == null ? title : '$title. $hint',
          excludeSemantics: true,
          child: InkWell(
            key: key,
            onTap: widget.enabled ? onTap : null,
            child: ConstrainedBox(
              constraints:
                  const BoxConstraints(minHeight: AppSizes.touchTarget),
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.md,
                  vertical: AppSpacing.sm,
                ),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: type.body.copyWith(
                        color: colors.text,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    if (hint != null)
                      Text(
                        hint,
                        style:
                            type.caption.copyWith(color: colors.textSecondary),
                      ),
                  ],
                ),
              ),
            ),
          ),
        );
    return AnimatedSize(
      duration: context.sizeChangeDuration,
      curve: AppMotion.enterCurve,
      alignment: AlignmentDirectional.topStart,
      child: Container(
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          color: colors.surface,
          borderRadius: BorderRadius.circular(AppRadii.field),
          border: Border.all(color: colors.border),
        ),
        child: Material(
          type: MaterialType.transparency,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              InkWell(
                key: const ValueKey('option-picker-field'),
                onTap: widget.enabled && chosen.isNotEmpty
                    ? () => setState(() => _open = !_open)
                    : null,
                child: ConstrainedBox(
                  constraints: const BoxConstraints(
                    minHeight: AppSizes.touchTarget,
                  ),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: AppSpacing.md,
                      vertical: AppSpacing.sm,
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                widget.label,
                                style: type.caption.copyWith(
                                  color: colors.textSecondary,
                                ),
                              ),
                              if (chosen.isNotEmpty)
                                Text(
                                  chosen.first.title,
                                  style: type.body.copyWith(
                                    color: colors.text,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                            ],
                          ),
                        ),
                        if (chosen.isNotEmpty)
                          RotatedBox(
                            quarterTurns: _open ? 2 : 0,
                            child: AppIcon(
                              AppIcons.expandMoreRounded,
                              color: colors.textSecondary,
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              ),
              if (_open) ...[
                Divider(height: 1, thickness: 1, color: colors.border),
                if (widget.clearLabel != null && chosen.isNotEmpty)
                  line(
                    key: const ValueKey('option-picker-clear'),
                    title: widget.clearLabel!,
                    onTap: () => widget.onChanged(null),
                  ),
                for (final o in widget.options)
                  line(
                    key: ValueKey('option-picker-${o.value}'),
                    title: o.title,
                    hint: o.hint,
                    onTap: () {
                      setState(() => _open = false);
                      widget.onChanged(o.value);
                    },
                  ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
