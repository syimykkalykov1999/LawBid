import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/text/bidi.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_info_section.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_info_sheets.dart';
import 'package:lawbid/shared/presentation/share_sheet.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Whether the info screen shows the link block for [detail]: a public or
/// closed group whose link is on and that the server gave a link for, or a
/// public group (its @username).
bool groupShowsLink(api.GroupDetailDto detail) =>
    detail.type != api.GroupType.private &&
    ((detail.inviteEnabled && detail.inviteLink != null) ||
        (detail.type == api.GroupType.public && detail.username != null));

/// The invite link (and the public @username): Copy, Share and, for
/// admins, «Reset link».
class GroupInfoLink extends ConsumerWidget {
  const GroupInfoLink({
    required this.detail,
    required this.onReset,
    super.key,
  });

  final api.GroupDetailDto detail;

  /// Resets the link (the screen runs the request). Null = not an admin.
  final Future<void> Function()? onReset;

  Future<void> _copy(BuildContext context, String text, String done) async {
    await Clipboard.setData(ClipboardData(text: text));
    if (context.mounted) showAppSnackBar(context, done);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final link = detail.inviteEnabled ? detail.inviteLink : null;
    final username = detail.username;
    final isPublic = detail.type == api.GroupType.public && username != null;

    return GroupInfoSection(
      title: t.t('group.info.link.title'),
      children: [
        if (link != null)
          Padding(
            padding: const EdgeInsets.all(AppSpacing.md),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Semantics(
                  label: t.t('group.info.link.title'),
                  child: SelectableText(
                    ltrIsolate(link),
                    key: const ValueKey('group-link-text'),
                    style: type.body.copyWith(color: colors.goldDark),
                  ),
                ),
                const SizedBox(height: AppSpacing.md),
                Row(
                  children: [
                    Expanded(
                      child: AppButton(
                        key: const ValueKey('group-link-copy'),
                        label: t.t('group.info.link.copy'),
                        icon: AppIcons.linkRounded,
                        variant: AppButtonVariant.secondary,
                        height: AppSizes.touchTarget,
                        onPressed: () =>
                            _copy(context, link, t.t('group.info.link.copied')),
                      ),
                    ),
                    const SizedBox(width: AppSpacing.sm),
                    Expanded(
                      child: AppButton(
                        key: const ValueKey('group-link-share'),
                        label: t.t('group.info.link.share'),
                        icon: AppIcons.iosShareRounded,
                        height: AppSizes.touchTarget,
                        onPressed: () => showShareSheet(
                          context,
                          t: t,
                          link: link,
                          text: detail.title,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        if (isPublic)
          AppListRow(
            key: const ValueKey('group-link-username'),
            icon: AppIcons.alternateEmailRounded,
            label: atHandle(username),
            subtitle: t.t('group.info.link.usernameNote'),
            showChevron: false,
            trailingText: t.t('group.info.link.copy'),
            onTap: () => _copy(
              context,
              '@$username',
              t.t('group.info.link.usernameCopied'),
            ),
          ),
        if (onReset != null)
          AppListRow(
            key: const ValueKey('group-link-reset'),
            icon: AppIcons.restartAltRounded,
            label: t.t('group.info.link.reset'),
            showChevron: false,
            onTap: () async {
              final ok = await confirmGroupAction(
                context,
                title: t.t('group.info.link.resetTitle'),
                message: t.t('group.info.link.resetBody'),
                confirmLabel: t.t('group.info.link.reset'),
                cancelLabel: t.t('common.cancel'),
                destructive: true,
              );
              if (ok) await onReset!();
            },
          ),
      ],
    );
  }
}
