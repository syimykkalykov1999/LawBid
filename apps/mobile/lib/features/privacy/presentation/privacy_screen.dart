import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/features/privacy/application/privacy_providers.dart';
import 'package:lawbid/features/privacy/data/privacy_repository.dart';
import 'package:lawbid/features/privacy/privacy_routes.dart';

/// Owner 2026-10-20: Settings → Privacy and safety. Who sees my last seen,
/// who may start a chat or call me (everyone / my contacts / nobody), my
/// blocked users, my reports and what moderation decided about my content.
class PrivacyScreen extends ConsumerWidget {
  const PrivacyScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final settings = ref.watch(privacySettingsProvider);
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: Text(t.t('privacy.title')),
      ),
      body: AsyncDetailBody<PrivacySettings>(
        value: settings,
        t: t,
        onRetry: () => ref.invalidate(privacySettingsProvider),
        builder: (s) => ListView(
          padding: EdgeInsets.fromLTRB(
            AppSpacing.screenSide,
            AppSpacing.md,
            AppSpacing.screenSide,
            AppSpacing.xxl + MediaQuery.paddingOf(context).bottom,
          ),
          children: [
            AppListSection(
              title: t.t('privacy.section.who'),
              children: [
                _AudienceRow(
                  rowKey: 'privacy-last-seen',
                  icon: AppIcons.visibilityOutlined,
                  label: t.t('privacy.lastSeen'),
                  field: PrivacyField.lastSeen,
                  value: s.lastSeen,
                ),
                _AudienceRow(
                  rowKey: 'privacy-message-from',
                  icon: AppIcons.chatBubbleOutlineRounded,
                  label: t.t('privacy.messageFrom'),
                  field: PrivacyField.messageFrom,
                  value: s.messageFrom,
                ),
                _AudienceRow(
                  rowKey: 'privacy-call-from',
                  icon: AppIcons.phoneOutlined,
                  label: t.t('privacy.callFrom'),
                  field: PrivacyField.callFrom,
                  value: s.callFrom,
                ),
                _AudienceRow(
                  rowKey: 'privacy-photo-from',
                  icon: AppIcons.imageOutlined,
                  label: t.t('privacy.photoFrom'),
                  field: PrivacyField.photoFrom,
                  value: s.photoFrom,
                ),
                _AudienceRow(
                  rowKey: 'privacy-about-from',
                  icon: AppIcons.infoOutlineRounded,
                  label: t.t('privacy.aboutFrom'),
                  field: PrivacyField.aboutFrom,
                  value: s.aboutFrom,
                ),
                _AudienceRow(
                  rowKey: 'privacy-group-add-from',
                  icon: AppIcons.groupAddOutlined,
                  label: t.t('privacy.groupAddFrom'),
                  field: PrivacyField.groupAddFrom,
                  value: s.groupAddFrom,
                ),
              ],
            ),
            _Hint(text: t.t('privacy.hint.lastSeen')),
            _Hint(text: t.t('privacy.hint.contacts')),
            _Hint(text: t.t('privacy.hint.case')),
            const SizedBox(height: AppSpacing.lg),
            AppListSection(
              title: t.t('privacy.section.safety'),
              children: [
                // Owner 2026-10-20: the «find me by number» switch lives on
                // the contacts screen (contacts_sync); linked from here.
                AppListRow(
                  key: const ValueKey('privacy-find-by-phone'),
                  icon: AppIcons.phoneOutlined,
                  label: t.t('phoneContacts.findByPhone'),
                  onTap: () => context.push(AppRoutes.contacts),
                ),
                AppListRow(
                  icon: AppIcons.blockRounded,
                  label: t.t('settings.blocked'),
                  onTap: () => context.push(AppRoutes.blockedUsers),
                ),
                AppListRow(
                  icon: AppIcons.flagOutlined,
                  label: t.t('privacy.myReports'),
                  onTap: () => context.push(PrivacyRoutes.myReports),
                ),
                AppListRow(
                  icon: AppIcons.policyOutlined,
                  label: t.t('privacy.notices'),
                  onTap: () => context.push(PrivacyRoutes.notices),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

String audienceLabel(Translator t, Audience a) =>
    t.t('privacy.audience.${a.name}');

class _Hint extends StatelessWidget {
  const _Hint({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Padding(
      padding: const EdgeInsetsDirectional.only(
        start: AppSpacing.xs,
        top: AppSpacing.sm,
        end: AppSpacing.xs,
      ),
      child: Text(
        text,
        style: type.caption.copyWith(color: colors.textSecondary),
      ),
    );
  }
}

class _AudienceRow extends ConsumerWidget {
  const _AudienceRow({
    required this.rowKey,
    required this.icon,
    required this.label,
    required this.field,
    required this.value,
  });

  final String rowKey;
  final IconData icon;
  final String label;
  final PrivacyField field;
  final Audience value;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    return AppListRow(
      key: ValueKey(rowKey),
      icon: icon,
      label: label,
      trailingText: audienceLabel(t, value),
      onTap: () => _pick(context, ref),
    );
  }

  Future<void> _pick(BuildContext context, WidgetRef ref) async {
    final t = ref.read(translatorProvider);
    final chosen = await showAppBottomSheet<Audience>(
      context: context,
      builder: (sheet) => _AudienceSheet(
        t: t,
        title: label,
        current: value,
      ),
    );
    if (chosen == null || chosen == value) return;
    try {
      await ref.read(privacySettingsProvider.notifier).change(field, chosen);
    } on Object catch (e) {
      if (context.mounted) showAppSnackBar(context, errorText(t, e));
    }
  }
}

class _AudienceSheet extends StatelessWidget {
  const _AudienceSheet({
    required this.t,
    required this.title,
    required this.current,
  });

  final Translator t;
  final String title;
  final Audience current;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.screenSide,
          AppSpacing.sm,
          AppSpacing.screenSide,
          AppSpacing.md,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const AppSheetHandle(),
            Semantics(
              header: true,
              child: Text(
                title,
                textAlign: TextAlign.center,
                style: type.titleMedium.copyWith(color: colors.text),
              ),
            ),
            const SizedBox(height: AppSpacing.md),
            for (final (i, a) in Audience.values.indexed) ...[
              if (i > 0) const SizedBox(height: AppSpacing.sm),
              AppPickerRow(
                key: ValueKey('audience-${a.name}'),
                title: audienceLabel(t, a),
                selected: a == current,
                onTap: () => Navigator.of(context).pop(a),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
