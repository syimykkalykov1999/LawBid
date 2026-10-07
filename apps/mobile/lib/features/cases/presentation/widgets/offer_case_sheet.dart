import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/cases/application/cases_providers.dart';
import 'package:lawbid/features/cases/application/invites_providers.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_format.dart';

/// Owner 2026-10-05 ("Предложить дело"): the client offers one of their
/// open cases to the attorney whose profile they are on. Optional budget
/// and message; the attorney answers with a bid or declines.
Future<void> showOfferCaseSheet(
  BuildContext context, {
  required String attorneyId,
  required String attorneyName,
  required Set<String> licensedStateCodes,
  required Set<String> practiceIds,
}) =>
    showAppBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => OfferCaseSheet(
        attorneyId: attorneyId,
        attorneyName: attorneyName,
        licensedStateCodes: licensedStateCodes,
        practiceIds: practiceIds,
      ),
    );

class OfferCaseSheet extends ConsumerStatefulWidget {
  const OfferCaseSheet({
    required this.attorneyId,
    required this.attorneyName,
    required this.licensedStateCodes,
    required this.practiceIds,
    super.key,
  });

  final String attorneyId;
  final String attorneyName;
  final Set<String> licensedStateCodes;
  final Set<String> practiceIds;

  @override
  ConsumerState<OfferCaseSheet> createState() => _OfferCaseSheetState();
}

class _OfferCaseSheetState extends ConsumerState<OfferCaseSheet> {
  String? _caseId;
  final _budget = TextEditingController();
  final _message = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _budget.dispose();
    _message.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final t = ref.read(translatorProvider);
    final caseId = _caseId;
    if (caseId == null) return;
    final dollars = int.tryParse(_budget.text.trim());
    setState(() => _busy = true);
    try {
      await ref.read(invitesRepositoryProvider).send(
            caseId,
            attorneyId: widget.attorneyId,
            message: _message.text.trim().isEmpty ? null : _message.text.trim(),
            budgetCents: dollars == null || dollars <= 0 ? null : dollars * 100,
          );
      ref.invalidate(caseInvitesProvider(caseId));
      if (!mounted) return;
      Navigator.of(context).pop();
      showAppSnackBar(context, t.t('invite.offer.sent'));
    } on Object catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      final already =
          e is ApiException && e.code == ApiErrorCodes.bidAlreadyExists;
      showAppSnackBar(
        context,
        already ? t.t('invite.offer.alreadyBid') : errorText(t, e),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final cases = ref.watch(myCasesProvider(MyCasesFilter.open));
    final items = cases.value?.items ?? const <CaseSummary>[];
    CaseSummary? picked;
    for (final c in items) {
      if (c.id == _caseId) picked = c;
    }
    final outsideState = picked != null &&
        !widget.licensedStateCodes.contains(picked.primaryStateCode);
    final outsidePractice =
        picked != null && !widget.practiceIds.contains(picked.practice.id);

    return Padding(
      padding: EdgeInsets.fromLTRB(
        AppSpacing.screenSide,
        AppSpacing.md,
        AppSpacing.screenSide,
        AppSpacing.lg + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const AppSheetHandle(),
            Text(
              t.t('invite.offer.title', {'name': widget.attorneyName}),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: type.titleMedium.copyWith(color: colors.text),
            ),
            const SizedBox(height: AppSpacing.xs),
            Text(
              t.t('invite.offer.body'),
              style: type.bodySmall.copyWith(color: colors.textSecondary),
            ),
            const SizedBox(height: AppSpacing.lg),
            Text(
              t.t('invite.offer.pickCase'),
              style: type.button.copyWith(color: colors.text),
            ),
            const SizedBox(height: AppSpacing.sm),
            if (cases.isLoading && items.isEmpty)
              const Padding(
                padding: EdgeInsets.all(AppSpacing.md),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (cases.hasError && items.isEmpty)
              Text(
                errorText(t, cases.error!),
                style: type.bodySmall.copyWith(color: colors.dangerText),
              )
            else if (items.isEmpty) ...[
              Text(
                t.t('invite.offer.noCases'),
                style: type.body.copyWith(color: colors.textSecondary),
              ),
              const SizedBox(height: AppSpacing.md),
              AppButton(
                key: const ValueKey('offer-create-case'),
                label: t.t('invite.offer.createCase'),
                variant: AppButtonVariant.secondary,
                onPressed: () {
                  Navigator.of(context).pop();
                  context.go(AppRoutes.create);
                },
              ),
            ] else
              for (final c in items)
                _CaseOption(
                  key: ValueKey('offer-case-${c.id}'),
                  item: c,
                  selected: c.id == _caseId,
                  onTap: _busy ? null : () => setState(() => _caseId = c.id),
                ),
            if (outsideState || outsidePractice) ...[
              const SizedBox(height: AppSpacing.sm),
              _Mismatch(
                lines: [
                  if (outsideState) t.t('invite.mismatch.state'),
                  if (outsidePractice) t.t('invite.mismatch.practice'),
                ],
              ),
            ],
            if (items.isNotEmpty) ...[
              const SizedBox(height: AppSpacing.md),
              AppTextField(
                key: const ValueKey('offer-budget'),
                controller: _budget,
                label: t.t('invite.offer.budget'),
                hintText: t.t('invite.offer.budgetHint'),
                keyboardType: TextInputType.number,
                inputFormatters: [
                  FilteringTextInputFormatter.digitsOnly,
                  LengthLimitingTextInputFormatter(7),
                ],
                enabled: !_busy,
              ),
              const SizedBox(height: AppSpacing.md),
              AppTextField(
                key: const ValueKey('offer-message'),
                controller: _message,
                label: t.t('invite.offer.message'),
                hintText: t.t('invite.offer.messageHint'),
                maxLines: 4,
                maxLength: 1000,
                textCapitalization: TextCapitalization.sentences,
                enabled: !_busy,
              ),
              const SizedBox(height: AppSpacing.md),
              AppButton(
                key: const ValueKey('offer-send'),
                label: t.t('invite.offer.send'),
                height: AppSizes.touchTarget,
                isLoading: _busy,
                disabledHint: t.t('form.disabled.required'),
                isEnabled: _caseId != null && !_busy,
                onPressed: _send,
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _CaseOption extends ConsumerWidget {
  const _CaseOption({
    required this.item,
    required this.selected,
    required this.onTap,
    super.key,
  });

  final CaseSummary item;
  final bool selected;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final practice =
        CaseFormat.practice(t, item.practice.i18nKey, item.practice.nameEn);
    final place = CaseFormat.place(
      item.city,
      item.primaryStateCode,
      item.additionalStateCount,
    );
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: Semantics(
        button: true,
        selected: selected,
        child: InkWell(
          borderRadius: BorderRadius.circular(AppRadii.field),
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.all(AppSpacing.md),
            decoration: BoxDecoration(
              color: selected ? colors.goldTint : colors.surface,
              borderRadius: BorderRadius.circular(AppRadii.field),
              border: Border.all(
                color: selected ? colors.gold : colors.border,
                width: selected ? 1.5 : 1,
              ),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        item.title,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: type.body.copyWith(color: colors.text),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        '$practice · $place',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style:
                            type.caption.copyWith(color: colors.textSecondary),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                AppIcon(
                  selected
                      ? AppIcons.checkCircleRounded
                      : AppIcons.radioButtonUncheckedRounded,
                  color: selected ? colors.goldDark : colors.textSecondary,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// The same "outside your state / practice" note the client sees on bids.
class _Mismatch extends StatelessWidget {
  const _Mismatch({required this.lines});

  final List<String> lines;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Container(
      padding: const EdgeInsets.all(AppSpacing.sm),
      decoration: BoxDecoration(
        color: colors.goldTint,
        borderRadius: BorderRadius.circular(AppRadii.field),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AppIcon(
            AppIcons.infoOutlineRounded,
            size: 18,
            color: colors.goldDark,
          ),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Text(
              lines.join('\n'),
              style: type.bodySmall.copyWith(color: colors.text),
            ),
          ),
        ],
      ),
    );
  }
}
