import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/design_system/widgets/display/app_network_image.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/application/live_calls.dart';
import 'package:lawbid/features/chat/application/voice_recorder.dart'
    show voiceClock;

/// Owner 2026-10-23 (WhatsApp / Telegram): the call button above the «+» of
/// Chats while a call I am in (minimised) or can join is going on. The same
/// floating button as the «+» (one component), a handset on it and a small
/// blinking green dot. One call: a tap opens / joins it. Several: a sheet with
/// only the running calls. Nothing is shown when no call runs.
class LiveCallsFab extends ConsumerWidget {
  const LiveCallsFab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final calls = ref.watch(liveCallsProvider);
    if (calls.isEmpty) return const SizedBox.shrink();
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.md),
      child: AppFab(
        buttonKey: const ValueKey('chats-live-call'),
        iconKey: const ValueKey('chats-live-call-icon'),
        semanticLabel: t.t('calls.ongoingNow'),
        icon: AppIcons.callRounded,
        background: colors.surface,
        foreground: colors.success,
        liveDot: true,
        onPressed: () => unawaited(_open(context, ref, calls)),
      ),
    );
  }

  Future<void> _open(
    BuildContext context,
    WidgetRef ref,
    List<LiveCall> calls,
  ) async {
    if (calls.length == 1) {
      await joinLiveCall(context, ref, calls.single);
      return;
    }
    await showAppBottomSheet<void>(
      context: context,
      builder: (ctx) => const LiveCallsSheet(),
    );
  }
}

/// Joins (or returns to) [call]; a refusal is shown as a snack bar.
Future<void> joinLiveCall(
  BuildContext context,
  WidgetRef ref,
  LiveCall call,
) async {
  final t = ref.read(translatorProvider);
  final router = GoRouter.maybeOf(context);
  try {
    final code = await ref.read(joinLiveCallProvider)(call, router);
    if (code != null && context.mounted) {
      showAppSnackBar(
        context,
        t.t(code == kMicDenied ? 'call.micDenied' : 'error.default.message'),
      );
    }
  } on Object {
    if (context.mounted) showAppSnackBar(context, t.t('error.default.message'));
  }
}

/// Only the calls that are going on, each with who / how many / how long and
/// «Join» or «Return». Closes itself when the last call ends.
class LiveCallsSheet extends ConsumerWidget {
  const LiveCallsSheet({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final calls = ref.watch(liveCallsProvider);
    final t = ref.watch(translatorProvider);
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    ref.listen(liveCallsProvider, (_, next) {
      if (next.isEmpty && Navigator.of(context).canPop()) {
        Navigator.of(context).pop();
      }
    });
    return SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const SizedBox(height: AppSpacing.sm),
          const AppSheetHandle(),
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.screenSide,
              AppSpacing.sm,
              AppSpacing.screenSide,
              AppSpacing.sm,
            ),
            child: Align(
              alignment: AlignmentDirectional.centerStart,
              child: Text(t.t('calls.ongoingNow'), style: type.titleMedium),
            ),
          ),
          Flexible(
            child: ListView(
              shrinkWrap: true,
              children: [
                for (final c in calls)
                  LiveCallRow(
                    key: ValueKey('live-call-${c.id}'),
                    call: c,
                    afterJoin: () {
                      if (Navigator.of(context).canPop()) {
                        Navigator.of(context).pop();
                      }
                    },
                  ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.md),
        ],
      ),
    );
  }
}

/// Avatar · name · «people · length» · green «Join» / «Return».
class LiveCallRow extends ConsumerStatefulWidget {
  const LiveCallRow({required this.call, this.afterJoin, super.key});

  final LiveCall call;
  final VoidCallback? afterJoin;

  @override
  ConsumerState<LiveCallRow> createState() => _LiveCallRowState();
}

class _LiveCallRowState extends ConsumerState<LiveCallRow> {
  bool _busy = false;

  Future<void> _join() async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await joinLiveCall(context, ref, widget.call);
      widget.afterJoin?.call();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.call;
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return InkWell(
      onTap: _join,
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.screenSide,
          vertical: AppSpacing.sm,
        ),
        child: Row(
          children: [
            AppAvatar(
              // AN-5: the one avatar path of the app (disk cache keyed by
              // the file, decoded small) — the same picture as CallAvatar.
              imageProvider: c.avatarUrl == null
                  ? null
                  : appNetworkImage(c.avatarUrl!, decodeWidthFor(44)),
              initials: avatarInitials(c.title),
              size: 44,
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    c.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: type.body.copyWith(
                      color: colors.text,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  LiveCallSubtitle(call: c),
                ],
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            LiveCallJoinButton(
              mine: c.mine,
              busy: _busy,
              onPressed: _join,
            ),
          ],
        ),
      ),
    );
  }
}

/// «📞 People · 3 · 12:34» - the length ticks every second.
class LiveCallSubtitle extends ConsumerStatefulWidget {
  const LiveCallSubtitle({required this.call, super.key});

  final LiveCall call;

  @override
  ConsumerState<LiveCallSubtitle> createState() => _LiveCallSubtitleState();
}

class _LiveCallSubtitleState extends ConsumerState<LiveCallSubtitle> {
  Timer? _tick;

  @override
  void initState() {
    super.initState();
    if (widget.call.startedAt != null) {
      _tick = Timer.periodic(const Duration(seconds: 1), (_) {
        if (mounted) setState(() {});
      });
    }
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.call;
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final at = c.startedAt;
    var length = '';
    if (at != null) {
      final since = DateTime.now().difference(at);
      final shown = since.isNegative ? Duration.zero : since;
      length = ' · ${f.digits(voiceClock(shown))}';
    }
    return Row(
      children: [
        AppIcon(
          c.video ? AppIcons.videoCameraOutlined : AppIcons.callOutlined,
          size: 14,
          color: colors.success,
        ),
        const SizedBox(width: AppSpacing.xs),
        Flexible(
          child: Text(
            '${t.t('call.members')} · ${f.digits(c.joined)}$length',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: type.caption.copyWith(color: colors.textSecondary),
          ),
        ),
      ],
    );
  }
}

/// The green «Join» / «Return» pill of a running call.
class LiveCallJoinButton extends ConsumerWidget {
  const LiveCallJoinButton({
    required this.mine,
    required this.onPressed,
    this.busy = false,
    super.key,
  });

  final bool mine;
  final bool busy;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    return AppSuccessPill(
      key: ValueKey(mine ? 'ongoing-return' : 'ongoing-join'),
      label: t.t(mine ? 'calls.return' : 'group.call.join'),
      busy: busy,
      onPressed: onPressed,
    );
  }
}
