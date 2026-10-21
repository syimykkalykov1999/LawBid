import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show FilteringTextInputFormatter;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/design_system/widgets/pickers/app_pickers.dart'
    show showAppDatePicker;
import 'package:lawbid/core/files/upload_limits.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_header.dart'
    show ActionSheetItem, showActionSheet;
import 'package:lawbid/features/cases/tools/billing_logic.dart';
import 'package:lawbid/features/cases/workspace/workspace_data.dart'
    show PickedCaseFile;

/// What the time sheet returns.
class TimeInput {
  const TimeInput({
    required this.day,
    required this.minutes,
    required this.note,
  });

  final DateTime day;
  final int minutes;
  final String note;
}

/// What the expense sheet returns.
class ExpenseInput {
  const ExpenseInput({
    required this.day,
    required this.description,
    required this.cents,
    this.receipt,
  });

  final DateTime day;
  final String description;
  final int cents;
  final PickedCaseFile? receipt;
}

/// Frame of every sheet of this tab: handle, title, keyboard-safe scroll.
class _Frame extends StatelessWidget {
  const _Frame({required this.title, required this.children});

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return SafeArea(
      child: SingleChildScrollView(
        padding: EdgeInsetsDirectional.fromSTEB(
          AppSpacing.screenSide,
          AppSpacing.md,
          AppSpacing.screenSide,
          AppSpacing.lg + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const AppSheetHandle(),
            Text(title, style: type.titleMedium),
            const SizedBox(height: AppSpacing.lg),
            ...children,
          ],
        ),
      ),
    );
  }
}

/// A tappable date field: the label above, the chosen day inside.
class _DateField extends StatelessWidget {
  const _DateField({
    required this.label,
    required this.value,
    required this.onChanged,
    required this.formats,
  });

  final String label;
  final DateTime value;
  final ValueChanged<DateTime> onChanged;
  final L10nFormats formats;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final text = formats.date(value);
    return Semantics(
      button: true,
      label: '$label, $text',
      excludeSemantics: true,
      child: AppPressable(
        onTap: () async {
          final d = await showAppDatePicker(
            context: context,
            initialDate: value,
            firstDate: DateTime(2020),
            lastDate: DateTime.now().add(const Duration(days: 1)),
          );
          if (d != null && context.mounted) onChanged(d);
        },
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: AppSizes.hitTarget),
          child: Container(
            padding: const EdgeInsetsDirectional.symmetric(
              horizontal: AppSpacing.md,
              vertical: AppSpacing.sm,
            ),
            decoration: BoxDecoration(
              color: colors.surface,
              borderRadius: BorderRadius.circular(AppRadii.field),
              border: Border.all(color: colors.border),
            ),
            child: Row(
              children: [
                const AppIcon(AppIcons.eventOutlined, size: AppSizes.iconSm),
                const SizedBox(width: AppSpacing.sm),
                Expanded(child: Text(text, style: type.body)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

DateTime _today() {
  final n = DateTime.now();
  return DateTime(n.year, n.month, n.day);
}

/// The hourly rate, in the case's currency.
Future<int?> showRateSheet(
  BuildContext context, {
  required int? currentCents,
  required String currency,
}) =>
    showAppBottomSheet<int>(
      context: context,
      isScrollControlled: true,
      builder: (_) =>
          _RateSheet(currentCents: currentCents, currency: currency),
    );

class _RateSheet extends ConsumerStatefulWidget {
  const _RateSheet({required this.currentCents, required this.currency});

  final int? currentCents;
  final String currency;

  @override
  ConsumerState<_RateSheet> createState() => _RateSheetState();
}

class _RateSheetState extends ConsumerState<_RateSheet> {
  late final _c = TextEditingController(
    text:
        widget.currentCents == null ? '' : centsInputText(widget.currentCents!),
  );
  bool _bad = false;

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  void _save() {
    final cents = parseMoneyCents(_c.text);
    if (cents == null || cents > 10000000) {
      setState(() => _bad = true);
      return;
    }
    Navigator.of(context).pop(cents);
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    return _Frame(
      title: t.t('billing.rate.title'),
      children: [
        AppTextField(
          controller: _c,
          label: '${t.t('billing.rate')}, ${widget.currency}',
          autofocus: true,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          errorText: _bad ? t.t('billing.invalid') : null,
          onChanged: (_) {
            if (_bad) setState(() => _bad = false);
          },
          onSubmitted: (_) => _save(),
        ),
        const SizedBox(height: AppSpacing.lg),
        AppButton(label: t.t('billing.save'), onPressed: _save),
      ],
    );
  }
}

/// A time entry: new (all null) or edited.
Future<TimeInput?> showTimeSheet(
  BuildContext context, {
  DateTime? day,
  int? minutes,
  String note = '',
}) =>
    showAppBottomSheet<TimeInput>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _TimeSheet(day: day, minutes: minutes, note: note),
    );

class _TimeSheet extends ConsumerStatefulWidget {
  const _TimeSheet({this.day, this.minutes, this.note = ''});

  final DateTime? day;
  final int? minutes;
  final String note;

  @override
  ConsumerState<_TimeSheet> createState() => _TimeSheetState();
}

class _TimeSheetState extends ConsumerState<_TimeSheet> {
  late DateTime _day = widget.day ?? _today();
  late final _h = TextEditingController(
    text:
        widget.minutes == null ? '' : '${splitMinutes(widget.minutes!).hours}',
  );
  late final _m = TextEditingController(
    text: widget.minutes == null
        ? ''
        : '${splitMinutes(widget.minutes!).minutes}',
  );
  late final _note = TextEditingController(text: widget.note);
  bool _bad = false;

  @override
  void dispose() {
    _h.dispose();
    _m.dispose();
    _note.dispose();
    super.dispose();
  }

  void _save() {
    final minutes = parseDurationMinutes(_h.text, _m.text);
    if (minutes == null) {
      setState(() => _bad = true);
      return;
    }
    Navigator.of(context).pop(
      TimeInput(day: _day, minutes: minutes, note: _note.text.trim()),
    );
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final formats = ref.watch(l10nFormatsProvider);
    final digits = [FilteringTextInputFormatter.digitsOnly];
    return _Frame(
      title: t.t(
        widget.minutes == null
            ? 'billing.addTime.title'
            : 'billing.editTime.title',
      ),
      children: [
        _DateField(
          label: t.t('billing.date'),
          value: _day,
          onChanged: (d) => setState(() => _day = d),
          formats: formats,
        ),
        const SizedBox(height: AppSpacing.md),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: AppTextField(
                controller: _h,
                label: t.t('billing.hours'),
                keyboardType: TextInputType.number,
                inputFormatters: digits,
                errorText: _bad ? t.t('billing.invalid') : null,
              ),
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: AppTextField(
                controller: _m,
                label: t.t('billing.min'),
                keyboardType: TextInputType.number,
                inputFormatters: digits,
              ),
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.md),
        AppTextField(
          controller: _note,
          label: t.t('billing.note'),
          maxLength: 300,
          maxLines: 3,
          textCapitalization: TextCapitalization.sentences,
        ),
        const SizedBox(height: AppSpacing.lg),
        AppButton(label: t.t('billing.save'), onPressed: _save),
      ],
    );
  }
}

/// A new expense, with an optional receipt.
Future<ExpenseInput?> showExpenseSheet(
  BuildContext context, {
  required String currency,
}) =>
    showAppBottomSheet<ExpenseInput>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _ExpenseSheet(currency: currency),
    );

class _ExpenseSheet extends ConsumerStatefulWidget {
  const _ExpenseSheet({required this.currency});

  final String currency;

  @override
  ConsumerState<_ExpenseSheet> createState() => _ExpenseSheetState();
}

class _ExpenseSheetState extends ConsumerState<_ExpenseSheet> {
  DateTime _day = _today();
  final _desc = TextEditingController();
  final _amount = TextEditingController();
  PickedCaseFile? _receipt;
  bool _bad = false;

  @override
  void dispose() {
    _desc.dispose();
    _amount.dispose();
    super.dispose();
  }

  Future<void> _photo() async {
    final f = await ImagePicker().pickImage(
      source: ImageSource.gallery,
      maxWidth: 2048,
      maxHeight: 2048,
      imageQuality: 85,
    );
    if (f == null) return;
    final bytes = await f.readAsBytes();
    if (mounted) {
      setState(() => _receipt = PickedCaseFile(bytes: bytes, name: f.name));
    }
  }

  Future<void> _file() async {
    final upload = ref.read(uploadLimitsProvider)[UploadPlace.kase];
    final r = await FilePicker.pickFiles(
      cancelUploadOnWindowBlur: false,
      type: FileType.custom,
      allowedExtensions: upload.documentExtensions,
      withData: true,
    );
    final f = r?.files.firstOrNull;
    if (f?.bytes == null) return;
    if (mounted) {
      setState(() => _receipt = PickedCaseFile(bytes: f!.bytes!, name: f.name));
    }
  }

  void _attachMenu() {
    final t = ref.read(translatorProvider);
    showActionSheet(context, [
      ActionSheetItem(
        icon: AppIcons.imageOutlined,
        label: t.t('billing.photo'),
        onTap: _photo,
      ),
      ActionSheetItem(
        icon: AppIcons.attachFileRounded,
        label: t.t('billing.file'),
        onTap: _file,
      ),
    ]);
  }

  void _save() {
    final cents = parseMoneyCents(_amount.text);
    final desc = _desc.text.trim();
    if (cents == null || cents < 1 || cents > 100000000 || desc.isEmpty) {
      setState(() => _bad = true);
      return;
    }
    Navigator.of(context).pop(
      ExpenseInput(
        day: _day,
        description: desc,
        cents: cents,
        receipt: _receipt,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final formats = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final err = _bad ? t.t('billing.invalid') : null;
    return _Frame(
      title: t.t('billing.addExpense.title'),
      children: [
        _DateField(
          label: t.t('billing.date'),
          value: _day,
          onChanged: (d) => setState(() => _day = d),
          formats: formats,
        ),
        const SizedBox(height: AppSpacing.md),
        AppTextField(
          controller: _desc,
          label: t.t('billing.desc'),
          maxLength: 200,
          errorText: err != null && _desc.text.trim().isEmpty ? err : null,
          textCapitalization: TextCapitalization.sentences,
        ),
        const SizedBox(height: AppSpacing.md),
        AppTextField(
          controller: _amount,
          label: '${t.t('billing.amount')}, ${widget.currency}',
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          errorText:
              err != null && parseMoneyCents(_amount.text) == null ? err : null,
        ),
        const SizedBox(height: AppSpacing.md),
        if (_receipt == null)
          Semantics(
            button: true,
            label: t.t('billing.receipt.add'),
            excludeSemantics: true,
            child: AppPressable(
              onTap: _attachMenu,
              child: ConstrainedBox(
                constraints:
                    const BoxConstraints(minHeight: AppSizes.hitTarget),
                child: Row(
                  children: [
                    const AppIcon(AppIcons.attachFileRounded),
                    const SizedBox(width: AppSpacing.sm),
                    Expanded(
                      child: Text(
                        t.t('billing.receipt.add'),
                        style: type.body.copyWith(fontWeight: FontWeight.w600),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          )
        else
          Container(
            padding: const EdgeInsetsDirectional.only(start: AppSpacing.md),
            decoration: BoxDecoration(
              color: colors.chip,
              borderRadius: BorderRadius.circular(AppRadii.field),
            ),
            child: Row(
              children: [
                const AppIcon(AppIcons.descriptionOutlined),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Text(
                    _receipt!.name,
                    style: type.bodySmall,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                AppIconButton(
                  icon: const AppIcon(AppIcons.closeRounded),
                  semanticLabel: t.t('billing.receipt.remove'),
                  onPressed: () => setState(() => _receipt = null),
                ),
              ],
            ),
          ),
        const SizedBox(height: AppSpacing.lg),
        AppButton(label: t.t('billing.save'), onPressed: _save),
      ],
    );
  }
}

/// A yes / no question: [title], [body], a primary and a cancel button.
/// [destructive] paints the primary one as a danger button.
Future<bool> confirmBilling(
  BuildContext context, {
  required String title,
  required String body,
  required String action,
  required String cancel,
  bool destructive = false,
}) async {
  final r = await showAppBottomSheet<bool>(
    context: context,
    builder: (ctx) {
      final type = Theme.of(ctx).extension<AppTypographyTokens>()!;
      final colors = Theme.of(ctx).extension<AppColorTokens>()!;
      return _Frame(
        title: title,
        children: [
          if (body.isNotEmpty)
            Padding(
              padding: const EdgeInsetsDirectional.only(bottom: AppSpacing.lg),
              child: Text(
                body,
                style: type.body.copyWith(color: colors.textSecondary),
              ),
            ),
          AppButton(
            label: action,
            variant: destructive
                ? AppButtonVariant.danger
                : AppButtonVariant.primary,
            onPressed: () => Navigator.of(ctx).pop(true),
          ),
          const SizedBox(height: AppSpacing.sm),
          AppButton(
            label: cancel,
            variant: AppButtonVariant.secondary,
            onPressed: () => Navigator.of(ctx).pop(false),
          ),
        ],
      );
    },
  );
  return r ?? false;
}
