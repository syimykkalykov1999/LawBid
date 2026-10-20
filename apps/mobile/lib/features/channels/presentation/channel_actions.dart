import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/config/app_environment.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/channels/application/channels_providers.dart';
import 'package:lawbid/features/channels/channels_routes.dart';
import 'package:lawbid/features/channels/domain/channel_models.dart';
import 'package:lawbid/features/channels/presentation/channel_widgets.dart';
import 'package:lawbid/shared/presentation/share_sheet.dart';

/// `https://lawbid.dev/c/<username>` (the host is the app's deep-link
/// host), with `?post=<id>` for one post.
String channelLink(WidgetRef ref, Channel channel, {String? postId}) {
  final host = ref.read(appEnvironmentProvider).deepLinkHost;
  return 'https://$host${ChannelsRoutes.byUsername(channel.username, postId: postId)}';
}

/// "Repost to a chat / anywhere": the LawBid share sheet with the channel's
/// (or one post's) link.
Future<void> shareChannel(
  BuildContext context,
  WidgetRef ref,
  Channel channel, {
  String? postId,
}) {
  final t = ref.read(translatorProvider);
  return showShareSheet(
    context,
    t: t,
    link: channelLink(ref, channel, postId: postId),
    text: channel.title,
  );
}

/// The reasons a channel or a post can be reported for.
const _reasons = [
  'spam',
  'abuse',
  'misinformation',
  'impersonation',
  'inappropriate',
  'fraud',
  'other',
];

/// `POST /reports` for the channel (or one of its posts), the reason picked
/// from a sheet.
Future<void> showChannelReportSheet(
  BuildContext context,
  WidgetRef ref, {
  required String targetId,
  bool post = false,
}) {
  final t = ref.read(translatorProvider);
  String label(String reason) => switch (reason) {
        'spam' => t.t('report.reason.spam'),
        'abuse' => t.t('report.reason.abuse'),
        'misinformation' => t.t('report.reason.misinformation'),
        'impersonation' => t.t('report.reason.impersonation'),
        'inappropriate' => t.t('report.reason.inappropriate'),
        'fraud' => t.t('report.reason.fraud'),
        _ => t.t('report.reason.other'),
      };
  return showAppBottomSheet<void>(
    context: context,
    builder: (sheet) {
      final type = Theme.of(sheet).extension<AppTypographyTokens>()!;
      return SafeArea(
        child: Padding(
          padding: const EdgeInsets.only(bottom: AppSpacing.md),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const AppSheetHandle(),
                Padding(
                  padding: const EdgeInsets.fromLTRB(
                    AppSpacing.screenSide,
                    AppSpacing.sm,
                    AppSpacing.screenSide,
                    AppSpacing.md,
                  ),
                  child: Text(t.t('report.title'), style: type.titleMedium),
                ),
                for (final reason in _reasons)
                  AppListRow(
                    key: ValueKey('channel-report-$reason'),
                    label: label(reason),
                    showChevron: false,
                    onTap: () async {
                      Navigator.of(sheet).pop();
                      try {
                        await ref.read(channelsRepositoryProvider).report(
                              targetId: targetId,
                              reason: reason,
                              post: post,
                            );
                        if (context.mounted) {
                          showAppSnackBar(context, t.t('report.sent'));
                        }
                      } on Object catch (e) {
                        if (context.mounted) {
                          showAppSnackBar(context, channelErrorText(t, e));
                        }
                      }
                    },
                  ),
              ],
            ),
          ),
        ),
      );
    },
  );
}

/// A yes / no question before something is deleted; true = confirmed.
Future<bool> confirmChannelAction(
  BuildContext context,
  WidgetRef ref, {
  required String title,
  required String message,
  required String confirmLabel,
  bool destructive = true,
}) async {
  final t = ref.read(translatorProvider);
  final ok = await showDialog<bool>(
    context: context,
    builder: (d) => AppAlertDialog(
      title: Text(title),
      content: Text(message),
      actions: [
        AppButton(
          key: const ValueKey('channel-confirm-yes'),
          label: confirmLabel,
          variant:
              destructive ? AppButtonVariant.danger : AppButtonVariant.primary,
          onPressed: () => Navigator.of(d).pop(true),
        ),
        AppButton(
          label: t.t('common.cancel'),
          variant: AppButtonVariant.secondary,
          onPressed: () => Navigator.of(d).pop(false),
        ),
      ],
    ),
  );
  return ok ?? false;
}
