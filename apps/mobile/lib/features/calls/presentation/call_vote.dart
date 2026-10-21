import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';
import 'package:lawbid/features/calls/presentation/call_group.dart';
import 'package:lawbid/features/calls/presentation/call_widgets.dart';

/// Owner 2026-10-21: a small strip at the top of the call — "Remove X?",
/// For / Against, who has voted and the seconds left. Not a full screen and
/// not a dialog: the call goes on underneath. The candidate sees only that
/// they are being voted on.
class CallVoteStrip extends ConsumerStatefulWidget {
  const CallVoteStrip({required this.vote, required this.call, super.key});

  final CallVote vote;
  final AppCall call;

  @override
  ConsumerState<CallVoteStrip> createState() => _CallVoteStripState();
}

class _CallVoteStripState extends ConsumerState<CallVoteStrip> {
  Timer? _tick;

  @override
  void initState() {
    super.initState();
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  Future<void> _cast(bool favor) async {
    final code =
        await ref.read(callControllerProvider.notifier).castVote(favor: favor);
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
    final me = ref.watch(callMyIdProvider);
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final v = widget.vote;
    final target = widget.call.participants
        .where((m) => m.userId == v.targetId)
        .firstOrNull;
    final name = target?.name ?? '';
    final left = v.expiresAt.difference(DateTime.now()).inSeconds.clamp(0, 99);
    final iAmTarget = me == v.targetId;
    return Semantics(
      liveRegion: true,
      container: true,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.16),
          borderRadius: BorderRadius.circular(AppRadii.card),
        ),
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.sm,
            vertical: AppSpacing.xs,
          ),
          child: Row(
            children: [
              SizedBox(
                width: 32,
                height: 32,
                child: CallAvatar(
                  peer: CallPeer(
                    id: v.targetId,
                    isAttorney: false,
                    displayName: target?.displayName,
                    username: target?.username,
                    avatarUrl: target?.avatarUrl,
                  ),
                  size: 32,
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      iAmTarget
                          ? t.t('call.vote.target')
                          : t.t('call.vote.title', {'name': name}),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: type.caption.copyWith(color: Colors.white),
                    ),
                    Text(
                      '${v.forCount} / ${v.againstCount} · ${left}s',
                      style: type.caption.copyWith(
                        color: Colors.white.withValues(alpha: 0.7),
                      ),
                    ),
                  ],
                ),
              ),
              if (!iAmTarget) ...[
                _VoteButton(
                  key: const Key('call-vote-for'),
                  label: t.t('call.vote.for'),
                  selected: v.myBallot ?? false,
                  onTap: () => unawaited(_cast(true)),
                ),
                const SizedBox(width: AppSpacing.xs),
                _VoteButton(
                  key: const Key('call-vote-against'),
                  label: t.t('call.vote.against'),
                  selected: !(v.myBallot ?? true),
                  onTap: () => unawaited(_cast(false)),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _VoteButton extends StatelessWidget {
  const _VoteButton({
    required this.label,
    required this.selected,
    required this.onTap,
    super.key,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return Semantics(
      button: true,
      selected: selected,
      label: label,
      child: InkWell(
        borderRadius: BorderRadius.circular(AppRadii.pill),
        onTap: onTap,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 44, minWidth: 44),
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: selected ? Colors.white : Colors.transparent,
              border: Border.all(color: Colors.white.withValues(alpha: 0.6)),
              borderRadius: BorderRadius.circular(AppRadii.pill),
            ),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
              child: Center(
                widthFactor: 1,
                child: Text(
                  label,
                  style: type.caption.copyWith(
                    color: selected ? colors.navy : Colors.white,
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
