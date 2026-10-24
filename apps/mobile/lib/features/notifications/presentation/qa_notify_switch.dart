import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/notifications/application/notifications_providers.dart';

/// Owner 2026-10-23: «new questions» notifications are off for everybody
/// until switched on here (the same switch as Settings → Notifications →
/// Cases). Hidden until the settings are loaded or when the server has no
/// such switch for this person.
class QaNotifySwitch extends ConsumerWidget {
  const QaNotifySwitch({super.key});

  static const topicKey = 'legalQa';

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final settings = ref.watch(notificationSettingsProvider).value;
    final topic = settings?.topics.where((x) => x.key == topicKey).firstOrNull;
    if (topic == null) return const SizedBox.shrink();
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screenSide),
      child: SwitchListTile.adaptive(
        key: const ValueKey('qa-notify-switch'),
        contentPadding: EdgeInsets.zero,
        dense: true,
        title: Text(
          t.t('notif.topic.legalQa'),
          style: type.body.copyWith(color: colors.text),
        ),
        subtitle: Text(
          t.t('qa.notify.hint'),
          style: type.caption.copyWith(color: colors.textSecondary),
        ),
        value: topic.push,
        onChanged: (v) async {
          try {
            await ref
                .read(notificationSettingsProvider.notifier)
                .setTopic(topic, push: v);
          } on Object catch (e) {
            if (context.mounted) showAppSnackBar(context, errorText(t, e));
          }
        },
      ),
    );
  }
}
