import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/addresses/address_field.dart';
import 'package:lawbid/core/addresses/address_suggestions.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/cases/domain/case_draft.dart';
import 'package:lawbid/features/cases/domain/contingency.dart';
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_format.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_urgency_picker.dart';
import 'package:lawbid/features/onboarding/domain/us_states.dart';
import 'package:lawbid/features/practice/practice_matches.dart';
import 'package:lawbid/features/practice/practice_options.dart';
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
          child: Text(
            title,
            style: typography.titleMedium.copyWith(color: colors.text),
          ),
        ),
        const SizedBox(height: AppSpacing.xs),
        Text(
          subtitle,
          style: typography.bodySmall.copyWith(color: colors.textSecondary),
        ),
        const SizedBox(height: AppSpacing.lg),
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
  // Owner 2026-10-15: every group opens and closes on its own arrow; the
  // group of a chosen topic starts open.
  final Set<String> _open = {};
  bool _seeded = false;

  /// Owner 2026-10-15: up to this many topics (admin: `case.max_practices`).
  int get _max => ref
      .read(featureFlagsControllerProvider)
      .configInt('case.max_practices', 3);

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  // Local matcher: no debounce needed (owner 2026-10-28).
  void _onQuery(String v) => setState(() => _query = v);

  bool _isChosen(String id) =>
      widget.draft.practiceAreaId == id ||
      widget.draft.extraPractices.any((p) => p.id == id);

  /// Owner 2026-10-15: a second tap takes a topic off; up to [_max] topics;
  /// «Not sure» excludes the others (and they it).
  void _toggle(PracticeLeaf leaf, {bool notSure = false}) {
    final d = widget.draft;
    var all = <CaseDraftPractice>[
      if (d.practiceAreaId != null)
        CaseDraftPractice(
          id: d.practiceAreaId!,
          i18nKey: d.practiceI18nKey ?? '',
          nameEn: d.practiceNameEn ?? '',
          code: d.practiceCode,
        ),
      ...d.extraPractices,
    ];
    if (all.any((p) => p.id == leaf.id)) {
      all = [
        for (final p in all)
          if (p.id != leaf.id) p,
      ];
    } else {
      final pick = CaseDraftPractice(
        id: leaf.id,
        i18nKey: leaf.i18nKey,
        nameEn: leaf.nameEn,
        code: leaf.code,
      );
      if (notSure) {
        all = [pick];
      } else {
        // «Not sure» is not a topic to combine with others.
        all = [
          for (final p in all)
            if (!p.i18nKey.endsWith('not_sure_or_other')) p,
        ];
        if (all.length >= _max) {
          showAppSnackBar(
            context,
            ref
                .read(translatorProvider)
                .t('cases.create.practice.upTo', {'n': '$_max'}),
          );
          return;
        }
        all = [...all, pick];
      }
    }
    widget.onChange(
      (d) => all.isEmpty
          ? d.copyWith(clearPractice: true, extraPractices: const [])
          : d.copyWith(
              practiceAreaId: all.first.id,
              practiceI18nKey: all.first.i18nKey,
              practiceNameEn: all.first.nameEn,
              practiceCode: all.first.code,
              extraPractices: all.skip(1).toList(),
            ),
    );
  }

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
        if (!_seeded) {
          _seeded = true;
          for (final c in categories) {
            if (c.children.any((l) => _isChosen(l.id))) _open.add(c.id);
          }
        }
        final q = _query.trim().toLowerCase();
        final notSure = [
          for (final c in categories)
            for (final l in c.children)
              if (l.i18nKey.endsWith('not_sure_or_other')) l,
        ].firstOrNull;
        // Owner 2026-10-28: one local matcher (practice_search.dart) — the
        // name in the app's language or English, everyday words («развод»,
        // «ДТП», «DUI»), one typo — best first; a category's hit lists its
        // sub-areas. No server call.
        final ranked = q.isEmpty
            ? null
            : ref.watch(practiceMatchesProvider(_query.trim()));
        final leafByCode = {
          for (final c in categories)
            for (final l in c.children)
              (l.code ?? practiceCodeOf(l.i18nKey)): (c, l),
        };
        final categoryByCode = {
          for (final c in categories) practiceCodeOf(c.i18nKey): c,
        };
        final matches = <(PracticeCategory, PracticeLeaf)>[];
        final seen = <String>{};
        for (final code in ranked?.value?.keys ?? const <String>[]) {
          final leaf = leafByCode[code];
          if (leaf != null) {
            if (seen.add(leaf.$2.id)) matches.add(leaf);
            continue;
          }
          final c = categoryByCode[code];
          for (final l in c?.children ?? const <PracticeLeaf>[]) {
            if (seen.add(l.id)) matches.add((c!, l));
          }
        }
        final searching = ranked != null && !ranked.hasValue;
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
            // Owner 2026-10-15: how many topics fit.
            Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.md),
              child: Text(
                t.t('cases.create.practice.upTo', {'n': '$_max'}),
                key: const ValueKey('practice-up-to'),
                style: Theme.of(context)
                    .extension<AppTypographyTokens>()!
                    .caption
                    .copyWith(
                      color: Theme.of(context)
                          .extension<AppColorTokens>()!
                          .textSecondary,
                    ),
              ),
            ),
            AppTextField(
              compact: true,
              controller: _search,
              label: t.t('cases.create.practice.search'),
              hintText: t.t('cases.create.practice.searchHint'),
              leading: const AppIcon(AppIcons.searchRounded),
              textInputAction: TextInputAction.search,
              onChanged: _onQuery,
            ),
            const SizedBox(height: AppSpacing.lg),
            if (notSure != null && q.isEmpty) ...[
              _LeafTile(
                label: t.t('cases.create.practice.notSure'),
                caption: t.t('cases.create.practice.notSureHint'),
                icon: AppIcons.helpOutlineRounded,
                selected: _isChosen(notSure.id),
                onTap: () => _toggle(notSure, notSure: true),
              ),
              const SizedBox(height: AppSpacing.lg),
            ],
            // Owner 2026-10-19: the icon above the text, both centred (the
            // full-screen empty state overlapped them inside this list).
            if (q.isNotEmpty && matches.isEmpty && !searching)
              Padding(
                key: const ValueKey('practice-no-match'),
                padding: const EdgeInsets.symmetric(vertical: AppSpacing.xl),
                child: Column(
                  children: [
                    AppIcon(
                      AppIcons.searchOffRounded,
                      size: 40,
                      color: Theme.of(context)
                          .extension<AppColorTokens>()!
                          .textSecondary,
                    ),
                    const SizedBox(height: AppSpacing.md),
                    Text(
                      t.t('cases.create.practice.noMatch'),
                      textAlign: TextAlign.center,
                      style: Theme.of(context)
                          .extension<AppTypographyTokens>()!
                          .body
                          .copyWith(
                            color: Theme.of(context)
                                .extension<AppColorTokens>()!
                                .textSecondary,
                          ),
                    ),
                  ],
                ),
              ),
            if (q.isNotEmpty)
              for (final (c, l) in matches)
                Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                  child: _LeafTile(
                    label: name(l.i18nKey, l.nameEn),
                    // The sub-area under its group (owner 2026-10-28).
                    caption: name(c.i18nKey, c.nameEn),
                    selected: _isChosen(l.id),
                    onTap: () => _toggle(l),
                  ),
                )
            else
              for (final c in categories)
                _CategoryTile(
                  label: name(c.i18nKey, c.nameEn),
                  open: _open.contains(c.id),
                  onToggle: () => setState(
                    () => _open.contains(c.id)
                        ? _open.remove(c.id)
                        : _open.add(c.id),
                  ),
                  children: [
                    for (final l in c.children)
                      _LeafTile(
                        label: name(l.i18nKey, l.nameEn),
                        selected: _isChosen(l.id),
                        onTap: () => _toggle(l),
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
                    minHeight: AppSizes.hitTarget + AppSpacing.sm,
                  ),
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
                    width: selected ? 1.5 : 1,
                  ),
          ),
          child: Row(
            children: [
              if (icon != null) ...[
                AppIcon(icon, color: colors.iconTint, size: AppSizes.iconSm),
                const SizedBox(width: AppSpacing.md),
              ],
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      label,
                      style: typography.body.copyWith(color: colors.text),
                    ),
                    if (caption != null)
                      Text(
                        caption!,
                        style: typography.caption
                            .copyWith(color: colors.textSecondary),
                      ),
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
                      color: colors.gold,
                      shape: BoxShape.circle,
                    ),
                    child: AppIcon(
                      AppIcons.checkRounded,
                      size: AppSpacing.md + 1,
                      color: colors.navy,
                    ),
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
  late final _details =
      TextEditingController(text: widget.draft.privateDetails);
  bool _touchedTitle = false;
  bool _touchedDescription = false;

  @override
  void dispose() {
    _title.dispose();
    _description.dispose();
    _details.dispose();
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
        // Owner 2026-10-18: two blocks — what every attorney sees, and what
        // only the accepted attorney sees.
        _StepBlock(
          key: const ValueKey('case-public-block'),
          icon: AppIcons.visibilityOutlined,
          title: t.t('cases.block.public.title'),
          note: t.t('cases.block.public.note'),
          children: [
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
              label: t.t('cases.field.brief'),
              hintText: t.t('cases.field.briefHint'),
              helperText: t.t('cases.field.noContacts'),
              tapAnywhere: true,
              maxLines: 6,
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
          ],
        ),
        const SizedBox(height: AppSpacing.lg),
        _StepBlock(
          key: const ValueKey('case-private-block'),
          icon: AppIcons.lockOutlineRounded,
          title: t.t('cases.block.private.title'),
          children: [
            AppTextField(
              controller: _details,
              label: t.t('cases.field.privateDetails'),
              hintText: t.t('cases.field.privateDetailsHint'),
              tapAnywhere: true,
              maxLines: 6,
              maxLength: CaseLimits.privateDetailsMax,
              textCapitalization: TextCapitalization.sentences,
              onChanged: (v) =>
                  widget.onChange((x) => x.copyWith(privateDetails: v)),
            ),
            if (widget.footer != null) ...[
              const SizedBox(height: AppSpacing.lg),
              widget.footer!,
            ],
            const SizedBox(height: AppSpacing.md),
            Text(
              t.t('cases.block.private.footer'),
              style: Theme.of(context)
                  .extension<AppTypographyTokens>()!
                  .caption
                  .copyWith(
                    color: Theme.of(context)
                        .extension<AppColorTokens>()!
                        .textSecondary,
                  ),
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.lg),
        Text(
          t.t('cases.visibility.legal'),
          key: const ValueKey('case-legal-notice'),
          textAlign: TextAlign.center,
          style: Theme.of(context)
              .extension<AppTypographyTokens>()!
              .caption
              .copyWith(
                color: Theme.of(context)
                    .extension<AppColorTokens>()!
                    .textSecondary,
              ),
        ),
      ],
    );
  }
}

/// A theme-coloured card with a header (icon + title [+ muted note]).
class _StepBlock extends StatelessWidget {
  const _StepBlock({
    required this.icon,
    required this.title,
    required this.children,
    this.note,
    super.key,
  });

  final IconData icon;
  final String title;
  final String? note;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(AppRadii.card),
        border: Border.all(color: colors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Semantics(
            header: true,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                ExcludeSemantics(
                  child: AppIcon(
                    icon,
                    size: AppSizes.iconSm,
                    color: colors.iconTint,
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Text.rich(
                    TextSpan(
                      text: title,
                      style: type.body.copyWith(
                        color: colors.text,
                        fontWeight: FontWeight.w600,
                      ),
                      children: [
                        if (note != null)
                          TextSpan(
                            text: ' $note',
                            style: type.body.copyWith(
                              color: colors.textSecondary,
                              fontWeight: FontWeight.w400,
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          ...children,
        ],
      ),
    );
  }
}

// --- Step 3: place ----------------------------------------------------------

String stateName(String code) =>
    kRegions.where((s) => s.code == code).map((s) => s.name).firstOrNull ??
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
    // Owner 2026-10-18: «Нью-Йорк», "new yrok", "NY" — any alphabet.
    final list = [
      for (final s in kRegions)
        if (!widget.exclude.contains(s.code) && s.matches(_q)) s,
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
                compact: true,
                label: widget.t.t('cases.field.state'),
                hintText: widget.t.t('cases.field.stateSearch'),
                leading: const AppIcon(AppIcons.searchRounded),
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
                            minHeight: AppSizes.hitTarget,
                          ),
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
                                child: Text(
                                  s.name,
                                  style: typography.body
                                      .copyWith(color: colors.text),
                                ),
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
          Text(
            label,
            style: typography.bodySmall.copyWith(color: colors.textSecondary),
          ),
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
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: typography.body
                            .copyWith(color: colors.text, fontSize: 14),
                      ),
                    ),
                    AppIcon(
                      AppIcons.expandMoreRounded,
                      color: colors.textSecondary,
                    ),
                  ],
                ),
              ),
            ),
          ),
          if (helper != null) ...[
            const SizedBox(height: AppSpacing.xs),
            Text(
              helper!,
              style: typography.caption.copyWith(color: colors.textSecondary),
            ),
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
            final code = await pickState(
              context,
              t,
              exclude: d.additionalStateCodes.toSet(),
            );
            if (code != null) {
              widget.onChange((x) => x.copyWith(primaryStateCode: code));
            }
          },
        ),
        const SizedBox(height: AppSpacing.lg),
        // Owner 2026-10-28: US city suggestions while typing.
        AddressField(
          key: const ValueKey('case-city-field'),
          controller: _city,
          kind: AddressKind.city,
          label: t.t('cases.field.city'),
          hintText: t.t('cases.field.cityHint'),
          maxLength: CaseLimits.cityMax,
          autofillHints: const [AutofillHints.addressCity],
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
                    : AppIcon(
                        AppIcons.closeRounded,
                        size: AppSpacing.lg,
                        color: colors.textSecondary,
                      ),
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
                leading: AppIcon(
                  AppIcons.addRounded,
                  size: AppSpacing.lg,
                  color: colors.iconTint,
                ),
                onTap: () async {
                  final code = await pickState(context, t, exclude: taken());
                  if (code != null) {
                    widget.onChange(
                      (x) => x.copyWith(
                        additionalStateCodes: [
                          ...x.additionalStateCodes,
                          code,
                        ],
                      ),
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

/// Owner 2026-10-17: «Сумма», «Проценты», «Уточню позже».
enum _BudgetKind { amount, percent, later }

class _BudgetStepState extends ConsumerState<BudgetStep> {
  late final _amount = TextEditingController(
    text: widget.draft.budgetDollars?.toString() ?? '',
  );
  late final _percent = TextEditingController(
    text: widget.draft.budgetPercentBps == null
        ? ''
        : ContingencyRules.plain(widget.draft.budgetPercentBps!),
  );

  _BudgetKind _kindOf(CaseDraft d) => d.budgetIsPercent
      ? _BudgetKind.percent
      : d.budgetIsAmount
          ? _BudgetKind.amount
          : _BudgetKind.later;

  @override
  void dispose() {
    _amount.dispose();
    _percent.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final d = widget.draft;
    final rules =
        ContingencyRules.of(ref.watch(featureFlagsControllerProvider));
    // Ethics rules forbid a percent for some topics (admin list).
    final percentAllowed = !rules.blockedFor(d.practiceCodes);
    if (!percentAllowed && d.budgetIsPercent) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) {
          widget.onChange(
            (x) => x.copyWith(budgetIsPercent: false, clearBudgetPercent: true),
          );
        }
      });
    }
    final kind = _kindOf(d);
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
        SegmentedChoice<_BudgetKind>(
          value: kind,
          options: [
            (_BudgetKind.amount, t.t('cases.budget.specify')),
            (_BudgetKind.percent, t.t('cases.budget.percent')),
            (_BudgetKind.later, t.t('cases.budget.clarifyLater')),
          ],
          // Owner 2026-10-19: shown greyed with a note, not hidden.
          disabled: {if (!percentAllowed) _BudgetKind.percent},
          onChanged: (v) => widget.onChange(
            (x) => x.copyWith(
              budgetIsAmount: v == _BudgetKind.amount,
              budgetIsPercent: v == _BudgetKind.percent,
            ),
          ),
        ),
        if (!percentAllowed) ...[
          const SizedBox(height: AppSpacing.xs),
          Text(
            t.t('cases.budget.percentForbidden'),
            key: const ValueKey('budget-percent-forbidden'),
            style: typography.caption.copyWith(color: colors.textSecondary),
          ),
        ],
        const SizedBox(height: AppSpacing.xl),
        // Owner 2026-10-18: the three choices share one box as tall as the
        // tallest, so nothing below jumps when switching (they cross-fade).
        _SameHeightSwitch(
          index: kind.index,
          children: [
            AppTextField(
              key: const ValueKey('amount-field'),
              controller: _amount,
              label: t.t('cases.field.budgetAmount'),
              leading: Text(
                r'$',
                style: typography.titleMedium.copyWith(color: colors.goldDark),
              ),
              keyboardType: TextInputType.number,
              inputFormatters: [
                FilteringTextInputFormatter.digitsOnly,
                LengthLimitingTextInputFormatter(8),
              ],
              errorText: _amount.text.isNotEmpty && !d.budgetValid
                  ? t.t('cases.field.budgetError', {
                      'max': CaseFormat.money(
                        ref.watch(l10nFormatsProvider),
                        CaseLimits.budgetMaxDollars * 100,
                      ),
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
            ),
            AppTextField(
              key: const ValueKey('percent'),
              controller: _percent,
              label: t.t('cases.field.budgetPercent'),
              helperText: t.t('cases.create.budget.percentHint'),
              leading: Text(
                '%',
                style: typography.titleMedium.copyWith(color: colors.goldDark),
              ),
              keyboardType:
                  const TextInputType.numberWithOptions(decimal: true),
              inputFormatters: [
                FilteringTextInputFormatter.allow(RegExp('[0-9.,]')),
                LengthLimitingTextInputFormatter(6),
              ],
              errorText:
                  _percent.text.isNotEmpty && rules.parse(_percent.text) == null
                      ? t.t('cases.field.budgetPercentError', {
                          'max': ContingencyRules.plain(rules.maxBps),
                        })
                      : null,
              onChanged: (v) {
                final bps = rules.parse(v);
                widget.onChange(
                  (x) => bps == null
                      ? x.copyWith(clearBudgetPercent: true)
                      : x.copyWith(budgetPercentBps: bps),
                );
              },
            ),
            Container(
              key: const ValueKey('later'),
              padding: const EdgeInsets.all(AppSpacing.lg),
              // Owner 2026-10-18: the theme's own surface.
              decoration: BoxDecoration(
                color: colors.chip,
                borderRadius: BorderRadius.circular(AppRadii.card),
                border: Border.all(color: colors.border),
              ),
              child: Row(
                children: [
                  AppIcon(
                    AppIcons.forumOutlined,
                    color: colors.iconTint,
                  ),
                  const SizedBox(width: AppSpacing.md),
                  Expanded(
                    child: Text(
                      t.t('cases.create.budget.laterHint'),
                      style: typography.bodySmall.copyWith(color: colors.text),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        // Owner 2026-10-04: shown large on the attorney's card.
        const SizedBox(height: AppSpacing.xl),
        Text(
          t.t('cases.create.urgency.title'),
          style: typography.body.copyWith(
            color: colors.text,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: AppSpacing.sm),
        // Owner 2026-10-05: a level, or a concrete date (court hearing…).
        CaseUrgencyPicker(
          value: CaseUrgencyChoice.ofDraft(d),
          onChanged: (v) => widget.onChange(v.applyTo),
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
    this.disabled = const {},
    super.key,
  });

  final T value;
  final List<(T, String)> options;
  final ValueChanged<T> onChanged;

  /// Options shown greyed that cannot be picked.
  final Set<T> disabled;

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
              // Directional so the pill tracks the Row's order in RTL.
              AnimatedPositionedDirectional(
                duration: motion,
                curve: AppMotion.enterCurve,
                start: w * (index < 0 ? 0 : index),
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
                        enabled: !disabled.contains(options[i].$1),
                        label: options[i].$2,
                        excludeSemantics: true,
                        child: GestureDetector(
                          behavior: HitTestBehavior.opaque,
                          onTap: disabled.contains(options[i].$1)
                              ? null
                              : () => onChanged(options[i].$1),
                          child: ConstrainedBox(
                            constraints: const BoxConstraints(
                              minHeight: AppSizes.touchTarget,
                            ),
                            child: Center(
                              child: Padding(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: AppSpacing.xs,
                                ),
                                child: AnimatedDefaultTextStyle(
                                  duration: motion,
                                  style: typography.button.copyWith(
                                    color: i == index
                                        ? colors.onAccent
                                        : disabled.contains(options[i].$1)
                                            ? colors.textSecondary
                                                .withValues(alpha: 0.4)
                                            : colors.textSecondary,
                                  ),
                                  child: Text(
                                    options[i].$2,
                                    textAlign: TextAlign.center,
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                  ),
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

/// Owner 2026-10-18: shows [children] one at a time in a box as tall as
/// the tallest of them (a Stack sizes to its largest child), cross-fading
/// between them — the content below never moves. Hidden ones take no
/// taps, focus or screen-reader time.
class _SameHeightSwitch extends StatelessWidget {
  const _SameHeightSwitch({required this.index, required this.children});

  final int index;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final fade = context.reduceMotion ? Duration.zero : AppMotion.stateChange;
    return Stack(
      children: [
        for (var i = 0; i < children.length; i++)
          IgnorePointer(
            ignoring: i != index,
            child: ExcludeFocus(
              excluding: i != index,
              child: ExcludeSemantics(
                excluding: i != index,
                child: AnimatedOpacity(
                  opacity: i == index ? 1 : 0,
                  duration: fade,
                  child: children[i],
                ),
              ),
            ),
          ),
      ],
    );
  }
}
