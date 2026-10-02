import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';
import 'package:lawbid/features/chat/application/voice_recorder.dart'
    show voiceClock;
import 'package:lawbid/features/chat/domain/chat_models.dart';

/// OQ-041: what a call entry says — "Outgoing call", "Missed call",
/// "No answer" (our unanswered call), "Declined call", "Busy"…
String callLogKey(String outcome, {required bool outgoing}) =>
    switch (outcome) {
      'ended' => outgoing ? 'call.log.outgoing' : 'call.log.incoming',
      'missed' ||
      'canceled' =>
        outgoing ? 'call.log.noAnswer' : 'call.log.missed',
      'declined' => 'call.log.declined',
      'busy' => 'call.log.busy',
      'failed' => 'call.log.failed',
      _ => outgoing ? 'call.log.outgoing' : 'call.log.incoming',
    };

/// A call in the chat: a bubble on the caller's side with an arrow icon
/// (out / in / missed in red), the talk time, and a tap to call back.
class CallLogEntry extends ConsumerWidget {
  const CallLogEntry({
    required this.message,
    required this.mine,
    required this.conversation,
    super.key,
  });

  final ChatMessage message;
  final bool mine;
  final Conversation? conversation;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final log = message.callLog!;
    final missedHere =
        !mine && (log.outcome == 'missed' || log.outcome == 'canceled');
    final label = t.t(callLogKey(log.outcome, outgoing: mine));
    final icon = missedHere
        ? AppIcons.callMissedRounded
        : mine
            ? AppIcons.callMadeRounded
            : AppIcons.callReceivedRounded;
    final fg = mine ? colors.onAccent : colors.text;
    final c = conversation;
    final canCall = c != null && !c.closed && c.contactsUnlocked;

    void callBack() {
      if (!canCall) return;
      HapticFeedback.mediumImpact();
      ref.read(callControllerProvider.notifier).call(
            c.id,
            peer: c.counterpart.id == null
                ? null
                : CallPeer(
                    id: c.counterpart.id!,
                    isAttorney: c.counterpart.isAttorney,
                    displayName: c.counterpart.displayName,
                    username: c.counterpart.username,
                    avatarUrl: c.counterpart.avatarUrl,
                  ),
          );
    }

    final bubble = Container(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.md,
        AppSpacing.sm,
        AppSpacing.md,
        AppSpacing.sm,
      ),
      decoration: BoxDecoration(
        color: mine ? colors.accent : colors.surface,
        borderRadius: BorderRadius.only(
          topLeft: const Radius.circular(18),
          topRight: const Radius.circular(18),
          bottomLeft: Radius.circular(mine ? 18 : 4),
          bottomRight: Radius.circular(mine ? 4 : 18),
        ),
        border: mine ? null : Border.all(color: colors.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: (missedHere ? colors.danger : colors.gold)
                  .withValues(alpha: mine ? 0.25 : 0.15),
            ),
            child: AppIcon(
              icon,
              size: 20,
              color: missedHere
                  ? colors.danger
                  : (mine ? colors.goldLight : colors.goldDark),
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                label,
                style: type.body.copyWith(
                  color: missedHere ? colors.danger : fg,
                  fontWeight: FontWeight.w600,
                ),
              ),
              Text(
                [
                  f.time(message.createdAt),
                  if (log.durationSec > 0)
                    voiceClock(Duration(seconds: log.durationSec)),
                ].join(' · '),
                style: type.caption.copyWith(color: fg.withValues(alpha: 0.7)),
              ),
            ],
          ),
          if (canCall) ...[
            const SizedBox(width: AppSpacing.md),
            AppIcon(
              AppIcons.callOutlined,
              size: 20,
              color: mine ? colors.goldLight : colors.goldDark,
            ),
          ],
        ],
      ),
    );

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Align(
        alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
        child: Semantics(
          button: canCall,
          label: [
            label,
            if (log.durationSec > 0)
              voiceClock(Duration(seconds: log.durationSec)),
            if (canCall) t.t('call.log.callBack'),
          ].join(', '),
          excludeSemantics: true,
          child: AppPressable(onTap: canCall ? callBack : () {}, child: bubble),
        ),
      ),
    );
  }
}
