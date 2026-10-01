import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/cases/application/cases_providers.dart';
import 'package:lawbid/features/cases/application/create_case_controller.dart';
import 'package:lawbid/features/cases/domain/case_draft.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_wizard_steps.dart';
import 'package:lawbid/features/cases/presentation/widgets/detail_widgets.dart';

/// docs/04 §3.5 — edit title, description, city, budget while `open`;
/// practice area and states only without bids (the step is skipped /
/// locked otherwise).
class EditCaseScreen extends ConsumerWidget {
  const EditCaseScreen({required this.caseId, super.key});

  final String caseId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final value = ref.watch(ownerCaseProvider(caseId));
    return value.hasValue
        ? _EditForm(original: value.requireValue)
        : Scaffold(
            backgroundColor: colors.bg,
            appBar: AppTopBar(
              leading: AppBackButton(
                semanticLabel: t.t('common.back'),
                onPressed: () => context.pop(),
              ),
              title: Text(t.t('cases.edit.title')),
            ),
            body: AsyncDetailBody<OwnerCase>(
              value: value,
              t: t,
              onRetry: () => ref.invalidate(ownerCaseProvider(caseId)),
              builder: (_) => const SizedBox.shrink(),
            ),
          );
  }
}

class _EditForm extends ConsumerStatefulWidget {
  const _EditForm({required this.original});

  final OwnerCase original;

  @override
  ConsumerState<_EditForm> createState() => _EditFormState();
}

class _EditFormState extends ConsumerState<_EditForm> {
  late CaseDraft _draft = draftFromCase(widget.original);
  late final List<int> _steps = [
    if (widget.original.canChangePracticeAndStates) 0,
    1,
    2,
    3,
  ];
  int _index = 0;
  bool _saving = false;
  ApiException? _error;

  int get _step => _steps[_index];

  bool get _valid => switch (_step) {
        0 => _draft.practiceValid,
        1 => _draft.titleValid && _draft.descriptionValid,
        2 => _draft.placeValid,
        _ => _draft.budgetValid,
      };

  void _change(CaseDraft Function(CaseDraft d) f) => setState(() {
        _draft = f(_draft);
        _error = null;
      });

  Future<void> _save() async {
    setState(() => _saving = true);
    final t = ref.read(translatorProvider);
    try {
      await ref
          .read(casesRepositoryProvider)
          .updateCase(widget.original, _draft);
      ref
        ..invalidate(ownerCaseProvider(widget.original.id))
        ..invalidate(myCasesProvider)
        ..invalidate(mineCasesProvider);
      if (!mounted) return;
      showAppSnackBar(context, t.t('cases.edit.saved'));
      context.pop();
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = e;
        if (e.code == ApiErrorCodes.caseContainsContactInfo)
          _index = _steps.indexOf(1);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final last = _index == _steps.length - 1;
    final contactError = _error?.code == ApiErrorCodes.caseContainsContactInfo
        ? apiErrorText(t, _error!)
        : null;
    final Widget step = switch (_step) {
      0 => PracticeStep(draft: _draft, onChange: _change),
      1 => EssenceStep(
          draft: _draft, onChange: _change, contactError: contactError),
      2 => PlaceStep(
          draft: _draft,
          onChange: _change,
          statesLocked: !widget.original.canChangePracticeAndStates,
        ),
      _ => BudgetStep(draft: _draft, onChange: _change),
    };
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () =>
              context.canPop() ? context.pop() : context.go(AppRoutes.mine),
        ),
        title: Text(t.t('cases.edit.title')),
      ),
      body: Column(
        children: [
          Padding(
            padding:
                const EdgeInsets.symmetric(horizontal: AppSpacing.screenSide),
            child: AppStepProgress(
              total: _steps.length,
              current: _index + 1,
              semanticLabel: t.t('common.stepOf', {
                'current': '${_index + 1}',
                'total': '${_steps.length}',
              }),
            ),
          ),
          Expanded(
            child: AnimatedSwitcher(
              duration:
                  context.reduceMotion ? Duration.zero : AppMotion.stepSwitch,
              child: KeyedSubtree(key: ValueKey(_step), child: step),
            ),
          ),
          if (_error != null && contactError == null)
            Padding(
              padding:
                  const EdgeInsets.symmetric(horizontal: AppSpacing.screenSide),
              child: Text(
                apiErrorText(t, _error!),
                style: typography.bodySmall.copyWith(color: colors.dangerText),
              ),
            ),
          BottomActionBar(
            children: [
              ButtonPair(
                left: AppButton(
                  label: t.t('common.back'),
                  variant: AppButtonVariant.secondary,
                  isEnabled: _index > 0,
                  dimWhenDisabled: true,
                  onPressed: () => setState(() => _index--),
                ),
                right: AppButton(
                  label: last ? t.t('common.save') : t.t('common.next'),
                  isEnabled: _valid,
                  isLoading: _saving,
                  dimWhenDisabled: true,
                  onPressed: last ? _save : () => setState(() => _index++),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
