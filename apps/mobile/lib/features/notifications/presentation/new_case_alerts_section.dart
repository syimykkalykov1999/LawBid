import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/notifications/application/notifications_providers.dart';
import 'package:lawbid/features/notifications/data/notifications_repository.dart';
import 'package:lawbid/features/onboarding/presentation/widgets/option_picker_sheet.dart';
import 'package:lawbid/features/practice/practice_options.dart';
import 'package:lawbid/features/profile/application/profile_providers.dart';
import 'package:lawbid/features/profile/domain/profile_models.dart';

/// Owner 2026-10-01: inside the "New cases" card — which qualifications
/// send alerts. By default the profile's (and only in licensed states);
/// the attorney can pick their own list (any category or subcategory, a
/// category covers its subcategories) and switch back any time.
class NewCaseAlertsSection extends ConsumerStatefulWidget {
  const NewCaseAlertsSection({super.key});

  @override
  ConsumerState<NewCaseAlertsSection> createState() =>
      _NewCaseAlertsSectionState();
}

class _NewCaseAlertsSectionState extends ConsumerState<NewCaseAlertsSection> {
  bool _saving = false;

  /// code → id and id → code from the practice tree.
  static (Map<String, String>, Map<String, String>) _maps(
    List<PracticeCategory> tree,
  ) {
    final codeToId = <String, String>{};
    for (final c in tree) {
      codeToId[practiceCodeOf(c.i18nKey)] = c.id;
      for (final l in c.children) {
        codeToId[practiceCodeOf(l.i18nKey)] = l.id;
      }
    }
    return (codeToId, {for (final e in codeToId.entries) e.value: e.key});
  }

  Future<void> _save({required bool useProfile, List<String>? ids}) async {
    final t = ref.read(translatorProvider);
    setState(() => _saving = true);
    try {
      await ref
          .read(notificationsRepositoryProvider)
          .setNewCaseAlerts(useProfile: useProfile, practiceAreaIds: ids);
      ref.invalidate(newCaseAlertsProvider);
      if (mounted) showAppSnackBar(context, t.t('notif.newCases.saved'));
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, errorText(t, e));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _choose(NewCaseAlerts a, List<PracticeCategory> tree) async {
    final t = ref.read(translatorProvider);
    final (codeToId, idToCode) = _maps(tree);
    // Start from the current choice — or the profile's when there is none.
    final start = a.practiceAreaIds.isNotEmpty
        ? a.practiceAreaIds
        : a.profilePracticeAreaIds;
    final picked = await OptionPickerSheet.show(
      context,
      title: t.t('notif.newCases.pickTitle'),
      options: practicePickerOptions(t, tree),
      initial: {
        for (final id in start)
          if (idToCode[id] != null) idToCode[id]!,
      },
      multi: true,
      searchHint: t.t('notif.newCases.search'),
    );
    if (picked == null || !mounted) return;
    final ids = [
      for (final c in picked)
        if (codeToId[c] != null) codeToId[c]!,
    ];
    if (ids.isEmpty) {
      // Nothing chosen: back to the profile's qualifications.
      await _save(useProfile: true, ids: const []);
      return;
    }
    await _save(useProfile: false, ids: ids);
  }

  String _preview(List<String> ids, Map<String, String> idToCode) {
    final t = ref.read(translatorProvider);
    if (ids.isEmpty) return t.t('notif.newCases.none');
    final names = [
      for (final id in ids.take(3))
        if (idToCode[id] != null) practiceLabel(ref, idToCode[id]!),
    ];
    final more = ids.length - names.length;
    return more > 0
        ? '${names.join(', ')} ${t.t('notif.newCases.more', {'n': '$more'})}'
        : names.join(', ');
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final alerts = ref.watch(newCaseAlertsProvider);
    final tree = ref.watch(practiceTreeProvider).value ?? const [];
    final a = alerts.value;
    if (a == null) {
      return alerts.hasError
          ? const SizedBox.shrink()
          : const Padding(
              padding: EdgeInsets.symmetric(vertical: AppSpacing.sm),
              child: AppSkeleton(height: 96, borderRadius: AppRadii.card),
            );
    }
    final (_, idToCode) = _maps(tree);
    Widget option({
      required String key,
      required bool selected,
      required String title,
      required String subtitle,
      required VoidCallback onTap,
    }) =>
        Semantics(
          selected: selected,
          button: true,
          label: title,
          child: InkWell(
            key: ValueKey(key),
            borderRadius: BorderRadius.circular(AppRadii.field),
            onTap: _saving ? null : onTap,
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  AppIcon(
                    selected
                        ? AppIcons.radioButtonCheckedRounded
                        : AppIcons.radioButtonUncheckedRounded,
                    color: selected ? colors.goldDark : colors.textSecondary,
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          title,
                          style: type.body.copyWith(
                            color: colors.text,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        Text(
                          subtitle,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: type.caption
                              .copyWith(color: colors.textSecondary),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: AppSpacing.xs),
        Divider(height: 1, color: colors.border),
        const SizedBox(height: AppSpacing.sm),
        Text(
          t.t('notif.newCases.which'),
          style: type.body.copyWith(
            color: colors.text,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          t.t('notif.newCases.explain'),
          style: type.caption.copyWith(color: colors.textSecondary),
        ),
        option(
          key: 'alerts-profile',
          selected: a.useProfile,
          title: t.t('notif.newCases.profile'),
          subtitle: _preview(a.profilePracticeAreaIds, idToCode),
          onTap: () {
            if (!a.useProfile) _save(useProfile: true);
          },
        ),
        option(
          key: 'alerts-custom',
          selected: !a.useProfile,
          title: t.t('notif.newCases.custom'),
          subtitle: a.practiceAreaIds.isEmpty
              ? t.t('notif.newCases.customHint')
              : _preview(a.practiceAreaIds, idToCode),
          onTap: () {
            if (a.useProfile && a.practiceAreaIds.isNotEmpty) {
              _save(useProfile: false);
            } else {
              _choose(a, tree);
            }
          },
        ),
        if (a.useProfile && a.profilePracticeAreaIds.isEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.xs),
            child: Text(
              t.t('notif.newCases.profileEmpty'),
              style: type.caption.copyWith(color: colors.dangerText),
            ),
          ),
        Wrap(
          spacing: AppSpacing.sm,
          children: [
            TextButton.icon(
              key: const ValueKey('alerts-choose'),
              onPressed:
                  _saving || tree.isEmpty ? null : () => _choose(a, tree),
              icon: AppIcon(AppIcons.tuneRounded, color: colors.goldDark),
              label: Text(
                t.t('notif.newCases.choose'),
                style: TextStyle(color: colors.goldDark),
              ),
            ),
            TextButton.icon(
              key: const ValueKey('alerts-edit-profile'),
              onPressed: () => context.push(AppRoutes.practices),
              icon: AppIcon(AppIcons.editOutlined, color: colors.textSecondary),
              label: Text(
                t.t('notif.newCases.editProfile'),
                style: TextStyle(color: colors.textSecondary),
              ),
            ),
          ],
        ),
      ],
    );
  }
}
