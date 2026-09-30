import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/cases/domain/case_draft.dart';
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_format.dart';
import 'package:lawbid/features/onboarding/domain/us_states.dart';
import 'package:lawbid/features/profile/application/profile_providers.dart';
import 'package:lawbid/features/profile/domain/profile_models.dart';

typedef DraftChange = void Function(CaseDraft Function(CaseDraft d) change);

/// Step heading: serif title + short explanation.
class WizardHeading extends StatelessWidget {
  const WizardHeading({required this.title, required this.subtitle, super.key});

  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Semantics(
          header: true,
          child: Text(title,
              style: typography.titleLarge.copyWith(color: colors.text)),
        ),
        const SizedBox(height: AppSpacing.sm),
        Text(subtitle,
            style: typography.body.copyWith(color: colors.textSecondary)),
        const SizedBox(height: AppSpacing.xl),
      ],
    );
  }
}

// --- Step 1: practice (docs/04 §3.1 "категория → специализация") -----------

class PracticeStep extends ConsumerStatefulWidget {
  const PracticeStep({required this.draft, required this.onChange, super.key});

  final CaseDraft draft;
  final DraftChange onChange;

  @override
  ConsumerState<PracticeStep> createState() => _PracticeStepState();
}

class _PracticeStepState extends ConsumerState<PracticeStep> {
  final _search = TextEditingController();
  String _query = '';
  String? _openCategory;

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  void _pick(PracticeLeaf leaf) => widget.onChange(
        (d) => d.copyWith(
          practiceAreaId: leaf.id,
          practiceI18nKey: leaf.i18nKey,
          practiceNameEn: leaf.nameEn,
        ),
      );

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final tree = ref.watch(practiceTreeProvider);
    return AsyncDetailBody<List<PracticeCategory>>(
      value: tree,
      t: t,
      onRetry: () => ref.invalidate(practiceTreeProvider),
      builder: (categories) {
        String name(String key, String en) => CaseFormat.practice(t, key, en);
        final q = _query.trim().toLowerCase();
        final notSure = [
          for (final c in categories)
            for (final l in c.children)
              if (l.i18nKey.endsWith('not_sure_or_other')) l,
        ].firstOrNull;
        final matches = q.isEmpty
            ? const <(PracticeCategory, PracticeLeaf)>[]
            : [
                for (final c in categories)
                  for (final l in c.children)
                    if (name(l.i18nKey, l.nameEn).toLowerCase().contains(q) ||
                        name(c.i18nKey, c.nameEn).toLowerCase().contains(q))
                      (c, l),
              ];
        return ListView(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.screenSide,
            AppSpacing.lg,
            AppSpacing.screenSide,
            AppSpacing.xxl,
          ),
          children: [
            WizardHeading(
              title: t.t('cases.create.practice.title'),
              subtitle: t.t('cases.create.practice.subtitle'),
            ),
            AppTextField(
              controller: _search,
              label: t.t('cases.create.practice.search'),
              hintText: t.t('cases.create.practice.searchHint'),
              leading: const Icon(Icons.search_rounded),
              textInputAction: TextInputAction.search,
              onChanged: (v) => setState(() => _query = v),
            ),
            const SizedBox(height: AppSpacing.lg),
            if (notSure != null && q.isEmpty) ...[
              _LeafTile(
                label: t.t('cases.create.practice.notSure'),
                caption: t.t('cases.create.practice.notSureHint'),
                icon: Icons.help_outline_rounded,
                selected: widget.draft.practiceAreaId == notSure.id,
                onTap: () => _pick(notSure),
              ),
              const SizedBox(height: AppSpacing.lg),
            ],
            if (q.isNotEmpty && matches.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: AppSpacing.xl),
                child: AppEmptyState(
                  icon: Icons.search_off_rounded,
                  message: t.t('cases.create.practice.noMatch'),
                ),
              ),
            if (q.isNotEmpty)
              for (final (c, l) in matches)
                Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                  child: _LeafTile(
                    label: name(l.i18nKey, l.nameEn),
                    caption: name(c.i18nKey, c.nameEn),
                    selected: widget.draft.practiceAreaId == l.id,
                    onTap: () => _pick(l),
                  ),
                )
            else
              for (final c in categories)
                _CategoryTile(
                  label: name(c.i18nKey, c.nameEn),
                  open: _openCategory == c.id ||
                      c.children
                          .any((l) => l.id == widget.draft.practiceAreaId),
                  onToggle: () => setState(
                    () => _openCategory = _openCategory == c.id ? null : c.id,
                  ),
                  children: [
                    for (final l in c.children)
                      _LeafTile(
                        label: name(l.i18nKey, l.nameEn),
                        selected: widget.draft.practiceAreaId == l.id,
                        onTap: () => _pick(l),
                        dense: true,
                      ),
                  ],
                ),
          ],
        );
      },
    );
  }
}

class _CategoryTile extends StatelessWidget {
  const _CategoryTile({
    required this.label,
    required this.open,
    required this.onToggle,
    required this.children,
  });

  final String label;
  final bool open;
  final VoidCallback onToggle;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final motion = context.reduceMotion ? Duration.zero : AppMotion.stateChange;
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: AnimatedContainer(
        duration: motion,
        decoration: BoxDecoration(
          color: colors.surface,
          borderRadius: BorderRadius.circular(AppRadii.card),
          border: Border.all(color: open ? colors.gold : colors.border),
        ),
        child: Column(
          children: [
            Semantics(
              button: true,
              expanded: open,
              label: label,
              excludeSemantics: true,
              child: AppPressable(
                onTap: onToggle,
                child: ConstrainedBox(
                  constraints: const BoxConstraints(
                      minHeight: AppSizes.hitTarget + AppSpacing.sm),
                  child: Padding(
                    padding:
                        const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            label,
                            style: typography.body.copyWith(
                              color: colors.text,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                        AnimatedRotation(
                          turns: open ? 0.5 : 0,
                          duration: motion,
                          curve: AppMotion.enterCurve,
                          child: Icon(Icons.expand_more_rounded,
                              color: colors.textSecondary),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
            AnimatedSize(
              duration: motion,
              curve: AppMotion.enterCurve,
              alignment: Alignment.topCenter,
              child: open
                  ? Padding(
                      padding: const EdgeInsets.fromLTRB(
                        AppSpacing.sm,
                        0,
                        AppSpacing.sm,
                        AppSpacing.sm,
                      ),
                      child: Column(children: children),
                    )
                  : const SizedBox(width: double.infinity),
            ),
          ],
        ),
      ),
    );
  }
}

class _LeafTile extends StatelessWidget {
  const _LeafTile({
    required this.label,
    required this.selected,
    required this.onTap,
    this.caption,
    this.icon,
    this.dense = false,
  });

  final String label;
  final String? caption;
  final IconData? icon;
  final bool selected;
  final bool dense;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final motion = context.reduceMotion ? Duration.zero : AppMotion.stateChange;
    return Semantics(
      button: true,
      selected: selected,
      label: [label, if (caption != null) caption!].join(', '),
      excludeSemantics: true,
      child: AppPressable(
        onTap: onTap,
        child: AnimatedContainer(
          duration: motion,
          curve: AppMotion.enterCurve,
          constraints: const BoxConstraints(minHeight: AppSizes.hitTarget),
          padding: EdgeInsets.symmetric(
            horizontal: AppSpacing.md,
            vertical: dense ? AppSpacing.sm : AppSpacing.md,
          ),
          decoration: BoxDecoration(
            color: selected
                ? colors.goldTint
                : (dense ? Colors.transparent : colors.surface),
            borderRadius: BorderRadius.circular(AppRadii.field),
            border: dense
                ? null
                : Border.all(
                    color: selected ? colors.gold : colors.border,
                    width: selected ? 1.5 : 1),
          ),
          child: Row(
            children: [
              if (icon != null) ...[
                Icon(icon, color: colors.goldDark, size: AppSizes.iconSm),
                const SizedBox(width: AppSpacing.md),
              ],
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(label,
                        style: typography.body.copyWith(color: colors.text)),
                    if (caption != null)
                      Text(caption!,
                          style: typography.caption
                              .copyWith(color: colors.textSecondary)),
                  ],
                ),
              ),
              AnimatedScale(
                scale: selected ? 1 : 0.6,
                duration: context.reduceMotion
                    ? Duration.zero
                    : AppMotion.roleCardCheckmark,
                child: AnimatedOpacity(
                  opacity: selected ? 1 : 0,
                  duration: context.reduceMotion
                      ? Duration.zero
                      : AppMotion.roleCardCheckmark,
                  child: Container(
                    width: AppSizes.iconSm,
                    height: AppSizes.iconSm,
                    decoration: BoxDecoration(
                        color: colors.gold, shape: BoxShape.circle),
                    child: Icon(Icons.check_rounded,
                        size: AppSpacing.md + 1, color: colors.navy),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// --- Step 2: essence --------------------------------------------------------

class EssenceStep extends ConsumerStatefulWidget {
  const EssenceStep({
    required this.draft,
    required this.onChange,
    this.contactError,
    this.footer,
    super.key,
  });

  final CaseDraft draft;
  final DraftChange onChange;

  /// OQ-031: the create wizard puts the photo picker here.
  final Widget? footer;

  /// CASE_CONTAINS_CONTACT_INFO text from the last publish attempt.
  final String? contactError;

  @override
  ConsumerState<EssenceStep> createState() => _EssenceStepState();
}

class _EssenceStepState extends ConsumerState<EssenceStep> {
  late final _title = TextEditingController(text: widget.draft.title);
  late final _description =
      TextEditingController(text: widget.draft.description);
  bool _touchedTitle = false;
  bool _touchedDescription = false;

  @override
  void dispose() {
    _title.dispose();
    _description.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final d = widget.draft;
    return ListView(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenSide,
        AppSpacing.lg,
        AppSpacing.screenSide,
        AppSpacing.xxl,
      ),
      children: [
        WizardHeading(
          title: t.t('cases.create.essence.title'),
          subtitle: t.t('cases.create.essence.subtitle'),
        ),
        AppTextField(
          controller: _title,
          label: t.t('cases.field.title'),
          hintText: t.t('cases.field.titleHint'),
          maxLength: CaseLimits.titleMax,
          textCapitalization: TextCapitalization.sentences,
          textInputAction: TextInputAction.next,
          errorText: _touchedTitle && !d.titleValid
              ? t.t('cases.field.titleError', {
                  'min': '${CaseLimits.titleMin}',
                  'max': '${CaseLimits.titleMax}',
                })
              : null,
          onChanged: (v) {
            _touchedTitle = true;
            widget.onChange((x) => x.copyWith(title: v));
          },
        ),
        const SizedBox(height: AppSpacing.lg),
        AppTextField(
          controller: _description,
          label: t.t('cases.field.description'),
          hintText: t.t('cases.field.descriptionHint'),
          helperText: t.t('cases.field.noContacts'),
          maxLines: 8,
          maxLength: CaseLimits.descriptionMax,
          textCapitalization: TextCapitalization.sentences,
          errorText: widget.contactError ??
              (_touchedDescription && !d.descriptionValid
                  ? t.t('cases.field.descriptionError', {
                      'min': '${CaseLimits.descriptionMin}',
                    })
                  : null),
          onChanged: (v) {
            _touchedDescription = true;
            widget.onChange((x) => x.copyWith(description: v));
          },
        ),
        if (widget.footer != null) ...[
          const SizedBox(height: AppSpacing.lg),
          widget.footer!,
        ],
      ],
    );
  }
}

// --- Step 3: place ----------------------------------------------------------

String stateName(String code) =>
    kUsStates.where((s) => s.code == code).map((s) => s.name).firstOrNull ??
    code;

/// Searchable state list in a sheet (50 states + DC).
Future<String?> pickState(
  BuildContext context,
  Translator t, {
  Set<String> exclude = const {},
}) =>
    showAppBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      builder: (context) => _StatePickerSheet(t: t, exclude: exclude),
    );

class _StatePickerSheet extends StatefulWidget {
  const _StatePickerSheet({required this.t, required this.exclude});

  final Translator t;
  final Set<String> exclude;

  @override
  State<_StatePickerSheet> createState() => _StatePickerSheetState();
}

class _StatePickerSheetState extends State<_StatePickerSheet> {
  String _q = '';

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final q = _q.trim().toLowerCase();
    final list = [
      for (final s in kUsStates)
        if (!widget.exclude.contains(s.code) &&
            (q.isEmpty ||
                s.name.toLowerCase().contains(q) ||
                s.code.toLowerCase() == q))
          s,
    ];
    return SafeArea(
      child: SizedBox(
        height: MediaQuery.sizeOf(context).height * 0.8,
        child: Padding(
          padding: EdgeInsets.fromLTRB(
            AppSpacing.screenSide,
            AppSpacing.md,
            AppSpacing.screenSide,
            MediaQuery.viewInsetsOf(context).bottom,
          ),
          child: Column(
            children: [
              const AppSheetHandle(),
              const SizedBox(height: AppSpacing.lg),
              AppTextField(
                label: widget.t.t('cases.field.state'),
                hintText: widget.t.t('cases.field.stateSearch'),
                leading: const Icon(Icons.search_rounded),
                autofocus: true,
                onChanged: (v) => setState(() => _q = v),
              ),
              const SizedBox(height: AppSpacing.sm),
              Expanded(
                child: ListView.builder(
                  itemCount: list.length,
                  itemBuilder: (context, i) {
                    final s = list[i];
                    return Semantics(
                      button: true,
                      label: s.name,
                      excludeSemantics: true,
                      child: AppPressable(
                        onTap: () => Navigator.of(context).pop(s.code),
                        child: ConstrainedBox(
                          constraints: const BoxConstraints(
                              minHeight: AppSizes.hitTarget),
                          child: Row(
                            children: [
                              SizedBox(
                                width: AppSpacing.xxl + AppSpacing.sm,
                                child: Text(
                                  s.code,
                                  style: typography.bodySmall.copyWith(
                                    color: colors.goldDark,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                              Expanded(
                                child: Text(s.name,
                                    style: typography.body
                                        .copyWith(color: colors.text)),
                              ),
                            ],
                          ),
                        ),
                      ),
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// A tappable "field" showing a picked value (state selector).
class PickerField extends StatelessWidget {
  const PickerField({
    required this.label,
    required this.value,
    required this.onTap,
    this.enabled = true,
    this.helper,
    super.key,
  });

  final String label;
  final String? value;
  final VoidCallback onTap;
  final bool enabled;
  final String? helper;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return Opacity(
      opacity: enabled ? 1 : AppSizes.disabledOpacity,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label,
              style:
                  typography.bodySmall.copyWith(color: colors.textSecondary)),
          const SizedBox(height: AppSpacing.xs + 2),
          Semantics(
            button: true,
            enabled: enabled,
            label: '$label: ${value ?? ''}',
            excludeSemantics: true,
            child: AppPressable(
              onTap: enabled ? onTap : null,
              child: Container(
                height: 52,
                padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
                decoration: BoxDecoration(
                  color: colors.surface,
                  borderRadius: BorderRadius.circular(AppRadii.field),
                  border: Border.all(color: colors.border),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        value ?? '',
                        style: typography.body
                            .copyWith(color: colors.text, fontSize: 16),
                      ),
                    ),
                    Icon(Icons.expand_more_rounded,
                        color: colors.textSecondary),
                  ],
                ),
              ),
            ),
          ),
          if (helper != null) ...[
            const SizedBox(height: AppSpacing.xs),
            Text(helper!,
                style:
                    typography.caption.copyWith(color: colors.textSecondary)),
          ],
        ],
      ),
    );
  }
}

class PlaceStep extends ConsumerStatefulWidget {
  const PlaceStep({
    required this.draft,
    required this.onChange,
    this.statesLocked = false,
    super.key,
  });

  final CaseDraft draft;
  final DraftChange onChange;

  /// §3.5: states can't change once the case has bids.
  final bool statesLocked;

  @override
  ConsumerState<PlaceStep> createState() => _PlaceStepState();
}

class _PlaceStepState extends ConsumerState<PlaceStep> {
  late final _city = TextEditingController(text: widget.draft.city);

  @override
  void dispose() {
    _city.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final d = widget.draft;
    final locked = widget.statesLocked;
    Set<String> taken() => {
          if (d.primaryStateCode != null) d.primaryStateCode!,
          ...d.additionalStateCodes,
        };
    return ListView(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenSide,
        AppSpacing.lg,
        AppSpacing.screenSide,
        AppSpacing.xxl,
      ),
      children: [
        WizardHeading(
          title: t.t('cases.create.place.title'),
          subtitle: t.t('cases.create.place.subtitle'),
        ),
        PickerField(
          label: t.t('cases.field.primaryState'),
          value: d.primaryStateCode == null
              ? null
              : stateName(d.primaryStateCode!),
          enabled: !locked,
          helper: locked ? t.t('cases.edit.statesLocked') : null,
          onTap: () async {
            final code = await pickState(context, t,
                exclude: d.additionalStateCodes.toSet());
            if (code != null)
              widget.onChange((x) => x.copyWith(primaryStateCode: code));
          },
        ),
        const SizedBox(height: AppSpacing.lg),
        AppTextField(
          controller: _city,
          label: t.t('cases.field.city'),
          hintText: t.t('cases.field.cityHint'),
          maxLength: CaseLimits.cityMax,
          textCapitalization: TextCapitalization.words,
          onChanged: (v) => widget.onChange((x) => x.copyWith(city: v)),
        ),
        const SizedBox(height: AppSpacing.lg),
        Wrap(
          spacing: AppSpacing.sm,
          runSpacing: AppSpacing.sm,
          children: [
            for (final code in d.additionalStateCodes)
              AppChip(
                label: stateName(code),
                selected: true,
                trailing: locked
                    ? null
                    : Icon(Icons.close_rounded,
                        size: AppSpacing.lg, color: colors.textSecondary),
                onTap: locked
                    ? null
                    : () => widget.onChange(
                          (x) => x.copyWith(
                            additionalStateCodes: [
                              for (final s in x.additionalStateCodes)
                                if (s != code) s,
                            ],
                          ),
                        ),
              ),
            if (!locked &&
                d.additionalStateCodes.length < CaseLimits.maxAdditionalStates)
              AppChip(
                label: t.t('cases.field.addState'),
                leading: Icon(Icons.add_rounded,
                    size: AppSpacing.lg, color: colors.goldDark),
                onTap: () async {
                  final code = await pickState(context, t, exclude: taken());
                  if (code != null) {
                    widget.onChange(
                      (x) => x.copyWith(additionalStateCodes: [
                        ...x.additionalStateCodes,
                        code
                      ]),
                    );
                  }
                },
              ),
          ],
        ),
      ],
    );
  }
}

// --- Step 4: budget ---------------------------------------------------------

class BudgetStep extends ConsumerStatefulWidget {
  const BudgetStep({required this.draft, required this.onChange, super.key});

  final CaseDraft draft;
  final DraftChange onChange;

  @override
  ConsumerState<BudgetStep> createState() => _BudgetStepState();
}

class _BudgetStepState extends ConsumerState<BudgetStep> {
  late final _amount = TextEditingController(
    text: widget.draft.budgetDollars?.toString() ?? '',
  );

  @override
  void dispose() {
    _amount.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final d = widget.draft;
    return ListView(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenSide,
        AppSpacing.lg,
        AppSpacing.screenSide,
        AppSpacing.xxl,
      ),
      children: [
        WizardHeading(
          title: t.t('cases.create.budget.title'),
          subtitle: t.t('cases.create.budget.subtitle'),
        ),
        SegmentedChoice<bool>(
          value: d.budgetIsAmount,
          options: [
            (true, t.t('cases.budget.specify')),
            (false, t.t('cases.budget.clarifyLater')),
          ],
          onChanged: (v) =>
              widget.onChange((x) => x.copyWith(budgetIsAmount: v)),
        ),
        const SizedBox(height: AppSpacing.xl),
        AnimatedSwitcher(
          duration:
              context.reduceMotion ? Duration.zero : AppMotion.stateChange,
          child: d.budgetIsAmount
              ? AppTextField(
                  key: const ValueKey('amount'),
                  controller: _amount,
                  label: t.t('cases.field.budgetAmount'),
                  hintText: '600',
                  leading: Text('\$',
                      style: typography.titleMedium
                          .copyWith(color: colors.goldDark)),
                  keyboardType: TextInputType.number,
                  inputFormatters: [
                    FilteringTextInputFormatter.digitsOnly,
                    LengthLimitingTextInputFormatter(8),
                  ],
                  errorText: _amount.text.isNotEmpty && !d.budgetValid
                      ? t.t('cases.field.budgetError', {
                          'max': CaseFormat.money(
                              ref.watch(l10nFormatsProvider),
                              CaseLimits.budgetMaxDollars * 100),
                        })
                      : null,
                  onChanged: (v) {
                    final n = int.tryParse(v);
                    widget.onChange(
                      (x) => n == null
                          ? x.copyWith(clearBudgetDollars: true)
                          : x.copyWith(budgetDollars: n),
                    );
                  },
                )
              : Container(
                  key: const ValueKey('later'),
                  padding: const EdgeInsets.all(AppSpacing.lg),
                  decoration: BoxDecoration(
                    color: colors.goldTint,
                    borderRadius: BorderRadius.circular(AppRadii.card),
                  ),
                  child: Row(
                    children: [
                      Icon(Icons.forum_outlined, color: colors.goldDark),
                      const SizedBox(width: AppSpacing.md),
                      Expanded(
                        child: Text(
                          t.t('cases.create.budget.laterHint'),
                          style:
                              typography.bodySmall.copyWith(color: colors.text),
                        ),
                      ),
                    ],
                  ),
                ),
        ),
      ],
    );
  }
}

/// Two-to-three option segmented control with a sliding gold-edged pill.
class SegmentedChoice<T> extends StatelessWidget {
  const SegmentedChoice({
    required this.value,
    required this.options,
    required this.onChanged,
    super.key,
  });

  final T value;
  final List<(T, String)> options;
  final ValueChanged<T> onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final index = options.indexWhere((o) => o.$1 == value);
    final motion = context.reduceMotion ? Duration.zero : AppMotion.stateChange;
    return Container(
      padding: const EdgeInsets.all(AppSpacing.xs),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(AppRadii.button),
        border: Border.all(color: colors.border),
      ),
      child: LayoutBuilder(
        builder: (context, box) {
          final w = box.maxWidth / options.length;
          return Stack(
            children: [
              AnimatedPositioned(
                duration: motion,
                curve: AppMotion.enterCurve,
                left: w * (index < 0 ? 0 : index),
                top: 0,
                bottom: 0,
                width: w,
                child: Container(
                  decoration: BoxDecoration(
                    color: colors.accent,
                    borderRadius: BorderRadius.circular(AppRadii.field),
                  ),
                ),
              ),
              Row(
                children: [
                  for (var i = 0; i < options.length; i++)
                    Expanded(
                      child: Semantics(
                        button: true,
                        selected: i == index,
                        label: options[i].$2,
                        excludeSemantics: true,
                        child: GestureDetector(
                          behavior: HitTestBehavior.opaque,
                          onTap: () => onChanged(options[i].$1),
                          child: ConstrainedBox(
                            constraints: const BoxConstraints(
                                minHeight: AppSizes.touchTarget),
                            child: Center(
                              child: AnimatedDefaultTextStyle(
                                duration: motion,
                                style: typography.button.copyWith(
                                  color: i == index
                                      ? colors.onAccent
                                      : colors.textSecondary,
                                ),
                                child: Text(
                                  options[i].$2,
                                  textAlign: TextAlign.center,
                                  maxLines: 2,
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ],
          );
        },
      ),
    );
  }
}
