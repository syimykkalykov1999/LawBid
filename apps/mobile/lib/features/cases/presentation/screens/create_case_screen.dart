import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/cases/application/create_case_controller.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_format.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_wizard_steps.dart';
import 'package:lawbid/features/cases/presentation/widgets/detail_widgets.dart';

/// docs/04 §3.1 — the client's "+" flow: five steps, local draft, publish.
class CreateCaseScreen extends ConsumerStatefulWidget {
  const CreateCaseScreen({super.key});

  @override
  ConsumerState<CreateCaseScreen> createState() => _CreateCaseScreenState();
}

class _CreateCaseScreenState extends ConsumerState<CreateCaseScreen> {
  int _previousStep = 0;

  CreateCaseController get _c =>
      ref.read(createCaseControllerProvider.notifier);

  /// §3.1: "При закрытии мастера приложение предлагает сохранить черновик".
  Future<void> _close() async {
    final t = ref.read(translatorProvider);
    final state = ref.read(createCaseControllerProvider);
    if (state.draft.isEmpty) {
      await _c.finishEditing(keepDraft: false);
      if (mounted) Navigator.of(context).pop();
      return;
    }
    final keep = await showAppBottomSheet<bool>(
      context: context,
      builder: (context) => _SaveDraftSheet(t: t),
    );
    if (keep == null) return; // "Continue editing"
    await _c.finishEditing(keepDraft: keep);
    if (mounted) Navigator.of(context).pop();
  }

  Future<void> _publish() async {
    final ok = await _c.publish();
    if (!mounted) return;
    final state = ref.read(createCaseControllerProvider);
    if (ok && state.publishedCaseId != null) {
      showAppSnackBar(
          context, ref.read(translatorProvider).t('cases.create.published'));
      context.pushReplacement(AppRoutes.myCase(state.publishedCaseId!));
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final formats = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final state = ref.watch(createCaseControllerProvider);
    final d = state.draft;
    final forward = d.step >= _previousStep;
    _previousStep = d.step;
    final error = state.error;
    final contactError = error?.code == ApiErrorCodes.caseContainsContactInfo
        ? apiErrorText(t, error!)
        : null;

    final Widget step = switch (d.step) {
      0 => PracticeStep(draft: d, onChange: _c.update),
      1 =>
        EssenceStep(draft: d, onChange: _c.update, contactError: contactError),
      2 => PlaceStep(draft: d, onChange: _c.update),
      3 => BudgetStep(draft: d, onChange: _c.update),
      _ => _ReviewStep(state: state, t: t, formats: formats),
    };

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _close();
      },
      child: Scaffold(
        backgroundColor: colors.bg,
        appBar: AppTopBar(
          leading: AppTapTarget(
            child: Semantics(
              button: true,
              label: t.t('common.close'),
              excludeSemantics: true,
              child: AppPressable(
                onTap: _close,
                child: SizedBox.square(
                  dimension: AppSizes.touchTarget,
                  child: Icon(Icons.close_rounded,
                      color: colors.text, size: AppSizes.iconMd),
                ),
              ),
            ),
          ),
          title: Text(t.t('cases.create.title')),
        ),
        body: Column(
          children: [
            Padding(
              padding:
                  const EdgeInsets.symmetric(horizontal: AppSpacing.screenSide),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  AppStepProgress(
                    total: kCaseWizardSteps,
                    current: d.step + 1,
                    semanticLabel: t.t('common.stepOf', {
                      'current': '${d.step + 1}',
                      'total': '$kCaseWizardSteps',
                    }),
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  Text(
                    t.t('common.stepOf', {
                      'current': '${d.step + 1}',
                      'total': '$kCaseWizardSteps',
                    }),
                    style: typography.caption
                        .copyWith(color: colors.textSecondary),
                  ),
                ],
              ),
            ),
            if (state.restoredDraft && d.step == 0)
              _DraftBanner(t: t, onStartOver: _c.startOver),
            Expanded(
              child: !state.loaded
                  ? const SizedBox.shrink()
                  : AnimatedSwitcher(
                      duration: context.reduceMotion
                          ? Duration.zero
                          : AppMotion.stepSwitch,
                      switchInCurve: AppMotion.enterCurve,
                      switchOutCurve: AppMotion.exitCurve,
                      transitionBuilder: (child, animation) {
                        final incoming = child.key == ValueKey(d.step);
                        final dx = (forward == incoming ? 1 : -1) *
                            AppMotion.pageSlideFraction;
                        return FadeTransition(
                          opacity: animation,
                          child: SlideTransition(
                            position:
                                Tween(begin: Offset(dx, 0), end: Offset.zero)
                                    .animate(animation),
                            child: child,
                          ),
                        );
                      },
                      child: KeyedSubtree(key: ValueKey(d.step), child: step),
                    ),
            ),
            if (error != null && contactError == null)
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.screenSide,
                  0,
                  AppSpacing.screenSide,
                  AppSpacing.sm,
                ),
                child: Semantics(
                  liveRegion: true,
                  child: Text(
                    apiErrorText(t, error),
                    style:
                        typography.bodySmall.copyWith(color: colors.dangerText),
                  ),
                ),
              ),
            BottomActionBar(
              children: [
                if (d.step < kCaseWizardSteps - 1)
                  ButtonPair(
                    left: AppButton(
                      label: t.t('common.back'),
                      variant: AppButtonVariant.secondary,
                      isEnabled: d.step > 0,
                      dimWhenDisabled: true,
                      onPressed: _c.back,
                    ),
                    right: AppButton(
                      label: t.t('common.next'),
                      isEnabled: state.stepValid,
                      dimWhenDisabled: true,
                      onPressed: _c.next,
                    ),
                  )
                else ...[
                  GavelStrikeButton(
                    label: t.t('cases.create.publish'),
                    strike: true,
                    isLoading: state.isSubmitting,
                    isEnabled: state.stepValid,
                    // Owner 2026-09-29: visibly off until the consent box
                    // is ticked, lights up once it is.
                    dimWhenDisabled: true,
                    onPressed: _publish,
                  ),
                  AppButton(
                    label: t.t('common.back'),
                    variant: AppButtonVariant.secondary,
                    onPressed: _c.back,
                  ),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _DraftBanner extends StatelessWidget {
  const _DraftBanner({required this.t, required this.onStartOver});

  final Translator t;
  final VoidCallback onStartOver;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return AppEntrance(
      child: Container(
        margin: const EdgeInsets.fromLTRB(
          AppSpacing.screenSide,
          AppSpacing.md,
          AppSpacing.screenSide,
          0,
        ),
        padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.md, vertical: AppSpacing.sm),
        decoration: BoxDecoration(
          color: colors.goldTint,
          borderRadius: BorderRadius.circular(AppRadii.field),
        ),
        child: Row(
          children: [
            Icon(Icons.history_edu_rounded,
                color: colors.goldDark, size: AppSizes.iconSm),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Text(
                t.t('cases.create.draftRestored'),
                style: typography.bodySmall.copyWith(color: colors.text),
              ),
            ),
            TextButton(
              onPressed: onStartOver,
              child: Text(
                t.t('cases.create.startOver'),
                style: typography.bodySmall.copyWith(
                    color: colors.goldDark, fontWeight: FontWeight.w600),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SaveDraftSheet extends StatelessWidget {
  const _SaveDraftSheet({required this.t});

  final Translator t;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return SafeArea(
      child: Padding(
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
            const AppSheetHandle(),
            const SizedBox(height: AppSpacing.lg),
            Text(
              t.t('cases.create.saveDraftTitle'),
              textAlign: TextAlign.center,
              style: typography.titleMedium.copyWith(color: colors.text),
            ),
            const SizedBox(height: AppSpacing.sm),
            Text(
              t.t('cases.create.saveDraftMessage'),
              textAlign: TextAlign.center,
              style: typography.body.copyWith(color: colors.textSecondary),
            ),
            const SizedBox(height: AppSpacing.xl),
            AppButton(
              label: t.t('cases.create.saveDraft'),
              onPressed: () => Navigator.of(context).pop(true),
            ),
            const SizedBox(height: AppSpacing.sm),
            AppButton(
              label: t.t('cases.create.discardDraft'),
              variant: AppButtonVariant.secondary,
              onPressed: () => Navigator.of(context).pop(false),
            ),
            const SizedBox(height: AppSpacing.sm),
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: Text(t.t('cases.create.keepEditing'),
                  style: typography.button.copyWith(color: colors.text)),
            ),
          ],
        ),
      ),
    );
  }
}

/// Step 5 (docs/04 §3.1): summary with edit links, disclaimer, first-case
/// `client_contact_sharing` checkbox.
class _ReviewStep extends ConsumerWidget {
  const _ReviewStep(
      {required this.state, required this.t, required this.formats});

  final CreateCaseState state;
  final Translator t;
  final L10nFormats formats;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final c = ref.read(createCaseControllerProvider.notifier);
    final d = state.draft;
    final states = [
      if (d.primaryStateCode != null) stateName(d.primaryStateCode!),
      ...d.additionalStateCodes.map(stateName),
    ].join(', ');

    Widget row(String label, String value, int step, IconData icon) =>
        Semantics(
          button: true,
          label: '$label: $value. ${t.t('common.edit')}',
          excludeSemantics: true,
          child: AppPressable(
            onTap: () => c.goTo(step),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: AppSpacing.md),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(icon, size: AppSizes.iconSm, color: colors.goldDark),
                  const SizedBox(width: AppSpacing.md),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(label,
                            style: typography.caption
                                .copyWith(color: colors.textSecondary)),
                        const SizedBox(height: 2),
                        Text(value,
                            style:
                                typography.body.copyWith(color: colors.text)),
                      ],
                    ),
                  ),
                  Icon(Icons.edit_outlined,
                      size: AppSpacing.lg, color: colors.textSecondary),
                ],
              ),
            ),
          ),
        );

    return ListView(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenSide,
        AppSpacing.lg,
        AppSpacing.screenSide,
        AppSpacing.xxl,
      ),
      children: [
        WizardHeading(
          title: t.t('cases.create.review.title'),
          subtitle: t.t('cases.create.review.subtitle'),
        ),
        AppCard(
          padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.lg, vertical: AppSpacing.xs),
          child: Column(
            children: [
              row(
                t.t('cases.field.practice'),
                CaseFormat.practice(
                    t, d.practiceI18nKey ?? '', d.practiceNameEn ?? ''),
                0,
                Icons.balance_rounded,
              ),
              Divider(height: 1, color: colors.border),
              row(t.t('cases.field.title'), d.title.trim(), 1,
                  Icons.title_rounded),
              Divider(height: 1, color: colors.border),
              row(t.t('cases.field.description'), d.description.trim(), 1,
                  Icons.notes_rounded),
              Divider(height: 1, color: colors.border),
              row(
                t.t('cases.field.place'),
                d.city.trim().isEmpty ? states : '${d.city.trim()} · $states',
                2,
                Icons.place_outlined,
              ),
              Divider(height: 1, color: colors.border),
              row(
                t.t('cases.card.budget'),
                d.budgetIsAmount && d.budgetDollars != null
                    ? CaseFormat.money(formats, d.budgetDollars! * 100)
                    : t.t('cases.budget.clarifyLater'),
                3,
                Icons.payments_outlined,
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.lg),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(Icons.info_outline_rounded,
                size: AppSpacing.lg, color: colors.textSecondary),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Text(
                t.t('cases.create.disclaimer'),
                style: typography.caption.copyWith(color: colors.textSecondary),
              ),
            ),
          ],
        ),
        if (state.needsConsent) ...[
          const SizedBox(height: AppSpacing.lg),
          _ConsentBox(
            checked: state.consentChecked,
            label: t.t('cases.create.consent'),
            onChanged: (v) => c.setConsent(value: v),
          ),
        ],
      ],
    );
  }
}

class _ConsentBox extends StatelessWidget {
  const _ConsentBox(
      {required this.checked, required this.label, required this.onChanged});

  final bool checked;
  final String label;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final motion =
        context.reduceMotion ? Duration.zero : AppMotion.roleCardCheckmark;
    return Semantics(
      checked: checked,
      label: label,
      excludeSemantics: true,
      onTap: () => onChanged(!checked),
      child: AppPressable(
        onTap: () => onChanged(!checked),
        child: AnimatedContainer(
          duration: motion,
          padding: const EdgeInsets.all(AppSpacing.lg),
          decoration: BoxDecoration(
            color: colors.surface,
            borderRadius: BorderRadius.circular(AppRadii.card),
            border: Border.all(
                color: checked ? colors.gold : colors.border,
                width: checked ? 1.5 : 1),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              AnimatedContainer(
                duration: motion,
                width: AppSizes.iconSm + 2,
                height: AppSizes.iconSm + 2,
                decoration: BoxDecoration(
                  color: checked ? colors.gold : colors.surface,
                  borderRadius: BorderRadius.circular(AppSpacing.xs + 2),
                  border: Border.all(
                      color: checked ? colors.gold : colors.textSecondary,
                      width: 1.5),
                ),
                child: checked
                    ? Icon(Icons.check_rounded,
                        size: AppSpacing.lg, color: colors.navy)
                    : null,
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                  child: Text(label,
                      style:
                          typography.bodySmall.copyWith(color: colors.text))),
            ],
          ),
        ),
      ),
    );
  }
}
