import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/data/calls_repository.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';

/// Owner 2026-10-21 (WhatsApp): after leaving a group call it stays on
/// screen — «Group call · N · Return» — as long as people are still in it.
/// Everyone but those who were taken out can come back any time.
class CallRejoinBar extends ConsumerStatefulWidget {
  const CallRejoinBar({required this.rejoin, super.key});

  final GroupRejoin rejoin;

  @override
  ConsumerState<CallRejoinBar> createState() => _CallRejoinBarState();
}

/// Owner 2026-10-22 (load audit finding 3): with no event for this long
/// while the call runs, the bar is read again (a lost event).
const kRejoinSafetyRefresh = Duration(minutes: 5);

class _CallRejoinBarState extends ConsumerState<CallRejoinBar> {
  StreamSubscription<RealtimeEvent>? _events;
  Timer? _safety;
  AppCall? _running;

  @override
  void initState() {
    super.initState();
    unawaited(_refresh());
    // Owner 2026-10-22 (load audit finding 3): read when shown, then only
    // when the server says the call changed (it used to ask every 10 s).
    _events = ref.read(realtimeEventsProvider).listen((e) {
      if (_concerns(e)) unawaited(_refresh());
    });
  }

  /// This call's events: its group's call started / changed / ended, its
  /// people changed or it ended, or the socket came back after a gap.
  bool _concerns(RealtimeEvent e) {
    if (e.name == RealtimeEvent.reconnected) return true;
    final data = e.data;
    if (data is! Map) return false;
    final r = widget.rejoin;
    final callId = _running?.id ?? r.callId;
    switch (e.name) {
      case 'call:ongoing':
      case 'call:ongoing_ended':
        return (r.groupId != null && data['groupId'] == r.groupId) ||
            (callId != null && data['callId'] == callId);
      case 'call:participants':
        return callId != null && data['callId'] == callId;
      case 'call:ended':
        final call = data['call'];
        return callId != null && call is Map && call['id'] == callId;
    }
    return false;
  }

  @override
  void dispose() {
    unawaited(_events?.cancel());
    _safety?.cancel();
    super.dispose();
  }

  Future<void> _refresh() async {
    try {
      final r = widget.rejoin;
      final repo = ref.read(callsRepositoryProvider);
      final gid = r.groupId;
      final cid = r.callId;
      final call = gid != null
          ? await repo.groupCall(gid)
          : cid != null
              ? await repo.get(cid)
              : null;
      if (!mounted) return;
      final me = ref.read(callMyIdProvider);
      final mine = call?.participants.where((m) => m.userId == me).firstOrNull;
      if (call == null ||
          call.status != CallStatus.active ||
          mine?.status == CallMemberStatus.removed) {
        // Over, or we were taken out: nothing to return to.
        _safety?.cancel();
        ref.read(groupRejoinProvider.notifier).set(null);
        return;
      }
      setState(() => _running = call);
      _safety?.cancel();
      _safety = Timer(kRejoinSafetyRefresh, () => unawaited(_refresh()));
    } on Object {
      // Offline: keep what is shown.
    }
  }

  Future<void> _join() async {
    final call = _running;
    if (call == null) return;
    final r = widget.rejoin;
    final code = await ref.read(callControllerProvider.notifier).joinGroupCall(
          call,
          peer: CallPeer(
            id: r.groupId ?? call.peer.id,
            isAttorney: false,
            displayName: r.title,
            avatarUrl: r.avatarUrl,
          ),
        );
    if (code != null && mounted) await _refresh();
  }

  @override
  Widget build(BuildContext context) {
    final call = _running;
    if (call == null) return const SizedBox.shrink();
    final t = ref.watch(translatorProvider);
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final n = call.participants.where((m) => m.joined).length;
    final label = '${t.t('call.ongoing')} · $n';
    return Semantics(
      button: true,
      label: label,
      child: Material(
        color: colors.success,
        child: InkWell(
          key: const ValueKey('call-rejoin'),
          onTap: () => unawaited(_join()),
          child: SafeArea(
            bottom: false,
            child: SizedBox(
              height: 30,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const AppIcon(
                    AppIcons.callRounded,
                    size: 16,
                    color: Colors.white,
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Flexible(
                    child: Text(
                      '$label · ${t.t('call.returnToCall')}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: type.caption.copyWith(
                        color: Colors.white,
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
    );
  }
}
