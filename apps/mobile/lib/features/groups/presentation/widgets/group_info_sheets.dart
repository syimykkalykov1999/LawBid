import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';

/// One option of [showGroupChoiceSheet].
class GroupChoice<T> {
  const GroupChoice({
    required this.value,
    required this.label,
    this.subtitle,
    this.icon,
    this.destructive = false,
  });

  final T value;
  final bool destructive;
  final String label;
  final String? subtitle;
  final IconData? icon;
}

/// A small «pick one» sheet; the current value shows the gold check.
/// Returns the picked value, or null when dismissed.
Future<T?> showGroupChoiceSheet<T>(
  BuildContext context, {
  required String title,
  required List<GroupChoice<T>> choices,
  T? current,
}) =>
    showAppBottomSheet<T>(
      context: context,
      isScrollControlled: true,
      builder: (sheet) => _ChoiceSheet<T>(
        title: title,
        choices: choices,
        current: current,
      ),
    );

class _ChoiceSheet<T> extends StatelessWidget {
  const _ChoiceSheet({
    required this.title,
    required this.choices,
    required this.current,
  });

  final String title;
  final List<GroupChoice<T>> choices;
  final T? current;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return SafeArea(
      top: false,
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.screenSide,
          AppSpacing.md,
          AppSpacing.screenSide,
          AppSpacing.lg,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Center(child: AppSheetHandle()),
            Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.md,
                vertical: AppSpacing.sm,
              ),
              child: Text(
                title,
                style: type.titleMedium.copyWith(color: colors.text),
              ),
            ),
            for (final c in choices) ...[
              AppListRow(
                icon: c.icon,
                label: c.label,
                subtitle: c.subtitle,
                destructive: c.destructive,
                selected: c.value == current,
                showChevron: false,
                onTap: () => Navigator.of(context).pop(c.value),
              ),
              const SizedBox(height: AppSpacing.xs),
            ],
          ],
        ),
      ),
    );
  }
}

/// A one-field editor sheet (title, description, @username). [submit] runs
/// the request and returns an error text to show under the field, or null
/// when it worked (the sheet then closes and returns true).
Future<bool> showGroupTextSheet(
  BuildContext context, {
  required String title,
  required String initial,
  required int maxLength,
  required Future<String?> Function(String value) submit,
  int maxLines = 1,
  bool allowEmpty = false,
  String? hint,
  String? helper,
  String? Function(String value)? validate,
  List<TextInputFormatter>? formatters,
  String? prefix,
}) async {
  final done = await showAppBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    builder: (sheet) => _TextSheet(
      title: title,
      initial: initial,
      maxLength: maxLength,
      maxLines: maxLines,
      allowEmpty: allowEmpty,
      hint: hint,
      helper: helper,
      validate: validate,
      formatters: formatters,
      prefix: prefix,
      submit: submit,
    ),
  );
  return done ?? false;
}

class _TextSheet extends ConsumerStatefulWidget {
  const _TextSheet({
    required this.title,
    required this.initial,
    required this.maxLength,
    required this.maxLines,
    required this.allowEmpty,
    required this.submit,
    this.hint,
    this.helper,
    this.validate,
    this.formatters,
    this.prefix,
  });

  final String title;
  final String initial;
  final int maxLength;
  final int maxLines;
  final bool allowEmpty;
  final String? hint;
  final String? helper;
  final String? Function(String value)? validate;
  final List<TextInputFormatter>? formatters;
  final String? prefix;
  final Future<String?> Function(String value) submit;

  @override
  ConsumerState<_TextSheet> createState() => _TextSheetState();
}

class _TextSheetState extends ConsumerState<_TextSheet> {
  late final TextEditingController _c =
      TextEditingController(text: widget.initial);
  String? _error;
  bool _busy = false;

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final t = ref.read(translatorProvider);
    final value = _c.text.trim();
    if (value.isEmpty && !widget.allowEmpty) {
      setState(() => _error = t.t('group.info.fieldRequired'));
      return;
    }
    final invalid = widget.validate?.call(value);
    if (invalid != null) {
      setState(() => _error = invalid);
      return;
    }
    if (value == widget.initial.trim()) {
      Navigator.of(context).pop(false);
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    final error = await widget.submit(value);
    if (!mounted) return;
    if (error == null) {
      Navigator.of(context).pop(true);
    } else {
      setState(() {
        _busy = false;
        _error = error;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return AnimatedPadding(
      duration: Duration.zero,
      padding: EdgeInsets.only(
        bottom: MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: SafeArea(
        top: false,
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.screenSide,
            AppSpacing.md,
            AppSpacing.screenSide,
            AppSpacing.lg,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Center(child: AppSheetHandle()),
              Padding(
                padding: const EdgeInsets.only(
                  top: AppSpacing.sm,
                  bottom: AppSpacing.md,
                ),
                child: Text(
                  widget.title,
                  style: type.titleMedium.copyWith(color: colors.text),
                ),
              ),
              AppTextField(
                controller: _c,
                autofocus: true,
                enabled: !_busy,
                hintText: widget.hint,
                helperText: widget.helper,
                errorText: _error,
                maxLength: widget.maxLength,
                maxLines: widget.maxLines,
                minHeight: widget.maxLines > 1 ? 96 : 44,
                inputFormatters: widget.formatters,
                semanticLabel: widget.title,
                leading: widget.prefix == null
                    ? null
                    : Text(
                        widget.prefix!,
                        style: type.body.copyWith(color: colors.textSecondary),
                      ),
                textInputAction: widget.maxLines > 1
                    ? TextInputAction.newline
                    : TextInputAction.done,
                onChanged: (_) {
                  if (_error != null) setState(() => _error = null);
                },
                onSubmitted: widget.maxLines > 1 ? null : (_) => _save(),
              ),
              const SizedBox(height: AppSpacing.lg),
              AppButton(
                label: t.t('common.save'),
                height: AppSizes.touchTarget,
                isLoading: _busy,
                onPressed: _busy ? null : _save,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// A yes / no confirmation dialog; [destructive] paints the confirm button
/// as a danger action. Returns true when confirmed.
Future<bool> confirmGroupAction(
  BuildContext context, {
  required String title,
  required String message,
  required String confirmLabel,
  required String cancelLabel,
  bool destructive = false,
}) async {
  final ok = await showDialog<bool>(
    context: context,
    builder: (dialog) => AppAlertDialog(
      title: Text(title),
      content: Text(message),
      actions: [
        AppButton(
          label: confirmLabel,
          height: AppSizes.touchTarget,
          variant:
              destructive ? AppButtonVariant.danger : AppButtonVariant.primary,
          onPressed: () => Navigator.of(dialog).pop(true),
        ),
        AppButton(
          label: cancelLabel,
          height: AppSizes.touchTarget,
          variant: AppButtonVariant.secondary,
          onPressed: () => Navigator.of(dialog).pop(false),
        ),
      ],
    ),
  );
  return ok ?? false;
}
