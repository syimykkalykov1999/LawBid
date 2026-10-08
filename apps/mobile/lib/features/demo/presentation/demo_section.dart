import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/demo/application/demo_providers.dart';
import 'package:lawbid/features/demo/domain/demo_models.dart';
import 'package:lawbid/features/demo/presentation/demo_actions.dart';

/// Owner 2026-10-05 — Settings → Partner program → «Демо-режим»
/// (docs/ops/demo-world.md): the partner's demo accounts (role icon, name,
/// «Войти», long-press / menu → «Удалить»), «N из M аккаунтов», «удаляются
/// через N дней без активности», and «Создать демо-аккаунт» → role picker
/// sheet → the new account opens at once. Renders nothing unless
/// `GET /demo/me` says `enabled` (the owner's switch + the partner's demo
/// right), so the partner screen is unchanged for everyone else.
class DemoSection extends ConsumerWidget {
  const DemoSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final me = ref.watch(demoMeProvider).value;
    if (me == null || !me.enabled) return const SizedBox.shrink();
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final busy = ref.watch(demoSessionControllerProvider).busy;

    return Column(
      key: const ValueKey('demo-section'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          t.t('demo.section.title'),
          style: type.titleMedium.copyWith(color: colors.text),
        ),
        const SizedBox(height: AppSpacing.xs),
        Text(
          t.t('demo.section.hint'),
          style: type.caption.copyWith(color: colors.textSecondary),
        ),
        const SizedBox(height: AppSpacing.md),
        Container(
          padding: const EdgeInsets.all(AppSpacing.md),
          decoration: BoxDecoration(
            color: colors.surface,
            borderRadius: BorderRadius.circular(AppRadii.card),
            border: Border.all(color: colors.border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                '${t.t('demo.accounts.count', {
                      'count': '${me.accounts.length}',
                      'max': '${me.maxAccounts}',
                    })}'
                ' · ${t.t('demo.accounts.ttl', {'days': '${me.ttlDays}'})}',
                style: type.caption.copyWith(color: colors.textSecondary),
              ),
              if (me.accounts.isEmpty) ...[
                const SizedBox(height: AppSpacing.md),
                Text(
                  t.t('demo.accounts.empty'),
                  style: type.bodySmall.copyWith(color: colors.textSecondary),
                ),
              ],
              for (final a in me.accounts) ...[
                const SizedBox(height: AppSpacing.sm),
                _AccountRow(account: a, t: t, f: f, busy: busy),
              ],
              const SizedBox(height: AppSpacing.md),
              AppButton(
                key: const ValueKey('demo-create'),
                label: t.t('demo.create'),
                icon: AppIcons.addRounded,
                variant: AppButtonVariant.secondary,
                isEnabled: me.canCreate && !busy,
                onPressed: () => _RolePickerSheet.show(context),
              ),
              if (!me.canCreate) ...[
                const SizedBox(height: AppSpacing.xs),
                Text(
                  t.t('demo.limit'),
                  textAlign: TextAlign.center,
                  style: type.caption.copyWith(color: colors.textSecondary),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _AccountRow extends ConsumerWidget {
  const _AccountRow({
    required this.account,
    required this.t,
    required this.f,
    required this.busy,
  });

  final DemoAccount account;
  final Translator t;
  final L10nFormats f;
  final bool busy;

  Future<void> _enter(BuildContext context, WidgetRef ref) async {
    if (busy) return;
    showAppSnackBar(context, t.t('demo.entering'));
    try {
      final session = await ref.read(demoRepositoryProvider).enter(account.id);
      if (!context.mounted) return;
      await enterDemoAndGo(context, ref, session);
    } catch (e) {
      if (context.mounted) showAppSnackBar(context, errorText(t, e));
    }
  }

  Future<void> _delete(BuildContext context, WidgetRef ref) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: Text(t.t('demo.delete.confirm.title')),
        content: Text(
          t.t('demo.delete.confirm.message', {'name': account.displayName}),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialog).pop(false),
            child: Text(t.t('common.cancel')),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialog).pop(true),
            child: Text(t.t('demo.delete')),
          ),
        ],
      ),
    );
    if (ok != true || !context.mounted) return;
    try {
      await ref.read(demoRepositoryProvider).delete(account.id);
      ref.invalidate(demoMeProvider);
      if (context.mounted) showAppSnackBar(context, t.t('demo.deleted'));
    } catch (e) {
      if (context.mounted) showAppSnackBar(context, errorText(t, e));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final seen = account.lastSeenAt == null
        ? t.t('demo.lastSeen.never')
        : t.t('demo.lastSeen', {'date': f.date(account.lastSeenAt!)});
    final subtitle = '${t.t('demo.role.${account.role.wire}')} · $seen'
        ' · ${t.t('demo.expires', {'date': f.date(account.expiresAt)})}';

    return Material(
      color: Colors.transparent,
      child: InkWell(
        key: ValueKey('demo-account-${account.id}'),
        borderRadius: BorderRadius.circular(AppRadii.field),
        onTap: () => _enter(context, ref),
        onLongPress: () => _delete(context, ref),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
          child: Row(
            children: [
              AppIcon(demoRoleIcon(account.role), color: colors.goldDark),
              const SizedBox(width: AppSpacing.md),
              // The texts take whatever is left; the two controls on the
              // right never move, whatever the language.
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      account.displayName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: type.body.copyWith(color: colors.text),
                    ),
                    Text(
                      subtitle,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: type.caption.copyWith(color: colors.textSecondary),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              SizedBox(
                width: 76,
                height: 36,
                child: OutlinedButton(
                  key: ValueKey('demo-enter-${account.id}'),
                  onPressed: busy ? null : () => _enter(context, ref),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: colors.goldDark,
                    side: BorderSide(color: colors.goldStroke),
                    padding:
                        const EdgeInsets.symmetric(horizontal: AppSpacing.sm),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(AppRadii.pill),
                    ),
                  ),
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    child: Text(t.t('demo.enter'), maxLines: 1),
                  ),
                ),
              ),
              AppIconButton(
                icon: AppIcon(
                  AppIcons.deleteOutlineRounded,
                  color: colors.textSecondary,
                ),
                semanticLabel: t.t('demo.delete'),
                onPressed: busy ? null : () => _delete(context, ref),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// «Создать демо-аккаунт» → Клиент / Адвокат / Помощник → created and
/// entered immediately.
class _RolePickerSheet extends ConsumerStatefulWidget {
  const _RolePickerSheet();

  static Future<void> show(BuildContext context) => showAppBottomSheet<void>(
        context: context,
        builder: (_) => const _RolePickerSheet(),
      );

  @override
  ConsumerState<_RolePickerSheet> createState() => _RolePickerSheetState();
}

class _RolePickerSheetState extends ConsumerState<_RolePickerSheet> {
  DemoRole? _creating;

  Future<void> _create(DemoRole role) async {
    if (_creating != null) return;
    setState(() => _creating = role);
    final t = ref.read(translatorProvider);
    try {
      final session = await ref.read(demoRepositoryProvider).create(role);
      ref.invalidate(demoMeProvider);
      if (!mounted) return;
      Navigator.of(context).pop();
      await enterDemoAndGo(context, ref, session);
    } catch (e) {
      if (!mounted) return;
      setState(() => _creating = null);
      showAppSnackBar(context, errorText(t, e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final t = ref.watch(translatorProvider);
    return SafeArea(
      top: false,
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
            Semantics(
              header: true,
              child: Text(
                t.t('demo.create.title'),
                style: type.titleMedium.copyWith(color: colors.text),
              ),
            ),
            const SizedBox(height: AppSpacing.xs),
            Text(
              t.t('demo.create.hint'),
              style: type.caption.copyWith(color: colors.textSecondary),
            ),
            const SizedBox(height: AppSpacing.lg),
            for (var i = 0; i < DemoRole.values.length; i++) ...[
              if (i > 0) const SizedBox(height: AppSpacing.xs),
              AppEntrance(
                index: i,
                child: AppListRow(
                  key: ValueKey('demo-role-${DemoRole.values[i].wire}'),
                  icon: demoRoleIcon(DemoRole.values[i]),
                  label: t.t('demo.role.${DemoRole.values[i].wire}'),
                  subtitle: t.t('demo.role.${DemoRole.values[i].wire}.hint'),
                  selected: _creating == DemoRole.values[i],
                  showChevron: false,
                  onTap: _creating == null
                      ? () => _create(DemoRole.values[i])
                      : null,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
