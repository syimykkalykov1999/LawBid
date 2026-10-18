import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/design_system/widgets/pickers/app_pickers.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/onboarding/domain/us_states.dart';
import 'package:lawbid/features/onboarding/presentation/widgets/option_picker_sheet.dart';
import 'package:lawbid/features/verification/application/verification_wizard_controller.dart';
import 'package:lawbid/features/verification/domain/verification_models.dart';
import 'package:lawbid/features/verification/presentation/document_source.dart';
import 'package:lawbid/features/verification/presentation/widgets/inline_notice.dart';

/// "Добавить штат" (docs/03 §8 step 2, §2.1): state, bar number and the
/// optional expiry. The server keeps it in the draft right away; the bar
/// document is uploaded on the license card afterwards.
///
/// Owner 2026-10-18: the state's format is never revealed (no live hint, no
/// example). A refused number counts as a failed attempt; after 5 the server
/// locks adding a number for an hour and «Добавить» shows how long is left.
/// «Мой номер верный — отправить на проверку» (also while locked) sends the
/// number, the state and a photo of the bar card (+ an optional note) to a
/// person.
class AddLicenseSheet extends ConsumerStatefulWidget {
  const AddLicenseSheet({
    required this.takenStates,
    this.initial,
    super.key,
  });

  /// States already in the request (one license per state).
  final Set<String> takenStates;

  /// A license being edited: the form opens filled with it, and saving
  /// replaces it.
  final VerificationLicense? initial;

  static Future<bool?> show(
    BuildContext context,
    Set<String> takenStates, {
    VerificationLicense? initial,
  }) =>
      showAppBottomSheet<bool>(
        context: context,
        isScrollControlled: true,
        builder: (_) =>
            AddLicenseSheet(takenStates: takenStates, initial: initial),
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
  final _note = TextEditingController();
  bool _busy = false;
  bool _tried = false;
  String? _serverError;

  /// The server refused the number (not found / locked): the manual path
  /// is offered.
  bool _refused = false;

  /// The manual-review form is open.
  bool _manual = false;
  PickedDocument? _card;
  Timer? _tick;

  @override
  void initState() {
    super.initState();
    final initial = widget.initial;
    if (initial != null) {
      _state = initial.stateCode;
      _bar.text = initial.barNumber;
      _expires = initial.expiresAt;
    }
    // Save turns from grey to active as the bar number becomes valid.
    _bar.addListener(() => setState(() {}));
    // The lock countdown («… через 47 мин.») stays current.
    _tick = Timer.periodic(const Duration(seconds: 20), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _tick?.cancel();
    _bar.dispose();
    _note.dispose();
    super.dispose();
  }

  /// Time left of the server's lock on adding a number, or null.
  Duration? get _lockLeft =>
      ref.read(verificationWizardProvider).value?.barLockLeft(DateTime.now());

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
        for (final s in kRegions)
          if (!widget.takenStates.contains(s.code))
            PickerOption(
              value: s.code,
              label: s.name,
              sublabel: s.code,
              keywords: s.aliases,
            ),
      ],
      initial: {if (_state != null) _state!},
    );
    if (picked != null && picked.isNotEmpty && mounted) {
      setState(() => _state = picked.first);
    }
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final picked = await showAppDatePicker(
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
    if (bar == null || state == null || _lockLeft != null) return;
    setState(() => _busy = true);
    try {
      final wizard = ref.read(verificationWizardProvider.notifier);
      final initial = widget.initial;
      if (initial != null) await wizard.removeLicense(initial);
      await wizard.addLicense(
        stateCode: state,
        barNumber: bar,
        expiresAt: _expires,
      );
      if (mounted) Navigator.of(context).pop(true);
    } on Object catch (e) {
      if (mounted) {
        final locked =
            e is ApiException && e.code == ApiErrorCodes.barAttemptsCooldown;
        final refused = locked ||
            (e is ApiException &&
                e.code == ApiErrorCodes.barNumberFormatInvalid);
        setState(() {
          if (refused) _refused = true;
          // The lock notice says it better than the generic error.
          _serverError =
              locked ? null : errorText(ref.read(translatorProvider), e);
        });
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _pickCard({required bool camera}) async {
    final source = ref.read(documentSourceProvider);
    final doc = camera
        ? await source.capture(context, CaptureGuide.card)
        : await source.pickFile(allowPdf: true);
    if (doc != null && mounted) setState(() => _card = doc);
  }

  Future<void> _sendForReview() async {
    setState(() {
      _tried = true;
      _serverError = null;
    });
    final bar = _barValue;
    final state = _state;
    final card = _card;
    if (bar == null || state == null || card == null) return;
    setState(() => _busy = true);
    try {
      final wizard = ref.read(verificationWizardProvider.notifier);
      final initial = widget.initial;
      if (initial != null) await wizard.removeLicense(initial);
      await wizard.addLicenseForManualReview(
        stateCode: state,
        barNumber: bar,
        expiresAt: _expires,
        barCard: card,
        note: _note.text,
      );
      if (mounted) Navigator.of(context).pop(true);
    } on Object catch (e) {
      if (mounted) {
        setState(
          () => _serverError = errorText(ref.read(translatorProvider), e),
        );
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
    final lockLeft = ref
        .watch(verificationWizardProvider)
        .value
        ?.barLockLeft(DateTime.now());
    final manual = _manual;
    final stateName =
        kRegions.where((s) => s.code == _state).map((s) => s.name).firstOrNull;
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
                manual
                    ? t.t('verification.license.manual.title')
                    : t.t(
                        widget.initial == null
                            ? 'verification.license.add.title'
                            : 'common.edit',
                      ),
                style: typography.titleMedium.copyWith(color: colors.text),
              ),
              const SizedBox(height: AppSpacing.xs),
              Text(
                t.t(
                  manual
                      ? 'verification.license.manual.body'
                      : 'verification.license.add.body',
                ),
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
                // Owner 2026-10-18: a neutral helper only — the state's
                // format is never hinted at while typing.
                helperText: t.t('verification.license.barNumber.helper'),
                textCapitalization: TextCapitalization.characters,
                maxLength: 32,
                inputFormatters: [
                  FilteringTextInputFormatter.allow(RegExp('[A-Za-z0-9 ./-]')),
                ],
                errorText: _tried && _barValue == null
                    ? t.t('verification.license.barNumber.invalid')
                    : null,
                onChanged: (_) => setState(() {}),
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
                  alignment: AlignmentDirectional.centerStart,
                  child: TextButton(
                    onPressed: () => setState(() => _expires = null),
                    child: Text(
                      t.t('verification.license.expires.clear'),
                      style:
                          typography.bodySmall.copyWith(color: colors.goldDark),
                    ),
                  ),
                ),
              if (manual) ...[
                const SizedBox(height: AppSpacing.lg),
                _CardPhoto(
                  t: t,
                  card: _card,
                  errorText: _tried && _card == null
                      ? t.t('verification.license.manual.cardRequired')
                      : null,
                  onCamera: () => _pickCard(camera: true),
                  onFile: () => _pickCard(camera: false),
                  onRemove: () => setState(() => _card = null),
                ),
                const SizedBox(height: AppSpacing.lg),
                AppTextField(
                  controller: _note,
                  label: t.t('verification.license.manual.note'),
                  maxLines: 3,
                  maxLength: 500,
                  textCapitalization: TextCapitalization.sentences,
                ),
              ],
              if (_serverError != null) ...[
                const SizedBox(height: AppSpacing.md),
                InlineNotice(
                  tone: NoticeTone.danger,
                  icon: AppIcons.errorOutlineRounded,
                  message: _serverError!,
                ),
              ],
              if (!manual && lockLeft != null) ...[
                const SizedBox(height: AppSpacing.md),
                InlineNotice(
                  tone: NoticeTone.danger,
                  icon: AppIcons.timerOutlined,
                  message: t.t('verification.license.locked', {
                    'minutes': '${(lockLeft.inSeconds / 60).ceil()}',
                  }),
                ),
              ],
              const SizedBox(height: AppSpacing.xl),
              if (manual) ...[
                AppButton(
                  label: t.t('verification.license.manual.send'),
                  isLoading: _busy,
                  isEnabled:
                      _state != null && _barValue != null && _card != null,
                  onPressed: _sendForReview,
                ),
                const SizedBox(height: AppSpacing.sm),
                AppButton(
                  label: t.t('common.back'),
                  variant: AppButtonVariant.secondary,
                  isEnabled: !_busy,
                  onPressed: () => setState(() {
                    _manual = false;
                    _tried = false;
                    _serverError = null;
                  }),
                ),
              ] else ...[
                AppButton(
                  label: t.t(
                    widget.initial == null
                        ? 'verification.license.add.save'
                        : 'common.save',
                  ),
                  isLoading: _busy,
                  isEnabled:
                      _state != null && _barValue != null && lockLeft == null,
                  onPressed: _save,
                ),
                // Owner 2026-10-18: a real attorney whose correct number is
                // refused (or who is locked out) sends it to a person.
                if (_refused || lockLeft != null) ...[
                  const SizedBox(height: AppSpacing.sm),
                  AppButton(
                    label: t.t('verification.license.manual.open'),
                    variant: AppButtonVariant.secondary,
                    isEnabled: !_busy,
                    onPressed: () => setState(() {
                      _manual = true;
                      _tried = false;
                      _serverError = null;
                    }),
                  ),
                ],
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// The bar card photo of the manual-review form: camera or file, then the
/// chosen file with a way to take it back.
class _CardPhoto extends StatelessWidget {
  const _CardPhoto({
    required this.t,
    required this.card,
    required this.onCamera,
    required this.onFile,
    required this.onRemove,
    this.errorText,
  });

  final Translator t;
  final PickedDocument? card;
  final VoidCallback onCamera;
  final VoidCallback onFile;
  final VoidCallback onRemove;
  final String? errorText;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final picked = card;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          t.t('verification.license.manual.card'),
          style: typography.bodySmall.copyWith(color: colors.textSecondary),
        ),
        const SizedBox(height: AppSpacing.sm),
        if (picked == null)
          Row(
            children: [
              Expanded(
                child: AppButton(
                  label: t.t('verification.source.camera'),
                  icon: AppIcons.photoCameraOutlined,
                  variant: AppButtonVariant.secondary,
                  onPressed: onCamera,
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: AppButton(
                  label: t.t('verification.source.file'),
                  icon: AppIcons.uploadFileRounded,
                  variant: AppButtonVariant.secondary,
                  onPressed: onFile,
                ),
              ),
            ],
          )
        else
          AppCard(
            child: Row(
              children: [
                AppIcon(
                  AppIcons.attachFileRounded,
                  color: colors.textSecondary,
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Text(
                    picked.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: typography.body.copyWith(color: colors.text),
                  ),
                ),
                AppIconButton(
                  semanticLabel: t.t('verification.license.manual.cardRemove'),
                  onPressed: onRemove,
                  icon: AppIcon(
                    AppIcons.closeRounded,
                    color: colors.textSecondary,
                  ),
                ),
              ],
            ),
          ),
        if (errorText != null) ...[
          const SizedBox(height: AppSpacing.xs),
          Text(
            errorText!,
            style: typography.bodySmall.copyWith(color: colors.dangerText),
          ),
        ],
      ],
    );
  }
}
