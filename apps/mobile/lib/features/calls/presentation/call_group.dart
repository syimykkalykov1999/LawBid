import 'dart:async';

import 'package:flutter/foundation.dart' show ValueListenable;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/design_system/haptics/app_haptics.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/application/call_media.dart';
import 'package:lawbid/features/calls/application/call_video_layout.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';
import 'package:lawbid/features/calls/presentation/call_add_panel.dart';
import 'package:lawbid/features/calls/presentation/call_stage.dart';
import 'package:lawbid/features/calls/presentation/call_widgets.dart';

export 'package:lawbid/features/calls/presentation/call_stage.dart'
    show CallGroupGrid;

/// "Host muted you" for a few seconds; the person may switch the mic on.
class CallNoticeBanner extends ConsumerStatefulWidget {
  const CallNoticeBanner({required this.notice, super.key});

  /// `MUTED_BY_HOST`, `VOTE_PASSED:<userId>` or `VOTE_FAILED:<userId>`.

  final String notice;

  @override
  ConsumerState<CallNoticeBanner> createState() => _CallNoticeBannerState();
}

class _CallNoticeBannerState extends ConsumerState<CallNoticeBanner> {
  Timer? _hide;

  @override
  void initState() {
    super.initState();
    unawaited(AppHaptics.medium());
    _hide = Timer(const Duration(seconds: 4), () {
      if (mounted) ref.read(callControllerProvider.notifier).dismissNotice();
    });
  }

  @override
  void dispose() {
    _hide?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final parts = widget.notice.split(':');
    final voteKey = switch (parts.first) {
      kNoticeVotePassed => 'call.vote.passed',
      kNoticeVoteFailed => 'call.vote.failed',
      _ => null,
    };
    final who = parts.length > 1
        ? ref
                .watch(callControllerProvider)
                .call
                ?.participants
                .where((m) => m.userId == parts[1])
                .firstOrNull
                ?.name ??
            ''
        : '';
    final text =
        voteKey == null ? t.t('call.mutedByHost') : t.t(voteKey, {'name': who});
    return Semantics(
      liveRegion: true,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.14),
          borderRadius: BorderRadius.circular(AppRadii.pill),
        ),
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.md,
            vertical: AppSpacing.xs,
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              AppIcon(
                voteKey == null
                    ? AppIcons.micOffRounded
                    : AppIcons.groups2Rounded,
                size: 16,
                color: colors.iconTint,
              ),
              const SizedBox(width: AppSpacing.xs),
              Flexible(
                child: FitText(
                  text,
                  style: type.caption.copyWith(color: Colors.white),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// The people in the call: the host can switch a microphone off or remove
/// someone; everyone can add a person.
Future<void> showCallMembersSheet(BuildContext context) =>
    showAppBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => const _MembersSheet(),
    );

/// Owner 2026-10-26 (WhatsApp): the people in the call and «Add
/// participant», shown inside the pulled-up control sheet (white on the
/// dark sheet).
class CallMembersPanel extends StatelessWidget {
  const CallMembersPanel({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.extension<AppColorTokens>()!;
    return Theme(
      data: theme.copyWith(
        extensions: [
          ...theme.extensions.values.where((e) => e is! AppColorTokens),
          colors.copyWith(
            text: Colors.white,
            textSecondary: Colors.white.withValues(alpha: 0.7),
          ),
        ],
      ),
      child: const _MembersSheet(inSheet: true),
    );
  }
}

class _MembersSheet extends ConsumerWidget {
  const _MembersSheet({this.inSheet = false});

  /// Inside the call's own control sheet: no handle, no safe area.
  final bool inSheet;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final s = ref.watch(callControllerProvider);
    final c = ref.read(callControllerProvider.notifier);
    final call = s.call;
    final me = ref.watch(callMyIdProvider);
    if (call == null) return const SizedBox.shrink();
    // A call of two: the two of us (WhatsApp lists them too).
    final members = call.group
        ? CallGroupGrid.visibleMembers(call, me)
        : [
            CallMember(
              userId: call.peer.id,
              status: CallMemberStatus.joined,
              displayName: call.peer.displayName,
              username: call.peer.username,
              avatarUrl: call.peer.avatarUrl,
            ),
          ];
    final iAmHost = call.hostId != null && call.hostId == me;
    // Owner 2026-10-21 (inbox 20f, Telegram): who speaks and whose camera is
    // off show in the list too.
    final media = c.media;
    final camerasOff = ref.watch(callCamerasOffProvider);
    bool cameraOff(CallMember m) {
      if (!s.video || !m.joined) return false;
      if (m.userId == me) return !s.cameraOn;
      return camerasOff.contains(m.userId) ||
          media?.remoteStreams.value[m.userId] == null;
    }

    return SafeArea(
      top: !inSheet,
      bottom: !inSheet,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.screenSide,
          AppSpacing.md,
          AppSpacing.screenSide,
          AppSpacing.lg,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (!inSheet) const AppSheetHandle(),
            Text(
              '${t.t('call.members')} · ${members.length}',
              style: type.titleLarge.copyWith(color: colors.text),
            ),
            const SizedBox(height: AppSpacing.sm),
            Flexible(
              child: ListView(
                shrinkWrap: true,
                children: [
                  for (final m in members)
                    _MemberRow(
                      member: m,
                      isMe: m.userId == me,
                      isHost: m.userId == call.hostId,
                      speaking: media?.speaking,
                      speakerId: m.userId == me ? kSelfSpeaker : m.userId,
                      cameraOff: cameraOff(m),
                      canManage: iAmHost && m.userId != me,
                      canPropose: call.vote == null &&
                          m.joined &&
                          m.userId != me &&
                          s.phase == CallPhase.active,
                      onPropose: () => unawaited(
                        _run(context, t, c.proposeRemoval(m.userId)),
                      ),
                      muted: m.userId == me ? s.muted : m.muted,
                      onMute: () =>
                          unawaited(_run(context, t, c.muteMember(m.userId))),
                      onRemove: () =>
                          unawaited(_confirmRemove(context, t, c, m)),
                    ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.md),
            if (s.phase == CallPhase.active)
              AppButton(
                label: t.t('call.addParticipant'),
                icon: AppIcons.personAddAlt1Rounded,
                onPressed: () => unawaited(showAddToCallPanel(context)),
              ),
          ],
        ),
      ),
    );
  }

  Future<void> _run(
    BuildContext context,
    Translator t,
    Future<String?> action,
  ) async {
    final code = await action;
    if (code != null && context.mounted) {
      showAppSnackBar(context, callActionError(t, code));
    }
  }

  Future<void> _confirmRemove(
    BuildContext context,
    Translator t,
    CallController c,
    CallMember m,
  ) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(m.name),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text(t.t('common.cancel')),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(t.t('common.remove')),
          ),
        ],
      ),
    );
    if (ok ?? false) {
      if (!context.mounted) return;
      await _run(context, t, c.removeMember(m.userId));
    }
  }
}

class _MemberRow extends StatelessWidget {
  const _MemberRow({
    required this.member,
    required this.isMe,
    required this.isHost,
    required this.speaking,
    required this.speakerId,
    required this.cameraOff,
    required this.canManage,
    required this.canPropose,
    required this.onPropose,
    required this.muted,
    required this.onMute,
    required this.onRemove,
  });

  final CallMember member;
  final bool isMe;
  final bool isHost;

  /// Who speaks now (the media's voice levels); null before the media opens.
  final ValueListenable<Set<String>>? speaking;
  final String speakerId;

  /// A video call and this person's picture is off.
  final bool cameraOff;
  final bool canManage;
  final bool canPropose;
  final VoidCallback onPropose;
  final bool muted;
  final VoidCallback onMute;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final speaking = this.speaking;
    if (speaking == null) return _row(context, talking: false);
    return ValueListenableBuilder<Set<String>>(
      valueListenable: speaking,
      builder: (context, now, _) =>
          _row(context, talking: member.joined && now.contains(speakerId)),
    );
  }

  Widget _row(BuildContext context, {required bool talking}) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Consumer(
      builder: (context, ref, _) {
        final t = ref.watch(translatorProvider);
        final parts = [
          if (isHost) t.t('call.host'),
          if (talking) t.t('call.speaking'),
        ];
        final sub = member.ringing
            ? t.t('call.status.calling')
            : parts.isEmpty
                ? null
                : parts.join(' · ');
        return Padding(
          padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
          child: Row(
            children: [
              SizedBox(
                width: 40,
                height: 40,
                child: CallAvatar(
                  peer: CallPeer(
                    id: member.userId,
                    isAttorney: false,
                    displayName: member.displayName,
                    username: member.username,
                    avatarUrl: member.avatarUrl,
                  ),
                  size: 40,
                ),
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      member.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: type.body.copyWith(color: colors.text),
                    ),
                    if (sub != null)
                      FitText(
                        sub,
                        alignment: AlignmentDirectional.centerStart,
                        style: type.caption.copyWith(
                          color: talking
                              ? colors.goldAccent
                              : colors.textSecondary,
                        ),
                      ),
                  ],
                ),
              ),
              if (cameraOff)
                Padding(
                  padding: const EdgeInsetsDirectional.only(end: AppSpacing.xs),
                  child: AppIcon(
                    AppIcons.videocamOffOutlined,
                    key: ValueKey('call-member-camera-off-${member.userId}'),
                    size: 20,
                    color: colors.textSecondary,
                  ),
                ),
              if (member.joined && muted)
                Padding(
                  padding: const EdgeInsetsDirectional.only(end: AppSpacing.xs),
                  child: AppIcon(
                    AppIcons.micOffRounded,
                    size: 20,
                    color: colors.textSecondary,
                  ),
                ),
              if (canManage && member.joined && !muted)
                _RowButton(
                  icon: AppIcons.micOffRounded,
                  label: t.t('call.mute'),
                  onTap: onMute,
                ),
              if (canManage)
                _RowButton(
                  icon: AppIcons.closeRounded,
                  label: t.t('common.remove'),
                  onTap: onRemove,
                )
              else if (canPropose)
                _RowButton(
                  icon: AppIcons.closeRounded,
                  label: t.t('call.vote.kick'),
                  onTap: onPropose,
                ),
            ],
          ),
        );
      },
    );
  }
}

class _RowButton extends StatelessWidget {
  const _RowButton({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return Semantics(
      button: true,
      label: label,
      excludeSemantics: true,
      child: InkResponse(
        onTap: onTap,
        radius: 24,
        child: SizedBox(
          width: 44,
          height: 44,
          child: Center(child: AppIcon(icon, size: 22, color: colors.text)),
        ),
      ),
    );
  }
}

/// A short, translated reason for a refused group-call action.
String callActionError(Translator t, String code) {
  switch (code) {
    case 'NOT_FOUND':
      return t.t('error.api.NOT_FOUND');
    case 'CALL_IN_PROGRESS':
      return t.t('call.status.busy');
    case 'CALL_STATE_CONFLICT':
      return t.t('call.full');
    case 'CALL_NOT_ALLOWED':
      // Adding a person: no accepted chat with them yet (Requests first).
      return t.t('call.notAllowedRequest');
    case 'USER_BLOCKED':
      return t.t('error.api.USER_BLOCKED');
    case 'PRIVACY_RESTRICTED':
      return t.t('error.api.PRIVACY_RESTRICTED');
  }
  return t.t('call.status.failed');
}
