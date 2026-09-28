import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/onboarding/domain/us_states.dart';
import 'package:lawbid/features/onboarding/presentation/widgets/option_picker_sheet.dart';
import 'package:lawbid/features/verification/application/verification_wizard_controller.dart';
import 'package:lawbid/features/verification/presentation/widgets/inline_notice.dart';

/// "Добавить штат" (docs/03 §8 step 2, §2.1): state, bar number and the
/// optional expiry. The server keeps it in the draft right away; the bar
/// document is uploaded on the license card afterwards.
class AddLicenseSheet extends ConsumerStatefulWidget {
  const AddLicenseSheet({required this.takenStates, super.key});

  /// States already in the request (one license per state).
  final Set<String> takenStates;

  static Future<bool?> show(BuildContext context, Set<String> takenStates) =>
      showAppBottomSheet<bool>(
        context: context,
        isScrollControlled: true,
        builder: (_) => AddLicenseSheet(takenStates: takenStates),
      );

  @override
  ConsumerState<AddLicenseSheet> createState() => _AddLicenseSheetState();
}

/// Same rule as the API's BAR_NUMBER_PATTERN (letters, digits, and
/// `-./` or space inside; up to 32).
final _barNumber = RegExp(r'^[A-Z0-9][A-Z0-9 ./-]{0,31}$');

class _AddLicenseSheetState extends ConsumerState<AddLicenseSheet> {
  final _bar = TextEditingController();
  String? _state;
  DateTime? _expires;
  bool _busy = false;
  bool _tried = false;
  String? _serverError;

  @override
  void dispose() {
    _bar.dispose();
    super.dispose();
  }

  String? get _barValue {
    final v = _bar.text.trim().toUpperCase();
    return _barNumber.hasMatch(v) ? v : null;
  }

  Future<void> _pickState() async {
    final t = ref.read(translatorProvider);
    final picked = await OptionPickerSheet.show(
      context,
      title: t.t('verification.license.state'),
      options: [
        for (final s in kUsStates)
          if (!widget.takenStates.contains(s.code))
            PickerOption(value: s.code, label: s.name, sublabel: s.code),
      ],
      initial: {if (_state != null) _state!},
    );
    if (picked != null && picked.isNotEmpty && mounted) {
      setState(() => _state = picked.first);
    }
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _expires ?? DateTime(now.year + 1, now.month, now.day),
      firstDate: now,
      lastDate: DateTime(now.year + 30),
    );
    if (picked != null && mounted) setState(() => _expires = picked);
  }

  Future<void> _save() async {
    setState(() {
      _tried = true;
      _serverError = null;
    });
    final bar = _barValue;
    final state = _state;
    if (bar == null || state == null) return;
    setState(() => _busy = true);
    try {
      await ref.read(verificationWizardProvider.notifier).addLicense(
            stateCode: state,
            barNumber: bar,
            expiresAt: _expires,
          );
      if (mounted) Navigator.of(context).pop(true);
    } on Object catch (e) {
      if (mounted) {
        setState(
            () => _serverError = errorText(ref.read(translatorProvider), e));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final t = ref.watch(translatorProvider);
    final stateName =
        kUsStates.where((s) => s.code == _state).map((s) => s.name).firstOrNull;
    final expires = _expires;

    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.screenSide,
            AppSpacing.md,
            AppSpacing.screenSide,
            AppSpacing.xl,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Center(child: AppSheetHandle()),
              const SizedBox(height: AppSpacing.lg),
              Text(
                t.t('verification.license.add.title'),
                style: typography.titleMedium.copyWith(color: colors.text),
              ),
              const SizedBox(height: AppSpacing.xs),
              Text(
                t.t('verification.license.add.body'),
                style:
                    typography.bodySmall.copyWith(color: colors.textSecondary),
              ),
              const SizedBox(height: AppSpacing.xl),
              PickerField(
                label: t.t('verification.license.state'),
                placeholder: t.t('verification.license.state.placeholder'),
                value: stateName,
                errorText: _tried && _state == null
                    ? t.t('verification.license.state.required')
                    : null,
                onTap: _pickState,
              ),
              const SizedBox(height: AppSpacing.lg),
              AppTextField(
                controller: _bar,
                label: t.t('verification.license.barNumber'),
                hintText: t.t('verification.license.barNumber.hint'),
                helperText: t.t('verification.license.barNumber.helper'),
                textCapitalization: TextCapitalization.characters,
                maxLength: 32,
                inputFormatters: [
                  FilteringTextInputFormatter.allow(RegExp('[A-Za-z0-9 ./-]')),
                ],
                errorText: _tried && _barValue == null
                    ? t.t('verification.license.barNumber.invalid')
                    : null,
                onChanged: (_) {
                  if (_tried) setState(() {});
                },
              ),
              const SizedBox(height: AppSpacing.lg),
              PickerField(
                label: t.t('verification.license.expires'),
                placeholder: t.t('verification.license.expires.placeholder'),
                value: expires == null
                    ? null
                    : MaterialLocalizations.of(context)
                        .formatMediumDate(expires),
                onTap: _pickDate,
              ),
              if (expires != null)
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton(
                    onPressed: () => setState(() => _expires = null),
                    child: Text(
                      t.t('verification.license.expires.clear'),
                      style:
                          typography.bodySmall.copyWith(color: colors.goldDark),
                    ),
                  ),
                ),
              if (_serverError != null) ...[
                const SizedBox(height: AppSpacing.md),
                InlineNotice(
                  tone: NoticeTone.danger,
                  icon: Icons.error_outline_rounded,
                  message: _serverError!,
                ),
              ],
              const SizedBox(height: AppSpacing.xl),
              AppButton(
                label: t.t('verification.license.add.save'),
                isLoading: _busy,
                onPressed: _save,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
