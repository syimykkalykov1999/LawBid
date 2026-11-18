import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/application/call_hold.dart';
import 'package:material_ui/material_ui.dart';

/// Row 216 (owner 17.11, WhatsApp call waiting since Dec 2019): a second
/// call rings while we talk — the caller's name, «Incoming call», and two
/// buttons: «Decline» (red) and «End & accept» (green), on the call's own
/// dark sheet. Over every screen, the call screen too. iOS uses CallKit's
/// own call-waiting screen instead (one ringing surface).
class CallWaitingBanner extends ConsumerWidget {
  const CallWaitingBanner({required this.waiting, super.key});

  final CallWaiting waiting;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final call = ref.read(callControllerProvider.notifier);
    final name = waiting.call.peer.name;
    Widget action({
      required Key key,
      required IconData icon,
      required Color fill,
      required String label,
      required VoidCallback onTap,
    }) =>
        Expanded(
          child: Semantics(
            button: true,
            label: label,
            excludeSemantics: true,
            child: Material(
              color: fill,
              shape: const StadiumBorder(),
              child: InkWell(
                key: key,
                customBorder: const StadiumBorder(),
                onTap: onTap,
                child: ConstrainedBox(
                  constraints: const BoxConstraints(minHeight: 44),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: AppSpacing.sm,
                      vertical: AppSpacing.sm,
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        AppIcon(icon, size: 18, color: AppCallColors.onStage),
                        const SizedBox(width: AppSpacing.xs),
                        Flexible(
                          child: Text(
                            label,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: type.body.copyWith(
                              color: AppCallColors.onStage,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        );
    return Material(
      key: const Key('call-waiting-banner'),
      color: AppCallColors.sheet,
      elevation: 4,
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.md,
            AppSpacing.sm,
            AppSpacing.md,
            AppSpacing.md,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                name.isEmpty ? 'LawBid' : name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: type.body.copyWith(
                  color: AppCallColors.onStage,
                  fontWeight: FontWeight.w600,
                ),
              ),
              Text(
                t.t('call.status.incoming'),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: type.caption.copyWith(
                  color: AppCallColors.onStage.withValues(alpha: 0.7),
                ),
              ),
              const SizedBox(height: AppSpacing.sm),
              Row(
                children: [
                  action(
                    key: const Key('call-waiting-decline'),
                    icon: AppIcons.callEndRounded,
                    fill: AppCallColors.end,
                    label: t.t('call.decline'),
                    onTap: () => unawaited(call.declineWaiting()),
                  ),
                  const SizedBox(width: AppSpacing.md),
                  action(
                    key: const Key('call-waiting-end-accept'),
                    icon: AppIcons.callRounded,
                    fill: AppCallColors.accept,
                    label: t.t('call.waiting.endAccept'),
                    onTap: () => unawaited(call.endAndAcceptWaiting()),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
