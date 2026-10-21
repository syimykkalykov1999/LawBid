import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/application/call_media.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';
import 'package:lawbid/features/calls/presentation/call_widgets.dart';

/// Owner 2026-10-20 (WhatsApp + Telegram): a call with three or more people
/// shows everyone as a tile — photo or camera, name, a mic-off mark, a gold
/// frame around whoever is speaking, a dimmed tile with "Calling…" for those
/// still ringing.
///
/// Owner 2026-10-21 (Zoom): a tap on a tile in a video call makes that
/// person the big picture, the others shrink to a strip below; a tap on the
/// big one goes back to the grid, a tap on a strip tile switches to them.
class CallGroupGrid extends ConsumerStatefulWidget {
  const CallGroupGrid({required this.session, required this.media, super.key});

  final CallSession session;
  final CallMedia? media;

  /// Who is on screen: joined people and those still ringing; us first.
  static List<CallMember> visibleMembers(AppCall call, String? me) {
    final shown = <CallMember>[
      for (final m in call.participants)
        if (m.joined || m.ringing) m,
    ]..sort((a, b) {
        if (a.userId == me) return -1;
        if (b.userId == me) return 1;
        if (a.joined != b.joined) return a.joined ? -1 : 1;
        return 0;
      });
    return shown;
  }

  @override
  ConsumerState<CallGroupGrid> createState() => _CallGroupGridState();
}

class _CallGroupGridState extends ConsumerState<CallGroupGrid> {
  /// The person shown big (null = the grid).
  String? _focus;

  void _tap(String userId) =>
      setState(() => _focus = _focus == userId ? null : userId);

  @override
  Widget build(BuildContext context) {
    final session = widget.session;
    final media = widget.media;
    final call = session.call;
    if (call == null) return const SizedBox.shrink();
    final me = ref.watch(callMyIdProvider);
    final members = CallGroupGrid.visibleMembers(call, me);
    final n = members.length;
    final cols = n <= 4 ? 2 : 3;
    final rows = (n / cols).ceil();
    final m = media;
    final focused = session.video
        ? members.where((x) => x.userId == _focus).firstOrNull
        : null;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
      child: LayoutBuilder(
        builder: (context, box) {
          const gap = AppSpacing.sm;
          final w = (box.maxWidth - gap * (cols - 1)) / cols;
          final h = (box.maxHeight - gap * (rows - 1)) / rows;
          final tile = Size(w, h.clamp(60, 280));
          Widget tileFor(CallMember member, Size size) {
            final isMe = member.userId == me;
            return SizedBox.fromSize(
              size: size,
              child: m == null
                  ? _MemberTile(
                      member: member,
                      isMe: isMe,
                      host: call.hostId == member.userId,
                      speaking: false,
                      stream: null,
                      mirror: isMe,
                      micOff: isMe ? session.muted : member.muted,
                    )
                  : ListenableBuilder(
                      listenable: Listenable.merge([
                        m.speaking,
                        m.remoteStreams,
                        m.localVideo,
                      ]),
                      builder: (_, __) {
                        final stream = !session.video
                            ? null
                            : isMe
                                ? (session.cameraOn ? m.localVideo.value : null)
                                : m.remoteStreams.value[member.userId];
                        return _MemberTile(
                          member: member,
                          isMe: isMe,
                          host: call.hostId == member.userId,
                          speaking: m.speaking.value.contains(
                            isMe ? kSelfSpeaker : member.userId,
                          ),
                          stream: stream,
                          mirror: isMe,
                          micOff: isMe ? session.muted : member.muted,
                        );
                      },
                    ),
            );
          }

          // A tap picks whose picture is big (video calls only).
          Widget tappable(CallMember member, Size size) => session.video
              ? GestureDetector(
                  key: Key('call-tile-${member.userId}'),
                  behavior: HitTestBehavior.opaque,
                  onTap: () => _tap(member.userId),
                  child: tileFor(member, size),
                )
              : tileFor(member, size);

          if (focused != null) {
            final others = [
              for (final x in members)
                if (x.userId != focused.userId) x,
            ];
            const strip = 96.0;
            return Column(
              children: [
                Expanded(
                  child: tappable(focused, Size(box.maxWidth, box.maxHeight)),
                ),
                const SizedBox(height: gap),
                SizedBox(
                  height: strip,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: others.length,
                    separatorBuilder: (_, __) => const SizedBox(width: gap),
                    itemBuilder: (_, i) =>
                        tappable(others[i], const Size(strip * 0.75, strip)),
                  ),
                ),
              ],
            );
          }

          return SingleChildScrollView(
            child: Center(
              child: Wrap(
                spacing: gap,
                runSpacing: gap,
                alignment: WrapAlignment.center,
                children: [
                  for (final member in members) tappable(member, tile),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

class _MemberTile extends StatelessWidget {
  const _MemberTile({
    required this.member,
    required this.isMe,
    required this.host,
    required this.speaking,
    required this.stream,
    required this.mirror,
    required this.micOff,
  });

  final CallMember member;
  final bool isMe;
  final bool host;
  final bool speaking;
  final MediaStream? stream;
  final bool mirror;
  final bool micOff;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final ringing = member.ringing;
    return Semantics(
      container: true,
      label: member.name,
      child: AnimatedContainer(
        duration: context.reduceMotion ? Duration.zero : AppMotion.stateChange,
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: ringing ? 0.05 : 0.1),
          borderRadius: BorderRadius.circular(AppRadii.card),
          border: Border.all(
            color: speaking ? colors.gold : Colors.transparent,
            width: 2,
          ),
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(AppRadii.card - 2),
          child: Stack(
            fit: StackFit.expand,
            children: [
              if (stream != null)
                CallVideoView(stream: stream!, mirror: mirror)
              else
                Center(
                  child: Opacity(
                    opacity: ringing ? 0.5 : 1,
                    child: LayoutBuilder(
                      builder: (_, box) => CallAvatar(
                        peer: CallPeer(
                          id: member.userId,
                          isAttorney: false,
                          displayName: member.displayName,
                          username: member.username,
                          avatarUrl: member.avatarUrl,
                        ),
                        size: (box.biggest.shortestSide * 0.55).clamp(44, 120),
                      ),
                    ),
                  ),
                ),
              PositionedDirectional(
                start: AppSpacing.sm,
                end: AppSpacing.sm,
                bottom: AppSpacing.xs,
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.45),
                    borderRadius: BorderRadius.circular(AppRadii.pill),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: AppSpacing.sm,
                      vertical: 2,
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            member.name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: type.caption.copyWith(color: Colors.white),
                          ),
                        ),
                        if (host)
                          AppIcon(
                            AppIcons.starRounded,
                            size: 14,
                            color: colors.goldLight,
                          ),
                      ],
                    ),
                  ),
                ),
              ),
              if (micOff && !ringing)
                PositionedDirectional(
                  top: AppSpacing.xs,
                  end: AppSpacing.xs,
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: Colors.black.withValues(alpha: 0.5),
                    ),
                    child: const Padding(
                      padding: EdgeInsets.all(4),
                      child: AppIcon(
                        AppIcons.micOffRounded,
                        size: 14,
                        color: Colors.white,
                      ),
                    ),
                  ),
                ),
              if (ringing)
                PositionedDirectional(
                  top: AppSpacing.xs,
                  start: AppSpacing.sm,
                  end: AppSpacing.sm,
                  child: Consumer(
                    builder: (context, ref, _) => FitText(
                      ref.watch(translatorProvider).t('call.status.calling'),
                      style: type.caption
                          .copyWith(color: Colors.white.withValues(alpha: 0.8)),
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
    unawaited(HapticFeedback.mediumImpact());
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

class _MembersSheet extends ConsumerWidget {
  const _MembersSheet();

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
    final members = CallGroupGrid.visibleMembers(call, me);
    final iAmHost = call.hostId != null && call.hostId == me;
    return SafeArea(
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
            const AppSheetHandle(),
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
                onPressed: () => unawaited(showAddToCallSheet(context)),
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
  final bool canManage;
  final bool canPropose;
  final VoidCallback onPropose;
  final bool muted;
  final VoidCallback onMute;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Consumer(
      builder: (context, ref, _) {
        final t = ref.watch(translatorProvider);
        final sub = member.ringing
            ? t.t('call.status.calling')
            : isHost
                ? t.t('call.host')
                : null;
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
                        style:
                            type.caption.copyWith(color: colors.textSecondary),
                      ),
                  ],
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

/// Adds a person to the running call by @username.
Future<void> showAddToCallSheet(BuildContext context) =>
    showAppBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => const _AddSheet(),
    );

class _AddSheet extends ConsumerStatefulWidget {
  const _AddSheet();

  @override
  ConsumerState<_AddSheet> createState() => _AddSheetState();
}

class _AddSheetState extends ConsumerState<_AddSheet> {
  final _field = TextEditingController();
  String? _error;
  bool _busy = false;

  @override
  void dispose() {
    _field.dispose();
    super.dispose();
  }

  Future<void> _add() async {
    // The "@" is already in the field; one typed or pasted is fine too.
    final name = _field.text.trim().replaceFirst(RegExp('^@+'), '');
    if (name.isEmpty || _busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    final code =
        await ref.read(callControllerProvider.notifier).invite(username: name);
    if (!mounted) return;
    if (code == null) {
      Navigator.of(context).pop();
      return;
    }
    setState(() {
      _busy = false;
      _error = callActionError(ref.read(translatorProvider), code);
    });
  }

  /// People of the phone book who are on LawBid (several can be ticked).
  Future<void> _fromContacts() async {
    if (_busy) return;
    final session = ref.read(callControllerProvider);
    final me = ref.read(callMyIdProvider);
    final skip = <String>{
      if (me != null) me,
      for (final m in session.call?.participants ?? const <CallMember>[])
        if (m.status != CallMemberStatus.left &&
            m.status != CallMemberStatus.declined)
          m.userId,
    };
    final pick = ref.read(callContactPickerProvider);
    if (pick == null) return;
    final picked = await pick(context, skip);
    if (!mounted || picked == null || picked.isEmpty) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    String? failure;
    for (final c in picked) {
      final code =
          await ref.read(callControllerProvider.notifier).invite(userId: c);
      if (code != null) failure ??= code;
      if (!mounted) return;
    }
    if (failure == null) {
      Navigator.of(context).pop();
      return;
    }
    setState(() {
      _busy = false;
      _error = callActionError(ref.read(translatorProvider), failure!);
    });
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SafeArea(
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
              const AppSheetHandle(),
              Text(
                t.t('call.addParticipant'),
                style: type.titleLarge.copyWith(color: colors.text),
              ),
              const SizedBox(height: AppSpacing.md),
              AppTextField(
                controller: _field,
                autofocus: true,
                leading: Text(
                  '@',
                  style: type.body.copyWith(color: colors.textSecondary),
                ),
                hintText: t.t('search.hint.username'),
                errorText: _error,
                textInputAction: TextInputAction.done,
                onChanged: (_) {
                  if (_error != null) setState(() => _error = null);
                },
                onSubmitted: (_) => unawaited(_add()),
              ),
              const SizedBox(height: AppSpacing.md),
              AppButton(
                label: t.t('call.add'),
                icon: AppIcons.personAddAlt1Rounded,
                isLoading: _busy,
                onPressed: () => unawaited(_add()),
              ),
              if (ref.watch(callContactPickerProvider) != null)
                const SizedBox(height: AppSpacing.sm),
              if (ref.watch(callContactPickerProvider) != null)
                AppButton(
                  label: t.t('phoneContacts.title'),
                  icon: AppIcons.contactPhoneOutlined,
                  variant: AppButtonVariant.secondary,
                  onPressed: _busy ? null : () => unawaited(_fromContacts()),
                ),
            ],
          ),
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
      return t.t('call.notAllowed');
    case 'USER_BLOCKED':
      return t.t('error.api.USER_BLOCKED');
    case 'PRIVACY_RESTRICTED':
      return t.t('error.api.PRIVACY_RESTRICTED');
  }
  return t.t('call.status.failed');
}
