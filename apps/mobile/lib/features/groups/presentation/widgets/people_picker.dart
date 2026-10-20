import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/features/groups/application/people_candidates.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_avatar.dart';

export 'package:lawbid/features/groups/application/people_candidates.dart'
    show PickedPerson;

/// Opens the people picker as a sheet: search, tick people, «Done (n)».
/// Returns the picked people (in the order they were ticked), or null when
/// dismissed. People in [excludeIds] (already in the group) are not shown.
Future<List<PickedPerson>?> showPeoplePicker(
  BuildContext context, {
  Set<String> excludeIds = const {},
  String? titleKey,
}) =>
    showAppBottomSheet<List<PickedPerson>>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _PeoplePickerSheet(
        excludeIds: excludeIds,
        titleKey: titleKey ?? 'group.picker.title',
      ),
    );

class _PeoplePickerSheet extends ConsumerStatefulWidget {
  const _PeoplePickerSheet({required this.excludeIds, required this.titleKey});

  final Set<String> excludeIds;
  final String titleKey;

  @override
  ConsumerState<_PeoplePickerSheet> createState() => _PeoplePickerSheetState();
}

class _PeoplePickerSheetState extends ConsumerState<_PeoplePickerSheet> {
  final _picked = <PickedPerson>[];

  void _toggle(PickedPerson p) => setState(() {
        final i = _picked.indexWhere((x) => x.userId == p.userId);
        if (i >= 0) {
          _picked.removeAt(i);
        } else {
          _picked.add(p);
        }
      });

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final media = MediaQuery.of(context);
    final count = {'count': '${_picked.length}'};
    final doneLabel = _picked.isEmpty
        ? t.t('group.picker.doneNone')
        : t.t('group.picker.done', count);
    return SizedBox(
      height: (media.size.height - media.viewInsets.bottom) * 0.88,
      child: Padding(
        padding: EdgeInsets.only(bottom: media.viewInsets.bottom),
        child: SafeArea(
          top: false,
          child: Column(
            children: [
              const AppSheetHandle(),
              Padding(
                padding: const EdgeInsetsDirectional.fromSTEB(
                  AppSpacing.screenSide,
                  AppSpacing.xs,
                  AppSpacing.screenSide,
                  AppSpacing.sm,
                ),
                child: Align(
                  alignment: AlignmentDirectional.centerStart,
                  child: Text(
                    t.t(widget.titleKey),
                    style: typography.titleMedium.copyWith(color: colors.text),
                  ),
                ),
              ),
              Expanded(
                child: PeopleSelector(
                  excludeIds: widget.excludeIds,
                  selected: _picked,
                  onToggle: _toggle,
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(AppSpacing.screenSide),
                child: AppButton(
                  key: const ValueKey('people-picker-done'),
                  label: doneLabel,
                  onPressed: _picked.isEmpty
                      ? null
                      : () => Navigator.of(context).pop(
                            List<PickedPerson>.of(_picked),
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

/// The picker body: a search field, the ticked people as chips, and the
/// list of people with checkboxes. Used inline by «New group» and inside
/// [showPeoplePicker]'s sheet; the owner of the selection is the parent.
class PeopleSelector extends ConsumerStatefulWidget {
  const PeopleSelector({
    required this.selected,
    required this.onToggle,
    this.excludeIds = const {},
    super.key,
  });

  final Set<String> excludeIds;
  final List<PickedPerson> selected;
  final ValueChanged<PickedPerson> onToggle;

  @override
  ConsumerState<PeopleSelector> createState() => _PeopleSelectorState();
}

class _PeopleSelectorState extends ConsumerState<PeopleSelector> {
  final _search = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final candidates = ref.watch(groupPeopleCandidatesProvider);
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.screenSide,
          ),
          child: AppTextField(
            key: const ValueKey('people-search'),
            controller: _search,
            hintText: t.t('group.picker.search'),
            semanticLabel: t.t('group.picker.search'),
            leading: AppIcon(
              AppIcons.searchRounded,
              size: AppSizes.iconSm,
              color: colors.textSecondary,
            ),
            onChanged: (v) => setState(() => _query = v),
          ),
        ),
        if (widget.selected.isNotEmpty)
          _SelectedChips(
            people: widget.selected,
            onRemove: widget.onToggle,
            removeLabel: t.t('group.picker.remove'),
          ),
        const SizedBox(height: AppSpacing.xs),
        Expanded(
          child: switch (candidates) {
            AsyncData(:final value) => _list(
                t,
                withoutPeople(value, widget.excludeIds),
              ),
            AsyncError(:final error) => CasesErrorView(
                error: error,
                t: t,
                onRetry: () => ref.invalidate(groupPeopleCandidatesProvider),
              ),
            _ => const CasesListSkeleton(),
          },
        ),
      ],
    );
  }

  Widget _list(Translator t, List<PickedPerson> all) {
    if (all.isEmpty) {
      return AppEmptyState(
        icon: AppIcons.peopleOutlineRounded,
        message: t.t('group.picker.empty'),
      );
    }
    final shown = filterPeople(all, _query);
    if (shown.isEmpty) {
      return AppEmptyState(
        icon: AppIcons.searchOffRounded,
        message: t.t('group.picker.noMatch'),
      );
    }
    final ticked = {for (final p in widget.selected) p.userId};
    return ListView.builder(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      itemCount: shown.length,
      itemBuilder: (context, i) {
        final p = shown[i];
        return _PersonRow(
          key: ValueKey('person-${p.userId}'),
          person: p,
          checked: ticked.contains(p.userId),
          onTap: () => widget.onToggle(p),
        );
      },
    );
  }
}

class _PersonRow extends StatelessWidget {
  const _PersonRow({
    required this.person,
    required this.checked,
    required this.onTap,
    super.key,
  });

  final PickedPerson person;
  final bool checked;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return Semantics(
      checked: checked,
      label: person.name,
      excludeSemantics: true,
      onTap: onTap,
      child: InkWell(
        onTap: onTap,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: AppSizes.hitTarget),
          child: Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.screenSide,
              vertical: AppSpacing.xs,
            ),
            child: Row(
              children: [
                GroupAvatar(name: person.name, url: person.avatarUrl),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: Text(
                    person.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: typography.body.copyWith(color: colors.text),
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                AppIcon(
                  checked
                      ? AppIcons.checkCircleRounded
                      : AppIcons.radioButtonUncheckedRounded,
                  color: checked ? colors.gold : colors.textSecondary,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _SelectedChips extends StatelessWidget {
  const _SelectedChips({
    required this.people,
    required this.onRemove,
    required this.removeLabel,
  });

  final List<PickedPerson> people;
  final ValueChanged<PickedPerson> onRemove;
  final String removeLabel;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return ConstrainedBox(
      constraints: const BoxConstraints(maxHeight: 96),
      child: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.screenSide,
          vertical: AppSpacing.sm,
        ),
        child: Align(
          alignment: AlignmentDirectional.centerStart,
          child: Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.sm,
            children: [
              for (final p in people)
                ConstrainedBox(
                  constraints: BoxConstraints(
                    maxWidth: MediaQuery.sizeOf(context).width * 0.6,
                  ),
                  child: AppChip(
                    key: ValueKey('chip-${p.userId}'),
                    label: p.name,
                    leading:
                        GroupAvatar(name: p.name, url: p.avatarUrl, size: 22),
                    trailing: AppIcon(
                      AppIcons.closeRounded,
                      size: 16,
                      color: colors.textSecondary,
                      semanticLabel: removeLabel,
                    ),
                    onTap: () => onRemove(p),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
