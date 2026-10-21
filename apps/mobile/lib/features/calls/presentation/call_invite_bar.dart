import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/presentation/call_group.dart';

/// Owner 2026-10-21 (Telegram): a call started in a group chat, or an
/// invitation into it, is one light row — «X · Call in progress · Join» —
/// with no ringtone and no full screen. Fades after a minute.
class CallInviteBar extends ConsumerStatefulWidget {
  const CallInviteBar({required this.invite, super.key});

  final CallInvite invite;

  @override
  ConsumerState<CallInviteBar> createState() => _CallInviteBarState();
}

class _CallInviteBarState extends ConsumerState<CallInviteBar> {
  Timer? _hide;

  @override
  void initState() {
    super.initState();
    _hide = Timer(const Duration(minutes: 1), _close);
  }

  @override
  void dispose() {
    _hide?.cancel();
    super.dispose();
  }

  void _close() {
    if (mounted) ref.read(callInviteProvider.notifier).set(null);
  }

  Future<void> _join() async {
    final code = await ref
        .read(callControllerProvider.notifier)
        .joinInvite(widget.invite);
    if (code != null && mounted) {
      showAppSnackBar(
        context,
        callActionError(ref.read(translatorProvider), code),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final i = widget.invite;
    final head = i.title.isNotEmpty ? i.title : i.who;
    return Material(
      color: colors.surface,
      elevation: 2,
      child: SafeArea(
        bottom: false,
        child: SizedBox(
          height: 48,
          child: Row(
            children: [
              const SizedBox(width: AppSpacing.screenSide),
              AppIcon(
                i.video ? AppIcons.videoCameraOutlined : AppIcons.callOutlined,
                color: colors.iconTint,
                size: 22,
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Text(
                  head.isEmpty
                      ? t.t('call.ongoing')
                      : '$head · ${t.t('call.ongoing')}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: type.body.copyWith(color: colors.text),
                ),
              ),
              InkWell(
                key: const ValueKey('call-invite-join'),
                onTap: () => unawaited(_join()),
                child: ConstrainedBox(
                  constraints:
                      const BoxConstraints(minHeight: 44, minWidth: 44),
                  child: Center(
                    widthFactor: 1,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: AppSpacing.sm,
                      ),
                      child: Text(
                        t.t('group.call.join'),
                        maxLines: 1,
                        style: type.body.copyWith(
                          color: colors.gold,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
              Semantics(
                button: true,
                label: t.t('common.cancel'),
                child: InkWell(
                  onTap: _close,
                  child: SizedBox(
                    width: 44,
                    height: 44,
                    child: Center(
                      child: AppIcon(
                        AppIcons.closeRounded,
                        size: 20,
                        color: colors.textSecondary,
                      ),
                    ),
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
