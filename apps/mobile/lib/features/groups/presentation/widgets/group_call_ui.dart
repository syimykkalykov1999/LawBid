import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show ProviderListenable;
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/groups/application/group_call_port.dart';
import 'package:lawbid/features/groups/domain/ongoing_call.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_avatar.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Mesh calls hold nine people, audio or video (the server's
/// GROUP_MAX_AUDIO / GROUP_MAX_VIDEO; inbox 20d). More need an SFU.
const groupCallMax = 9;

/// How many members the host rings (the host takes one place).
int groupCallRingMax({required bool video}) => groupCallMax - 1;

/// A short, translated reason a group / channel call did not start or join;
/// [max] is the size of the call in the reader's digits.
String groupCallError(Translator t, String code, {String? max}) =>
    switch (code) {
      'CALL_IN_PROGRESS' => t.t('call.inProgress'),
      'GROUP_FORBIDDEN' => t.t('error.api.GROUP_FORBIDDEN'),
      'CALL_STATE_CONFLICT' =>
        t.t('call.fullMax', {'count': max ?? '$groupCallMax'}),
      'MIC_DENIED' => t.t('call.micDenied'),
      _ => t.t('call.status.failed'),
    };

/// Phone / video button of a group chat: rings the chosen members.
/// A group small enough to ring everybody is rung at once; a bigger one asks
/// whom to call first. Returns the error code, or null.
Future<String?> startGroupChatCall(
  BuildContext context,
  WidgetRef ref,
  api.GroupDetailDto detail, {
  required bool video,
  required String? me,
}) async {
  final port = ref.read(groupCallPortProvider);
  if (port == null) return 'ERROR';
  final others = [
    for (final m in detail.members)
      if (m.userId != me) m,
  ];
  final max = groupCallRingMax(video: video);
  var ids = [for (final m in others.take(max)) m.userId];
  if (others.length > max) {
    final picked = await showModalBottomSheet<List<String>>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Theme.of(context).extension<AppColorTokens>()!.surface,
      builder: (_) => _CallPickerSheet(members: others, max: max, video: video),
    );
    if (picked == null) return null;
    ids = picked;
  }
  return port.start(
    detail.id,
    title: detail.title,
    avatarUrl: detail.avatarUrl,
    video: video,
    userIds: ids,
  );
}

class _CallPickerSheet extends ConsumerStatefulWidget {
  const _CallPickerSheet({
    required this.members,
    required this.max,
    required this.video,
  });

  final List<api.GroupMemberDto> members;
  final int max;
  final bool video;

  @override
  ConsumerState<_CallPickerSheet> createState() => _CallPickerSheetState();
}

class _CallPickerSheetState extends ConsumerState<_CallPickerSheet> {
  final _picked = <String>[];

  void _toggle(String id) => setState(() {
        if (!_picked.remove(id) && _picked.length < widget.max) {
          _picked.add(id);
        }
      });

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final height = MediaQuery.sizeOf(context).height * 0.8;
    return SafeArea(
      child: SizedBox(
        height: height,
        child: Column(
          children: [
            const AppSheetHandle(),
            Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.screenSide,
                vertical: AppSpacing.xs,
              ),
              child: Align(
                alignment: AlignmentDirectional.centerStart,
                child: Text(
                  t.t('call.members'),
                  style: type.titleMedium.copyWith(color: colors.text),
                ),
              ),
            ),
            Expanded(
              child: ListView.builder(
                itemCount: widget.members.length,
                itemBuilder: (context, i) {
                  final m = widget.members[i];
                  final name = (m.displayName ?? m.username ?? '').trim();
                  final on = _picked.contains(m.userId);
                  return Semantics(
                    checked: on,
                    label: name,
                    excludeSemantics: true,
                    onTap: () => _toggle(m.userId),
                    child: InkWell(
                      onTap: () => _toggle(m.userId),
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(
                          minHeight: AppSizes.hitTarget,
                        ),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(
                            horizontal: AppSpacing.screenSide,
                            vertical: AppSpacing.xs,
                          ),
                          child: Row(
                            children: [
                              GroupAvatar(name: name, url: m.avatarUrl),
                              const SizedBox(width: AppSpacing.md),
                              Expanded(
                                child: Text(
                                  name,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: type.body.copyWith(color: colors.text),
                                ),
                              ),
                              const SizedBox(width: AppSpacing.sm),
                              AppIcon(
                                on
                                    ? AppIcons.checkCircleRounded
                                    : AppIcons.radioButtonUncheckedRounded,
                                color:
                                    on ? colors.iconTint : colors.textSecondary,
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(AppSpacing.screenSide),
              child: AppButton(
                key: const ValueKey('group-call-start'),
                label: t.t(widget.video ? 'call.videoButton' : 'call.button'),
                onPressed: () => Navigator.of(context).pop(
                  List<String>.of(_picked),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Overlapping faces of the people in a running call (Telegram: three).
class CallFacesStack extends StatelessWidget {
  const CallFacesStack({
    required this.faces,
    this.size = 24,
    super.key,
  });

  /// (name, avatar url) of the first people.
  final List<({String name, String? url})> faces;
  final double size;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final shown = faces.take(3).toList();
    if (shown.isEmpty) return const SizedBox.shrink();
    final step = size * 0.62;
    return ExcludeSemantics(
      child: SizedBox(
        width: size + step * (shown.length - 1),
        height: size,
        child: Stack(
          children: [
            for (var i = shown.length - 1; i >= 0; i--)
              PositionedDirectional(
                start: step * i,
                child: Container(
                  padding: const EdgeInsets.all(1.5),
                  decoration: BoxDecoration(
                    color: colors.surface,
                    shape: BoxShape.circle,
                  ),
                  child: GroupAvatar(
                    name: shown[i].name,
                    url: shown[i].url,
                    size: size - 3,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// «Call in progress · People: N» — the bar text and the list rows.
String ongoingCallLabel(Translator t, BuildContext context, int count) =>
    count > 0
        ? '${t.t('call.ongoing')} · '
            '${t.t('group.find.members', {'count': context.digits(count)})}'
        : t.t('call.ongoing');

/// Owner 2026-10-21 (inbox 20e/20f): the line a group / channel row shows
/// instead of its last message while a call runs there — an icon, the first
/// faces and «Call in progress · People: N».
class OngoingCallLine extends ConsumerWidget {
  const OngoingCallLine({required this.call, super.key});

  final OngoingCallSummary call;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Row(
      key: ValueKey('ongoing-call-${call.id}'),
      children: [
        AppIcon(
          call.video ? AppIcons.videoCameraOutlined : AppIcons.callOutlined,
          size: 16,
          color: colors.iconTint,
        ),
        const SizedBox(width: AppSpacing.xs),
        CallFacesStack(
          size: 18,
          faces: [
            for (final f in call.faces) (name: f.name ?? '?', url: f.avatarUrl),
          ],
        ),
        if (call.faces.isNotEmpty) const SizedBox(width: AppSpacing.xs),
        Expanded(
          child: Text(
            ongoingCallLabel(t, context, call.count),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: type.bodySmall.copyWith(
              color: colors.goldAccent,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ],
    );
  }
}

/// «Call in progress · People: N · Join» under the header of a group chat or
/// a channel (Telegram's video chat bar): the first faces; a tap opens the
/// list of the people in it, «Join» goes straight in.
class GroupCallJoinBar extends ConsumerWidget {
  const GroupCallJoinBar({
    required this.running,
    required this.onJoin,
    this.live,
    super.key,
  });

  final GroupRunningCall running;
  final VoidCallback onJoin;

  /// Where the people list reads the call from while it is open (live).
  final ProviderListenable<AsyncValue<GroupRunningCall?>>? live;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final action = t.t(
      running.returning ? 'call.returnToCall' : 'group.call.join',
    );
    return Material(
      color: colors.surface,
      child: Container(
        height: 48,
        decoration: BoxDecoration(
          border: Border(bottom: BorderSide(color: colors.border)),
        ),
        child: Row(
          children: [
            Expanded(
              child: InkWell(
                key: const ValueKey('group-call-people'),
                onTap: running.returning
                    ? onJoin
                    : () => unawaited(
                          showRunningCallSheet(
                            context,
                            running: running,
                            live: live,
                            onJoin: onJoin,
                          ),
                        ),
                child: Padding(
                  padding: const EdgeInsetsDirectional.only(
                    start: AppSpacing.screenSide,
                  ),
                  child: Row(
                    children: [
                      AppIcon(
                        running.video
                            ? AppIcons.videoCameraOutlined
                            : AppIcons.callOutlined,
                        color: colors.iconTint,
                        size: 22,
                      ),
                      const SizedBox(width: AppSpacing.sm),
                      CallFacesStack(
                        faces: [
                          for (final p in running.people)
                            (name: p.name, url: p.avatarUrl),
                        ],
                      ),
                      if (running.people.isNotEmpty)
                        const SizedBox(width: AppSpacing.sm),
                      Expanded(
                        child: Text(
                          ongoingCallLabel(t, context, running.members),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: type.body.copyWith(color: colors.text),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 160),
              child: Semantics(
                button: true,
                label: action,
                excludeSemantics: true,
                child: InkWell(
                  key: const ValueKey('group-call-join'),
                  onTap: onJoin,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: AppSpacing.screenSide,
                      vertical: AppSpacing.sm,
                    ),
                    child: Text(
                      action,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: type.body.copyWith(
                        color: colors.gold,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Owner 2026-10-21 (inbox 20f, Telegram): the people in a running call as
/// someone outside it sees them — photo, name, the host marked, a crossed
/// microphone — with «Join» at the bottom. Kept live from [live].
Future<void> showRunningCallSheet(
  BuildContext context, {
  required GroupRunningCall running,
  required VoidCallback onJoin,
  ProviderListenable<AsyncValue<GroupRunningCall?>>? live,
}) =>
    showAppBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _RunningCallSheet(
        first: running,
        live: live,
        onJoin: onJoin,
      ),
    );

class _RunningCallSheet extends ConsumerWidget {
  const _RunningCallSheet({
    required this.first,
    required this.onJoin,
    this.live,
  });

  final GroupRunningCall first;
  final ProviderListenable<AsyncValue<GroupRunningCall?>>? live;
  final VoidCallback onJoin;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final source = live;
    final running = source == null ? first : ref.watch(source).value ?? first;
    final maxHeight = MediaQuery.sizeOf(context).height * 0.7;
    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: maxHeight),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.screenSide,
            AppSpacing.sm,
            AppSpacing.screenSide,
            AppSpacing.lg,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const AppSheetHandle(),
              Row(
                children: [
                  AppIcon(
                    running.video
                        ? AppIcons.videoCameraOutlined
                        : AppIcons.callOutlined,
                    color: colors.iconTint,
                    size: 22,
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: Text(
                      ongoingCallLabel(t, context, running.members),
                      key: const ValueKey('running-call-title'),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: type.titleMedium.copyWith(color: colors.text),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.sm),
              Flexible(
                child: ListView(
                  shrinkWrap: true,
                  children: [
                    for (final p in running.people)
                      _RunningCallRow(
                        key: ValueKey('running-${p.userId}'),
                        p: p,
                      ),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.md),
              AppButton(
                key: const ValueKey('running-call-join'),
                label: t.t(
                  running.returning ? 'call.returnToCall' : 'group.call.join',
                ),
                icon: running.video
                    ? AppIcons.videoCameraOutlined
                    : AppIcons.callOutlined,
                onPressed: () {
                  Navigator.of(context).pop();
                  onJoin();
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _RunningCallRow extends ConsumerWidget {
  const _RunningCallRow({required this.p, super.key});

  final RunningCallMember p;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
      child: Row(
        children: [
          GroupAvatar(name: p.name, url: p.avatarUrl),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  p.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: type.body.copyWith(color: colors.text),
                ),
                if (p.host)
                  Text(
                    t.t('call.host'),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: type.caption.copyWith(color: colors.textSecondary),
                  ),
              ],
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          AppIcon(
            p.muted ? AppIcons.micOffRounded : AppIcons.micRounded,
            key: ValueKey('running-mic-${p.userId}'),
            size: 20,
            color: p.muted ? colors.textSecondary : colors.iconTint,
          ),
        ],
      ),
    );
  }
}
