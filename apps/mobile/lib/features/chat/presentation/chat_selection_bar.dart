import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/cases/presentation/widgets/detail_widgets.dart'
    show showConfirmSheet;
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/application/chat_selection.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/groups/application/chat_list_merge.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Bulk actions on the picked chats: pin · move · mute · delete (from my
/// list only — the history stays with the other side and comes back with
/// a new message). Picked groups take part in pin · mute · delete (hide);
/// «Move» (folders) is off while a group is picked.
class ChatSelectionBar extends ConsumerStatefulWidget {
  const ChatSelectionBar({
    required this.chats,
    this.groups = const [],
    this.inArchive = false,
    super.key,
  });

  /// The chats of the visible folder (to find the picked ones).
  final List<Conversation> chats;

  /// The groups of the visible list.
  final List<api.GroupDto> groups;

  /// On the Archive screen the action is «Unarchive».
  final bool inArchive;

  @override
  ConsumerState<ChatSelectionBar> createState() => _ChatSelectionBarState();
}

class _ChatSelectionBarState extends ConsumerState<ChatSelectionBar> {
  bool _busy = false;

  List<Conversation> get _picked {
    final ids = ref.read(chatSelectionProvider) ?? const <String>{};
    return widget.chats.where((c) => ids.contains(c.id)).toList();
  }

  List<api.GroupDto> get _pickedGroups {
    final ids = ref.read(chatSelectionProvider) ?? const <String>{};
    return widget.groups.where((g) => ids.contains(g.id)).toList();
  }

  Future<void> _each(
    Future<void> Function(Conversation c) call, {
    required String done,
    Future<void> Function(api.GroupDto g)? groupCall,
  }) async {
    final t = ref.read(translatorProvider);
    final picked = _picked;
    final groups = groupCall == null ? const <api.GroupDto>[] : _pickedGroups;
    if ((picked.isEmpty && groups.isEmpty) || _busy) return;
    setState(() => _busy = true);
    Object? failure;
    try {
      for (final c in picked) {
        await call(c);
      }
      for (final g in groups) {
        await groupCall!(g);
      }
    } on Object catch (e) {
      failure = e;
    }
    // The writes are over: re-reading the lists is not part of them, so a
    // failure (or a bar already gone with the selection) is never shown as
    // «something went wrong» for a chat that did move.
    try {
      refreshChatFolders(ref);
      if (failure == null) ref.read(chatSelectionProvider.notifier).stop();
    } on Object {
      // Disposed with the selection: nothing left to refresh.
    }
    if (mounted) {
      setState(() => _busy = false);
      showAppSnackBar(
        context,
        failure == null ? t.t(done) : errorText(t, failure),
      );
    }
  }

  Future<void> _pin() {
    final picked = _picked;
    // All pinned → unpin them; otherwise pin them all.
    final pin =
        picked.any((c) => !c.pinned) || _pickedGroups.any((g) => !g.pinned);
    return _each(
      (c) => ref.read(chatRepositoryProvider).organize(c.id, pinned: pin),
      groupCall: (g) => updateMyGroup(ref, g.id, pinned: pin),
      done: pin ? 'chat.organize.pinned' : 'chat.organize.unpinned',
    );
  }

  Future<void> _mute() {
    final unmute =
        _picked.every((c) => c.muted) && _pickedGroups.every(isGroupMuted);
    return _each(
      (c) => ref.read(chatRepositoryProvider).mute(
            c.id,
            unmute ? null : DateTime.now().add(const Duration(days: 3650)),
          ),
      groupCall: (g) => updateMyGroup(ref, g.id, muted: !unmute),
      done: unmute ? 'chat.select.unmuted' : 'chat.select.muted',
    );
  }

  /// Owner 2026-10-20 (Telegram): chats and groups to the Archive (or back).
  Future<void> _archive() => _each(
        (c) => ref
            .read(chatRepositoryProvider)
            .organize(c.id, archived: !widget.inArchive),
        groupCall: (g) => updateMyGroup(ref, g.id, archived: !widget.inArchive),
        done: widget.inArchive ? 'chat.unarchive' : 'tasks.bulk.archive',
      );

  /// Owner 2026-10-20: «mark read» for the chats picked (groups keep their own
  /// read marks).
  Future<void> _readAll() => _each(
        (c) async {
          final last = c.lastMessage;
          if (c.unreadCount > 0 && last != null) {
            await ref.read(chatRepositoryProvider).read(c.id, last.id);
          }
        },
        done: 'notif.markAllRead',
      );

  Future<void> _delete() async {
    final t = ref.read(translatorProvider);
    final n = _picked.length + _pickedGroups.length;
    final withGroups = _pickedGroups.isNotEmpty;
    final ok = await showConfirmSheet(
      context,
      t: t,
      title: t.t('chat.select.deleteTitle', {'count': '$n'}),
      message: t.t(
        withGroups ? 'group.select.hideMessage' : 'chat.select.deleteMessage',
      ),
      confirmLabel: t.t('chat.select.delete'),
      destructive: true,
    );
    if (!ok || !mounted) return;
    await _each(
      (c) => ref.read(chatRepositoryProvider).organize(c.id, hidden: true),
      groupCall: (g) => updateMyGroup(ref, g.id, hidden: true),
      done: 'chat.select.deleted',
    );
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final ids = ref.watch(chatSelectionProvider) ?? const <String>{};
    final active = ids.isNotEmpty && !_busy;
    final muteAll =
        _picked.every((c) => c.muted) && _pickedGroups.every(isGroupMuted);
    final pinAll = ids.isNotEmpty &&
        _picked.every((c) => c.pinned) &&
        _pickedGroups.every((g) => g.pinned);

    final specs = <_BarAction>[
      _BarAction(
        'select-archive',
        widget.inArchive
            ? AppIcons.unarchiveOutlined
            : AppIcons.inventory2Outlined,
        t.t(widget.inArchive ? 'chat.unarchive' : 'tasks.bulk.archive'),
        _archive,
      ),
      _BarAction(
        'select-pin',
        AppIcons.pushPinOutlined,
        t.t(pinAll ? 'group.menu.unpin' : 'chat.select.pin'),
        _pin,
      ),
      _BarAction(
        'select-mute',
        AppIcons.notificationsOffOutlined,
        t.t(muteAll && ids.isNotEmpty ? 'chat.unmute' : 'chat.mute'),
        _mute,
      ),
      _BarAction(
        'select-read',
        AppIcons.doneAllRounded,
        t.t('chat.seen'),
        _readAll,
      ),
      _BarAction(
        'select-delete',
        AppIcons.deleteOutlineRounded,
        t.t('chat.select.delete'),
        _delete,
        danger: true,
      ),
    ];

    return Material(
      color: colors.surface,
      elevation: 8,
      child: SafeArea(
        top: false,
        child: LayoutBuilder(
          builder: (context, box) {
            // Telegram: icon + short caption; when a caption does not fit its
            // cell in one line (long language, large text), every cell shows
            // the icon alone and the caption moves to the tooltip.
            final cell = box.maxWidth / specs.length;
            final style = type.caption;
            final scaler = MediaQuery.textScalerOf(context);
            final dir = Directionality.of(context);
            final captions = specs.every((a) {
              final p = TextPainter(
                text: TextSpan(text: a.label, style: style),
                textDirection: dir,
                textScaler: scaler,
                maxLines: 1,
              )..layout();
              final fits = p.width <= cell - AppSpacing.xs;
              p.dispose();
              return fits;
            });
            return Row(
              children: [
                for (final a in specs)
                  Expanded(
                    child: _BarCell(
                      spec: a,
                      enabled: active,
                      captions: captions,
                      color: !active
                          ? colors.textSecondary.withValues(alpha: 0.5)
                          : a.danger
                              ? colors.dangerText
                              : colors.text,
                      style: style,
                    ),
                  ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _BarAction {
  const _BarAction(
    this.keyName,
    this.icon,
    this.label,
    this.onTap, {
    this.danger = false,
  });

  final String keyName;
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool danger;
}

class _BarCell extends StatelessWidget {
  const _BarCell({
    required this.spec,
    required this.enabled,
    required this.captions,
    required this.color,
    required this.style,
  });

  final _BarAction spec;
  final bool enabled;
  final bool captions;
  final Color color;
  final TextStyle style;

  @override
  Widget build(BuildContext context) {
    final cell = Semantics(
      button: true,
      enabled: enabled,
      label: spec.label,
      excludeSemantics: true,
      child: AppPressable(
        key: ValueKey(spec.keyName),
        onTap: enabled ? spec.onTap : null,
        child: SizedBox(
          height: 56,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              AppIcon(spec.icon, color: color),
              if (captions) ...[
                const SizedBox(height: 2),
                Text(
                  spec.label,
                  maxLines: 1,
                  softWrap: false,
                  style: style.copyWith(color: color),
                ),
              ],
            ],
          ),
        ),
      ),
    );
    return captions
        ? cell
        : Tooltip(message: spec.label, excludeFromSemantics: true, child: cell);
  }
}
