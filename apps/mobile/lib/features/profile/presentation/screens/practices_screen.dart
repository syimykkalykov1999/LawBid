import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/chat/chat_routes.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/profile/application/profile_providers.dart';
import 'package:lawbid/features/profile/domain/profile_models.dart';

/// Tree + current selection, loaded together for the editor.
typedef PracticesData = ({
  List<PracticeCategory> tree,
  List<SelectedPractice> selected
});

final practicesEditorDataProvider = FutureProvider.autoDispose<PracticesData>(
  (ref) async {
    final results = await Future.wait<Object>([
      ref.watch(practiceTreeProvider.future),
      ref.watch(practicesRepositoryProvider).fetchSelected(),
    ]);
    return (
      tree: results[0] as List<PracticeCategory>,
      selected: results[1] as List<SelectedPractice>,
    );
  },
  retry: (_, __) => null,
);

/// "My practices" (docs/03 §3.2): search by name, categories that expand,
/// "Select all" per category, leaves with checkboxes, the picked ones as
/// chips on top, "Save" = `PUT /attorneys/me/practice-areas` with the
/// full set of leaf ids. Before verification the screen is locked with an
/// explanation (§3.2 «Доступно после верификации»).
class PracticesScreen extends ConsumerWidget {
  const PracticesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final t = ref.watch(translatorProvider);
    final locked = ref.watch(attorneyNeedsVerificationProvider);

    Widget body;
    if (locked) {
      body = AppEmptyState(
        key: const ValueKey('locked'),
        icon: AppIcons.lockOutlineRounded,
        title: t.t('practices.locked.title'),
        message: t.t('practices.locked.body'),
        action: AppButton(
          label: t.t('gate.verify.cta'),
          height: AppSizes.touchTarget,
          onPressed: () => context.push(AppRoutes.verification),
        ),
      );
    } else {
      final data = ref.watch(practicesEditorDataProvider);
      void retry() {
        ref
          ..invalidate(practiceTreeProvider)
          ..invalidate(practicesEditorDataProvider);
      }

      body = data.when(
        loading: () => const _PracticesSkeleton(key: ValueKey('loading')),
        error: (error, _) => isOfflineError(error)
            ? AppOfflineState(
                key: const ValueKey('offline'),
                title: t.t('offline.title'),
                message: t.t('offline.message'),
                action: AppButton(
                  label: t.t('error.retry'),
                  icon: AppIcons.refreshRounded,
                  variant: AppButtonVariant.secondary,
                  height: AppSizes.touchTarget,
                  onPressed: retry,
                ),
              )
            : AppErrorState(
                key: const ValueKey('error'),
                message: t.t('practices.error'),
                retryLabel: t.t('error.retry'),
                onRetry: retry,
              ),
        data: (d) => d.tree.isEmpty
            ? AppEmptyState(
                key: const ValueKey('empty'),
                icon: AppIcons.gavelRounded,
                message: t.t('practices.emptyTree'),
              )
            : PracticesEditor(
                key: const ValueKey('editor'),
                tree: d.tree,
                initial: d.selected),
      );
    }

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        title: Text(t.t('practices.title')),
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
      ),
      body: AnimatedSwitcher(
        duration: context.reduceMotion ? Duration.zero : AppMotion.stateChange,
        child: body,
      ),
    );
  }
}

class PracticesEditor extends ConsumerStatefulWidget {
  const PracticesEditor({required this.tree, required this.initial, super.key});

  final List<PracticeCategory> tree;
  final List<SelectedPractice> initial;

  @override
  ConsumerState<PracticesEditor> createState() => _PracticesEditorState();
}

class _PracticesEditorState extends ConsumerState<PracticesEditor> {
  final _search = TextEditingController();
  late Set<String> _saved = {for (final p in widget.initial) p.id};
  late Set<String> _selected = {..._saved};
  final Set<String> _expanded = {};
  bool _saving = false;

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  bool get _dirty =>
      _selected.length != _saved.length || !_selected.containsAll(_saved);

  Future<void> _save(Translator t) async {
    if (_saving || !_dirty) return;
    setState(() => _saving = true);
    try {
      final saved = await ref
          .read(practicesRepositoryProvider)
          .replace(_selected.toList());
      if (!mounted) return;
      setState(() {
        _saved = {for (final p in saved) p.id};
        _selected = {..._saved};
      });
      final username = ref
          .read(currentUserControllerProvider)
          .user
          ?.attorneyProfile
          ?.username;
      if (username != null)
        ref.invalidate(publicAttorneyProfileProvider(username));
      showAppSnackBar(context, t.t('practices.saved'));
    } catch (e) {
      if (mounted) showAppSnackBar(context, errorText(t, e));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _toggle(String id) => setState(() {
        if (!_selected.remove(id)) _selected.add(id);
      });

  void _toggleAll(PracticeCategory c) => setState(() {
        final ids = c.children.map((l) => l.id);
        if (ids.every(_selected.contains)) {
          _selected.removeAll(ids);
        } else {
          _selected.addAll(ids);
        }
      });

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final t = ref.watch(translatorProvider);
    final query = _search.text.trim().toLowerCase();

    String leafName(PracticeLeaf l) => localizedName(t, l.i18nKey, l.nameEn);
    String catName(PracticeCategory c) => localizedName(t, c.i18nKey, c.nameEn);

    // Search: a category matches as a whole, otherwise its matching leaves.
    final visible = <(PracticeCategory, List<PracticeLeaf>)>[];
    for (final c in widget.tree) {
      if (query.isEmpty || catName(c).toLowerCase().contains(query)) {
        visible.add((c, c.children));
      } else {
        final leaves = c.children
            .where((l) => leafName(l).toLowerCase().contains(query))
            .toList();
        if (leaves.isNotEmpty) visible.add((c, leaves));
      }
    }

    final leafById = {
      for (final c in widget.tree)
        for (final l in c.children) l.id: l
    };
    final selectedLeaves = [
      for (final id in _selected)
        if (leafById[id] != null) leafById[id]!,
    ]..sort((a, b) => leafName(a).compareTo(leafName(b)));

    final list = ListView(
      padding: const EdgeInsets.fromLTRB(AppSpacing.screenSide, AppSpacing.sm,
          AppSpacing.screenSide, AppSpacing.xxl),
      children: [
        Text(t.t('practices.intro'),
            style: typography.body.copyWith(color: colors.textSecondary)),
        // Owner 2026-10-01: these qualifications also decide which new
        // cases reach the notifications — and that it can be changed.
        const SizedBox(height: AppSpacing.md),
        Container(
          key: const ValueKey('practices-alerts-hint'),
          padding: const EdgeInsets.all(AppSpacing.md),
          decoration: BoxDecoration(
            color: colors.goldTint,
            borderRadius: BorderRadius.circular(AppRadii.field),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              AppIcon(AppIcons.notificationsActiveOutlined,
                  size: AppSizes.iconSm, color: colors.goldDark),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(t.t('practices.alertsHint'),
                        style:
                            typography.bodySmall.copyWith(color: colors.text)),
                    GestureDetector(
                      onTap: () => context.push(ChatRoutes.notificationSettings),
                      child: Padding(
                        padding: const EdgeInsets.only(top: AppSpacing.xs),
                        child: Text(
                          t.t('practices.alertsLink'),
                          style: typography.bodySmall.copyWith(
                            color: colors.goldDark,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.lg),
        AppTextField(
          controller: _search,
          hintText: t.t('practices.search'),
          semanticLabel: t.t('practices.search'),
          leading: AppIcon(AppIcons.searchRounded,
              color: colors.textSecondary, size: AppSizes.iconSm),
          textInputAction: TextInputAction.search,
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: AppSpacing.lg),
        _SelectedChips(
          leaves: selectedLeaves,
          nameOf: leafName,
          onRemove: _toggle,
          t: t,
        ),
        const SizedBox(height: AppSpacing.lg),
        if (visible.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: AppSpacing.xxl),
            child: Column(
              children: [
                const AppIconMedallion(
                    icon: AppIcons.searchOffRounded,
                    tone: AppMedallionTone.neutral),
                const SizedBox(height: AppSpacing.md),
                Text(
                  t.t('practices.noResults'),
                  textAlign: TextAlign.center,
                  style: typography.body.copyWith(color: colors.textSecondary),
                ),
              ],
            ),
          )
        else
          for (var i = 0; i < visible.length; i++) ...[
            if (i > 0) const SizedBox(height: AppSpacing.sm),
            AppEntrance(
              index: i < 8 ? i : 8,
              child: _CategoryCard(
                category: visible[i].$1,
                leaves: visible[i].$2,
                name: catName(visible[i].$1),
                leafName: leafName,
                selected: _selected,
                expanded:
                    query.isNotEmpty || _expanded.contains(visible[i].$1.id),
                onExpand: () => setState(() {
                  final id = visible[i].$1.id;
                  if (!_expanded.remove(id)) _expanded.add(id);
                }),
                onToggle: _toggle,
                onToggleAll: () => _toggleAll(visible[i].$1),
                t: t,
              ),
            ),
          ],
      ],
    );

    return Column(
      children: [
        Expanded(child: list),
        DecoratedBox(
          decoration: BoxDecoration(
            color: colors.surface,
            border: Border(top: BorderSide(color: colors.border)),
          ),
          child: SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(AppSpacing.screenSide,
                  AppSpacing.md, AppSpacing.screenSide, AppSpacing.md),
              child: AppButton(
                key: const ValueKey('practices-save'),
                label: t.t('practices.save'),
                isLoading: _saving,
                isEnabled: _dirty,
                dimWhenDisabled: true,
                onPressed: () => _save(t),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _SelectedChips extends StatelessWidget {
  const _SelectedChips({
    required this.leaves,
    required this.nameOf,
    required this.onRemove,
    required this.t,
  });

  final List<PracticeLeaf> leaves;
  final String Function(PracticeLeaf) nameOf;
  final ValueChanged<String> onRemove;
  final Translator t;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final reduce = context.reduceMotion;
    return AnimatedSize(
      duration: reduce ? Duration.zero : AppMotion.stateChange,
      curve: AppMotion.enterCurve,
      alignment: Alignment.topLeft,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Semantics(
            header: true,
            child: Text(
              t.t('practices.selected', {'count': '${leaves.length}'}),
              style: typography.roleTitle.copyWith(color: colors.text),
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          if (leaves.isEmpty)
            Text(t.t('practices.selected.none'),
                style:
                    typography.bodySmall.copyWith(color: colors.textSecondary))
          else
            Wrap(
              spacing: AppSpacing.sm,
              runSpacing: AppSpacing.sm,
              children: [
                for (final l in leaves)
                  _PopIn(
                    key: ValueKey('chip-${l.id}'),
                    child: Semantics(
                      button: true,
                      label: t.t('practices.remove', {'name': nameOf(l)}),
                      excludeSemantics: true,
                      onTap: () => onRemove(l.id),
                      child: AppChip(
                        label: nameOf(l),
                        selected: true,
                        trailing: AppIcon(AppIcons.closeRounded,
                            size: AppSpacing.lg, color: colors.textSecondary),
                        onTap: () => onRemove(l.id),
                      ),
                    ),
                  ),
              ],
            ),
        ],
      ),
    );
  }
}

/// A chip that scales/fades in when it first appears.
class _PopIn extends StatelessWidget {
  const _PopIn({required this.child, super.key});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    if (context.reduceMotion) return child;
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: AppMotion.stateChange,
      curve: AppMotion.enterCurve,
      builder: (context, v, c) => Opacity(
        opacity: v,
        child: Transform.scale(scale: 0.85 + 0.15 * v, child: c),
      ),
      child: child,
    );
  }
}

class _CategoryCard extends StatelessWidget {
  const _CategoryCard({
    required this.category,
    required this.leaves,
    required this.name,
    required this.leafName,
    required this.selected,
    required this.expanded,
    required this.onExpand,
    required this.onToggle,
    required this.onToggleAll,
    required this.t,
  });

  final PracticeCategory category;
  final List<PracticeLeaf> leaves;
  final String name;
  final String Function(PracticeLeaf) leafName;
  final Set<String> selected;
  final bool expanded;
  final VoidCallback onExpand;
  final ValueChanged<String> onToggle;
  final VoidCallback onToggleAll;
  final Translator t;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final reduce = context.reduceMotion;
    final picked =
        category.children.where((l) => selected.contains(l.id)).length;
    final allPicked = picked == category.children.length && picked > 0;

    return AnimatedContainer(
      duration: reduce ? Duration.zero : AppMotion.stateChange,
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(AppRadii.card),
        border:
            Border.all(color: picked > 0 ? colors.goldStroke : colors.border),
      ),
      child: Column(
        children: [
          Semantics(
            button: true,
            expanded: expanded,
            label: picked > 0
                ? '$name. ${t.t('practices.pickedCount', {'count': '$picked'})}'
                : name,
            excludeSemantics: true,
            onTap: onExpand,
            child: InkWell(
              key: ValueKey('category-${category.id}'),
              borderRadius: BorderRadius.circular(AppRadii.card),
              onTap: onExpand,
              child: ConstrainedBox(
                constraints: const BoxConstraints(
                    minHeight: AppSizes.hitTarget + AppSpacing.sm),
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                      horizontal: AppSpacing.lg, vertical: AppSpacing.sm),
                  child: Row(
                    children: [
                      Expanded(
                          child: Text(name,
                              style: typography.roleTitle
                                  .copyWith(color: colors.text))),
                      if (picked > 0)
                        Container(
                          margin: const EdgeInsets.only(right: AppSpacing.sm),
                          padding: const EdgeInsets.symmetric(
                              horizontal: AppSpacing.sm,
                              vertical: AppSpacing.xs / 2),
                          decoration: BoxDecoration(
                              color: colors.gold,
                              borderRadius:
                                  BorderRadius.circular(AppRadii.pill)),
                          child: Text('$picked',
                              style: typography.badge
                                  .copyWith(color: colors.navy)),
                        ),
                      AnimatedRotation(
                        turns: expanded ? 0.5 : 0,
                        duration:
                            reduce ? Duration.zero : AppMotion.stateChange,
                        child: AppIcon(AppIcons.expandMoreRounded,
                            color: colors.textSecondary),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
          AnimatedSize(
            duration: reduce ? Duration.zero : AppMotion.stateChange,
            curve: AppMotion.enterCurve,
            alignment: Alignment.topCenter,
            child: !expanded
                ? const SizedBox(width: double.infinity)
                : Padding(
                    padding: const EdgeInsets.fromLTRB(
                        AppSpacing.sm, 0, AppSpacing.sm, AppSpacing.sm),
                    child: Column(
                      children: [
                        Divider(height: 1, color: colors.border),
                        _CheckRow(
                          key: ValueKey('select-all-${category.id}'),
                          label: t.t(allPicked
                              ? 'practices.clearAll'
                              : 'practices.selectAll'),
                          checked: allPicked,
                          emphasized: true,
                          onTap: onToggleAll,
                        ),
                        for (final l in leaves)
                          _CheckRow(
                            key: ValueKey('leaf-${l.id}'),
                            label: leafName(l),
                            checked: selected.contains(l.id),
                            onTap: () => onToggle(l.id),
                          ),
                      ],
                    ),
                  ),
          ),
        ],
      ),
    );
  }
}

class _CheckRow extends StatelessWidget {
  const _CheckRow({
    required this.label,
    required this.checked,
    required this.onTap,
    super.key,
    this.emphasized = false,
  });

  final String label;
  final bool checked;
  final VoidCallback onTap;
  final bool emphasized;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final reduce = context.reduceMotion;
    return Semantics(
      checked: checked,
      label: label,
      excludeSemantics: true,
      onTap: onTap,
      child: InkWell(
        borderRadius: BorderRadius.circular(AppRadii.field),
        onTap: onTap,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: AppSizes.hitTarget),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm),
            child: Row(
              children: [
                AnimatedContainer(
                  duration: reduce ? Duration.zero : AppMotion.stateChange,
                  width: AppSizes.iconMd - 2,
                  height: AppSizes.iconMd - 2,
                  decoration: BoxDecoration(
                    color: checked ? colors.accent : colors.surface,
                    borderRadius: BorderRadius.circular(AppSpacing.xs + 2),
                    border: Border.all(
                        color: checked ? colors.accent : colors.textSecondary,
                        width: 1.5),
                  ),
                  child: checked
                      ? AppIcon(AppIcons.checkRounded,
                          size: AppSpacing.lg, color: colors.onAccent)
                      : null,
                ),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: Text(
                    label,
                    style: (emphasized ? typography.button : typography.body)
                        .copyWith(
                      color: emphasized ? colors.goldStroke : colors.text,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _PracticesSkeleton extends StatelessWidget {
  const _PracticesSkeleton({super.key});

  @override
  Widget build(BuildContext context) => ListView(
        physics: const NeverScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(AppSpacing.screenSide, AppSpacing.sm,
            AppSpacing.screenSide, AppSpacing.xxl),
        children: [
          const AppSkeleton(height: AppSpacing.md),
          const SizedBox(height: AppSpacing.lg),
          const AppSkeleton(height: 52, borderRadius: AppRadii.field),
          const SizedBox(height: AppSpacing.xl),
          for (var i = 0; i < 6; i++) ...[
            const AppSkeleton(
                height: AppSizes.hitTarget + AppSpacing.sm,
                borderRadius: AppRadii.card),
            const SizedBox(height: AppSpacing.sm),
          ],
        ],
      );
}
