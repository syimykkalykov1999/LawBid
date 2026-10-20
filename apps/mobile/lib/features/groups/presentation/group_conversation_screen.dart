import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/files/upload_limits.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/features/cases/presentation/widgets/detail_widgets.dart'
    show showConfirmSheet;
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/chat/chat_routes.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/groups/domain/group_message_ext.dart';
import 'package:lawbid/features/groups/group_routes.dart';
import 'package:lawbid/features/groups/presentation/group_message_text.dart';
import 'package:lawbid/features/groups/presentation/poll/create_poll_sheet.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_attach.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_composer.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_message_bubble.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_message_menu.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_pin_banner.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_system_line.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_topic_list.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart'
    show GoldRingAvatar;
import 'package:lawbid_api/lawbid_api.dart' as api;

/// A group chat (or one topic of a forum group): header with the group and
/// its menu, the pinned message, the messages (newest at the bottom, older
/// ones load as you scroll up), the composer. In a forum group opened
/// without a topic it shows the topic list instead.
class GroupConversationScreen extends ConsumerStatefulWidget {
  const GroupConversationScreen({
    required this.groupId,
    this.topicId,
    super.key,
  });

  final String groupId;
  final String? topicId;

  @override
  ConsumerState<GroupConversationScreen> createState() =>
      _GroupConversationScreenState();
}

class _GroupConversationScreenState
    extends ConsumerState<GroupConversationScreen> {
  final _scroll = ScrollController();
  final _text = TextEditingController();
  final Map<String, GlobalKey> _keys = {};
  StreamSubscription<Object?>? _events;
  Timer? _highlightTimer;

  api.GroupMessageDto? _replyTo;
  api.GroupMessageDto? _editing;
  String? _highlightId;
  bool _showDown = false;
  int _unreadAway = 0;
  int _uploading = 0;
  bool _removed = false;
  bool _goneHandled = false;

  GroupThreadKey get _key => (groupId: widget.groupId, topicId: widget.topicId);

  GroupThread get _thread => ref.read(groupThreadProvider(_key).notifier);

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_onScroll);
    // Being removed while the screen is open (also in the topic list,
    // which has no message thread of its own).
    _events = ref.read(realtimeEventsProvider).listen((e) {
      final data = e.data;
      if (e.name == 'group:member_removed' &&
          data is Map &&
          data['groupId'] == widget.groupId &&
          mounted) {
        setState(() => _removed = true);
      }
    });
  }

  @override
  void dispose() {
    _events?.cancel();
    _highlightTimer?.cancel();
    _scroll
      ..removeListener(_onScroll)
      ..dispose();
    _text.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (!_scroll.hasClients) return;
    final away = _scroll.offset > 280;
    if (away != _showDown || (!away && _unreadAway != 0)) {
      setState(() {
        _showDown = away;
        if (!away) _unreadAway = 0;
      });
    }
  }

  void _toBottom() {
    if (!_scroll.hasClients) return;
    _scroll.animateTo(
      0,
      duration: context.reduceMotion
          ? Duration.zero
          : const Duration(milliseconds: 280),
      curve: Curves.easeOut,
    );
  }

  GlobalKey _keyFor(String id) => _keys.putIfAbsent(id, GlobalKey.new);

  // --- jump to a message ----------------------------------------------------

  /// Scrolls to [id], loading older pages until it is found.
  Future<void> _jumpTo(String id) async {
    final t = ref.read(translatorProvider);
    for (var guard = 0; guard < 40; guard++) {
      if (!mounted) return;
      final s = ref.read(groupThreadProvider(_key));
      final index = s.messages.indexWhere((m) => m.id == id);
      if (index >= 0) {
        await _reveal(id, index);
        return;
      }
      if (!s.hasMore) break;
      await _thread.loadMore();
    }
    if (mounted) showAppSnackBar(context, t.t('group.conv.jumpMissing'));
  }

  Future<void> _reveal(String id, int index) async {
    for (var i = 0; i < 14; i++) {
      if (!mounted || !_scroll.hasClients) return;
      final ctx = _keys[id]?.currentContext;
      if (ctx != null && ctx.mounted) {
        await Scrollable.ensureVisible(
          ctx,
          alignment: 0.5,
          duration: context.reduceMotion
              ? Duration.zero
              : const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
        _flash(id);
        return;
      }
      // Not built yet: go near it by an estimate and look again.
      final target =
          (index * 96.0).clamp(0.0, _scroll.position.maxScrollExtent);
      _scroll.jumpTo(target);
      await WidgetsBinding.instance.endOfFrame;
    }
  }

  void _flash(String id) {
    _highlightTimer?.cancel();
    setState(() => _highlightId = id);
    _highlightTimer = Timer(const Duration(milliseconds: 1600), () {
      if (mounted) setState(() => _highlightId = null);
    });
  }

  // --- actions --------------------------------------------------------------

  void _error(Object e) {
    if (!mounted) return;
    showAppSnackBar(context, errorText(ref.read(translatorProvider), e));
  }

  void _send(String text, List<String> mentionIds) {
    final reply = _replyTo;
    setState(() => _replyTo = null);
    unawaited(
      _thread.sendText(text, replyToId: reply?.id, mentionIds: mentionIds),
    );
    _toBottom();
  }

  Future<void> _saveEdit(String text) async {
    final m = _editing;
    if (m == null) return;
    setState(() => _editing = null);
    if (text == m.body.trim()) return;
    try {
      await _thread.edit(m.id, text);
    } on Object catch (e) {
      if (!mounted) return;
      _error(e);
      setState(() => _editing = m);
    }
  }

  Future<void> _attach() async {
    final t = ref.read(translatorProvider);
    final choice = await showGroupAttachMenu(context, t);
    if (choice == null || !mounted) return;
    if (choice == GroupAttachChoice.poll) {
      await showCreatePollSheet(
        context,
        groupId: widget.groupId,
        topicId: widget.topicId,
      );
      return;
    }
    final files = await pickGroupFiles(
      context,
      t,
      choice,
      limits: ref.read(uploadLimitsProvider)[UploadPlace.chat],
    );
    if (files.isEmpty || !mounted) return;
    final caption = _text.text.trim();
    if (caption.isNotEmpty) _text.clear();
    final reply = _replyTo;
    if (reply != null) setState(() => _replyTo = null);
    final thread = _thread;
    final chat = ref.read(chatRepositoryProvider);
    setState(() => _uploading++);
    try {
      for (var i = 0; i < files.length; i++) {
        final f = files[i];
        final fileId = await chat.uploadAttachment(f.bytes, f.mime);
        if (!mounted) return;
        await thread.sendAttachment(
          fileId: fileId,
          fileName: f.name,
          caption: i == files.length - 1 && caption.isNotEmpty ? caption : null,
          replyToId: i == 0 ? reply?.id : null,
        );
      }
    } on Object catch (e) {
      _error(e);
    } finally {
      if (mounted) setState(() => _uploading--);
    }
    _toBottom();
  }

  Future<void> _menu(
    api.GroupMessageDto m,
    api.GroupDetailDto detail, {
    required bool canWrite,
  }) async {
    if (m.deleted || m.isSystem) return;
    final t = ref.read(translatorProvider);
    final pinned = detail.pinnedMessage?.id == m.id;
    final action = await showGroupMessageMenu(
      context,
      t,
      canReply: canWrite,
      canCopy: !m.isPoll && m.body.trim().isNotEmpty,
      canEdit: m.mine && m.type == api.GroupMessageDtoType.text,
      canPin: detail.isAdmin,
      pinned: pinned,
      canDelete: m.mine || detail.isAdmin,
    );
    if (action == null || !mounted) return;
    switch (action) {
      case GroupMessageAction.reply:
        setState(() {
          _replyTo = m;
          _editing = null;
        });
      case GroupMessageAction.copy:
        await Clipboard.setData(ClipboardData(text: m.body));
        if (mounted) showAppSnackBar(context, t.t('group.conv.copied'));
      case GroupMessageAction.edit:
        setState(() {
          _editing = m;
          _replyTo = null;
        });
      case GroupMessageAction.pin:
      case GroupMessageAction.unpin:
        try {
          await _thread.pin(action == GroupMessageAction.pin ? m.id : null);
        } on Object catch (e) {
          _error(e);
        }
      case GroupMessageAction.delete:
        final ok = await showConfirmSheet(
          context,
          t: t,
          title: t.t('group.conv.deleteTitle'),
          message: t.t('group.conv.deleteText'),
          confirmLabel: t.t('group.conv.deleteForAll'),
          destructive: true,
        );
        if (!ok || !mounted) return;
        try {
          await _thread.deleteForEveryone(m.id);
        } on Object catch (e) {
          _error(e);
        }
    }
  }

  Future<void> _headerMenu(api.GroupDetailDto detail) async {
    final t = ref.read(translatorProvider);
    final muted = detail.mutedUntil?.isAfter(DateTime.now()) ?? false;
    final choice = await showAppBottomSheet<String>(
      context: context,
      builder: (sheet) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const AppSheetHandle(),
            AppListRow(
              icon: AppIcons.infoOutlineRounded,
              label: t.t('group.conv.info'),
              showChevron: false,
              onTap: () => Navigator.of(sheet).pop('info'),
            ),
            AppListRow(
              icon: muted
                  ? AppIcons.notificationsActiveOutlined
                  : AppIcons.notificationsOffOutlined,
              label: t.t(muted ? 'group.conv.unmute' : 'group.conv.mute'),
              showChevron: false,
              onTap: () => Navigator.of(sheet).pop('mute'),
            ),
            AppListRow(
              icon: AppIcons.logoutRounded,
              label: t.t('group.conv.leave'),
              showChevron: false,
              destructive: true,
              onTap: () => Navigator.of(sheet).pop('leave'),
            ),
            const SizedBox(height: AppSpacing.md),
          ],
        ),
      ),
    );
    if (choice == null || !mounted) return;
    switch (choice) {
      case 'info':
        unawaited(context.push(GroupRoutes.info(detail.id)));
      case 'mute':
        await _toggleMute(detail, muted: muted);
      case 'leave':
        await _leave(detail);
    }
  }

  Future<void> _toggleMute(
    api.GroupDetailDto detail, {
    required bool muted,
  }) async {
    final t = ref.read(translatorProvider);
    try {
      await ref.read(groupRepositoryProvider).updateMine(
            detail.id,
            api.UpdateGroupMeDto(
              // The client cannot send an explicit null, so «unmute» is a
              // moment in the past: the mute has already ended.
              mutedUntil: muted
                  ? DateTime.now().toUtc().subtract(const Duration(seconds: 1))
                  : DateTime.now().toUtc().add(const Duration(days: 3650)),
            ),
          );
      if (!mounted) return;
      ref
        ..invalidate(groupDetailProvider(detail.id))
        ..invalidate(groupsProvider);
      showAppSnackBar(
        context,
        t.t(muted ? 'group.conv.unmuted' : 'group.conv.muted'),
      );
    } on Object catch (e) {
      _error(e);
    }
  }

  Future<void> _leave(api.GroupDetailDto detail) async {
    final t = ref.read(translatorProvider);
    final ok = await showConfirmSheet(
      context,
      t: t,
      title: t.t('group.conv.leaveTitle'),
      message: t.t('group.conv.leaveText', {'title': detail.title}),
      confirmLabel: t.t('group.conv.leave'),
      destructive: true,
    );
    if (!ok || !mounted) return;
    try {
      await ref.read(groupRepositoryProvider).leave(detail.id);
    } on Object catch (e) {
      _error(e);
      return;
    }
    if (!mounted) return;
    ref.invalidate(groupsProvider);
    if (context.canPop()) {
      context.pop();
    } else {
      context.go(ChatRoutes.inbox);
    }
  }

  // --- build ----------------------------------------------------------------

  void _back() {
    if (context.canPop()) {
      context.pop();
    } else {
      context.go(ChatRoutes.inbox);
    }
  }

  Widget _plain(Translator t, Widget body) => Scaffold(
        appBar: AppTopBar(
          leading: AppBackButton(
            semanticLabel: t.t('common.back'),
            onPressed: _back,
          ),
        ),
        body: body,
      );

  bool _isGone(Object? e) =>
      e is ApiException &&
      (e.code == ApiErrorCodes.groupNotFound ||
          e.code == ApiErrorCodes.groupForbidden);

  Widget _gone(Translator t) {
    if (!_goneHandled) {
      _goneHandled = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) ref.invalidate(groupsProvider);
      });
    }
    return _plain(
      t,
      AppEmptyState(
        icon: AppIcons.lockOutlineRounded,
        message: t.t('group.conv.gone'),
        action: AppButton(label: t.t('common.back'), onPressed: _back),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final async = ref.watch(groupDetailProvider(widget.groupId));
    if (_removed || _isGone(async.error)) return _gone(t);
    final detail = async.value;
    if (detail == null) {
      if (async.hasError) {
        return _plain(
          t,
          CasesErrorView(
            error: async.error!,
            t: t,
            onRetry: () => ref.invalidate(groupDetailProvider(widget.groupId)),
          ),
        );
      }
      return _plain(t, const CasesListSkeleton());
    }

    final topicList = detail.topicsEnabled && widget.topicId == null;
    api.GroupTopicDto? topic;
    if (detail.topicsEnabled && widget.topicId != null) {
      topic = ref
          .watch(groupTopicsProvider(widget.groupId))
          .value
          ?.where((x) => x.id == widget.topicId)
          .firstOrNull;
    }

    return Scaffold(
      backgroundColor: topicList ? null : ChatColors.of(context).wallpaper,
      appBar: AppTopBar(
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: _back,
        ),
        title: _Header(detail: detail, topic: topic),
        actions: [
          // The call button goes here, before the menu.
          AppIconButton(
            icon: AppIcon(
              AppIcons.moreVertRounded,
              color: Theme.of(context).extension<AppColorTokens>()!.text,
            ),
            semanticLabel: t.t('chat.menu'),
            onPressed: () => _headerMenu(detail),
          ),
        ],
      ),
      body:
          topicList ? GroupTopicList(detail: detail) : _chat(t, detail, topic),
    );
  }

  Widget _chat(
    Translator t,
    api.GroupDetailDto detail,
    api.GroupTopicDto? topic,
  ) {
    final s = ref.watch(groupThreadProvider(_key));
    ref.listen(
      groupThreadProvider(_key).select((x) => x.messages.firstOrNull?.id),
      (prev, next) {
        if (prev == null || next == null || prev == next) return;
        final newest = ref.read(groupThreadProvider(_key)).messages.first;
        if (!newest.mine && _scroll.hasClients && _scroll.offset > 120) {
          setState(() => _unreadAway++);
        }
      },
    );
    if (s.removed) return _gone(t);
    if (_isGone(s.error)) return _gone(t);

    final closed = topic?.closed ?? false;
    final canWrite = detail.canPost && (!closed || detail.isAdmin);
    final pinned = detail.pinnedMessage;
    final showPin = pinned != null &&
        !pinned.deleted &&
        (widget.topicId == null ||
            pinned.topicId == null ||
            pinned.topicId == widget.topicId);

    final Widget list;
    if (s.loading && s.messages.isEmpty) {
      list = const CasesListSkeleton();
    } else if (s.error != null && s.messages.isEmpty) {
      list = CasesErrorView(error: s.error!, t: t, onRetry: _thread.load);
    } else if (s.messages.isEmpty && s.pending.isEmpty) {
      list = AppEmptyState(
        icon: AppIcons.chatBubbleOutlineRounded,
        message: t.t('group.conv.empty'),
      );
    } else {
      list = _MessageList(
        state: s,
        detail: detail,
        controller: _scroll,
        keyFor: _keyFor,
        highlightId: _highlightId,
        canWrite: canWrite,
        onMore: _thread.loadMore,
        onMenu: (m) => _menu(m, detail, canWrite: canWrite),
        onReply: (m) => setState(() {
          _replyTo = m;
          _editing = null;
        }),
        onJump: _jumpTo,
        onRetry: _thread.retry,
        onDiscard: _thread.dropPending,
        onPollChanged: (m, p) => _thread.applyPoll(m.id, p),
      );
    }

    return Column(
      children: [
        if (showPin)
          GroupPinBanner(
            message: pinned,
            t: t,
            onTap: () => _jumpTo(pinned.id),
            onUnpin: detail.isAdmin
                ? () async {
                    try {
                      await _thread.pin(null);
                    } on Object catch (e) {
                      _error(e);
                    }
                  }
                : null,
          ),
        Expanded(
          child: Stack(
            children: [
              Positioned.fill(child: list),
              if (_showDown)
                PositionedDirectional(
                  end: AppSpacing.screenSide,
                  bottom: AppSpacing.md,
                  child: _DownButton(
                    count: _unreadAway,
                    label: t.t('group.conv.toBottom'),
                    onTap: _toBottom,
                  ),
                ),
            ],
          ),
        ),
        if (canWrite)
          GroupComposer(
            controller: _text,
            members: detail.members,
            replyTo: _replyTo,
            editing: _editing,
            uploading: _uploading > 0,
            onSend: _send,
            onSaveEdit: _saveEdit,
            onAttach: _attach,
            onCancelReply: () => setState(() => _replyTo = null),
            onCancelEdit: () {
              setState(() => _editing = null);
              _text.clear();
            },
          )
        else
          _ReadOnlyBar(
            text: t.t(
              detail.canPost
                  ? 'group.conv.topicClosed'
                  : 'group.onlyAdminsWrite',
            ),
          ),
      ],
    );
  }
}

class _Header extends ConsumerWidget {
  const _Header({required this.detail, required this.topic});

  final api.GroupDetailDto detail;
  final api.GroupTopicDto? topic;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final topic = this.topic;
    final String subtitle;
    if (topic != null) {
      final emoji = topic.iconEmoji?.trim();
      final name = topic.isGeneral ? t.t('group.topic.general') : topic.title;
      subtitle = emoji == null || emoji.isEmpty ? name : '$emoji $name';
    } else {
      subtitle = t.plural('group.conv.members', detail.memberCount);
    }
    return Semantics(
      button: true,
      label: t.t('group.conv.info'),
      child: AppPressable(
        key: const ValueKey('group-header'),
        onTap: () => context.push(GroupRoutes.info(detail.id)),
        child: Row(
          children: [
            GoldRingAvatar(
              url: detail.avatarUrl,
              initials: avatarInitials(detail.title),
              size: 36,
            ),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    detail.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: type.body.copyWith(
                      color: colors.text,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  Text(
                    subtitle,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: type.caption.copyWith(color: colors.textSecondary),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ReadOnlyBar extends StatelessWidget {
  const _ReadOnlyBar({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Material(
      color: colors.surface,
      child: SafeArea(
        top: false,
        child: Container(
          width: double.infinity,
          constraints: const BoxConstraints(minHeight: AppSizes.touchTarget),
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.screenSide,
            vertical: AppSpacing.md,
          ),
          decoration: BoxDecoration(
            border: Border(top: BorderSide(color: colors.border)),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              AppIcon(
                AppIcons.lockOutlineRounded,
                size: 16,
                color: colors.textSecondary,
              ),
              const SizedBox(width: AppSpacing.sm),
              Flexible(
                child: Text(
                  text,
                  textAlign: TextAlign.center,
                  style: type.bodySmall.copyWith(color: colors.textSecondary),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _DownButton extends StatelessWidget {
  const _DownButton({
    required this.count,
    required this.label,
    required this.onTap,
  });

  final int count;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Semantics(
      button: true,
      label: count > 0 ? '$label, $count' : label,
      excludeSemantics: true,
      child: AppPressable(
        onTap: onTap,
        child: SizedBox.square(
          dimension: AppSizes.touchTarget + 8,
          child: Stack(
            clipBehavior: Clip.none,
            alignment: Alignment.center,
            children: [
              Container(
                width: AppSizes.touchTarget,
                height: AppSizes.touchTarget,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: colors.surface,
                  border: Border.all(color: colors.border),
                  boxShadow: [
                    BoxShadow(
                      color: colors.shadow.withValues(alpha: 0.18),
                      blurRadius: 8,
                      offset: const Offset(0, 2),
                    ),
                  ],
                ),
                child: AppIcon(
                  AppIcons.expandMoreRounded,
                  color: colors.text,
                ),
              ),
              if (count > 0)
                PositionedDirectional(
                  top: 0,
                  end: 0,
                  child: Container(
                    constraints:
                        const BoxConstraints(minWidth: 20, minHeight: 20),
                    padding: const EdgeInsets.symmetric(horizontal: 6),
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: colors.gold,
                      borderRadius: BorderRadius.circular(AppRadii.pill),
                    ),
                    child: Text(
                      count > 99 ? '99+' : '$count',
                      style: type.caption.copyWith(
                        color: colors.navy,
                        fontWeight: FontWeight.w700,
                        fontSize: 11,
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

/// The messages, newest at the bottom; unsent ones below them; the day
/// separators, the runs of one sender and the older pages.
class _MessageList extends ConsumerWidget {
  const _MessageList({
    required this.state,
    required this.detail,
    required this.controller,
    required this.keyFor,
    required this.highlightId,
    required this.canWrite,
    required this.onMore,
    required this.onMenu,
    required this.onReply,
    required this.onJump,
    required this.onRetry,
    required this.onDiscard,
    required this.onPollChanged,
  });

  final GroupThreadState state;
  final api.GroupDetailDto detail;
  final ScrollController controller;
  final GlobalKey Function(String id) keyFor;
  final String? highlightId;
  final bool canWrite;
  final Future<void> Function() onMore;
  final void Function(api.GroupMessageDto m) onMenu;
  final void Function(api.GroupMessageDto m) onReply;
  final void Function(String id) onJump;
  final void Function(String clientMessageId) onRetry;
  final void Function(String clientMessageId) onDiscard;
  final void Function(api.GroupMessageDto m, api.PollDto p) onPollChanged;

  static String _dayLabel(Translator t, L10nFormats f, DateTime at) {
    final now = DateTime.now();
    final d = at.toLocal();
    if (DateUtils.isSameDay(d, now)) return t.t('chat.today');
    if (DateUtils.isSameDay(d, now.subtract(const Duration(days: 1)))) {
      return t.t('chat.yesterday');
    }
    return f.dateLong(d);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final messages = state.messages;
    final pending = state.pending;
    final extra = state.hasMore ? 1 : 0;
    return ListView.builder(
      reverse: true,
      controller: controller,
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.screenSide,
        vertical: AppSpacing.md,
      ),
      itemCount: pending.length + messages.length + extra,
      itemBuilder: (context, i) {
        if (i < pending.length) {
          final p = pending[pending.length - 1 - i];
          return GroupPendingBubble(
            pending: p,
            onRetry: () => onRetry(p.clientMessageId),
            onDiscard: () => onDiscard(p.clientMessageId),
          );
        }
        final k = i - pending.length;
        if (k >= messages.length) {
          // Ask for the older page after this frame (never during build).
          if (!state.loadingMore) {
            WidgetsBinding.instance.addPostFrameCallback((_) => onMore());
          }
          return const Padding(
            padding: EdgeInsets.all(AppSpacing.md),
            child: Center(
              child: SizedBox.square(
                dimension: AppSizes.footerSpinner,
                child: CircularProgressIndicator(
                  strokeWidth: AppSizes.footerSpinnerStroke,
                ),
              ),
            ),
          );
        }
        final m = messages[k];
        final older = k + 1 < messages.length ? messages[k + 1] : null;
        final newer = k > 0 ? messages[k - 1] : null;
        final newDay = older == null ||
            !DateUtils.isSameDay(
              older.createdAt.toLocal(),
              m.createdAt.toLocal(),
            );
        bool sameRun(api.GroupMessageDto? other) =>
            other != null &&
            !other.isSystem &&
            other.sender?.userId == m.sender?.userId &&
            other.mine == m.mine;
        final startsRun = newDay || !sameRun(older);
        final endsRun = !sameRun(newer);

        final Widget item;
        if (m.isSystem) {
          item = GroupSystemLine(text: groupSystemText(t, m));
        } else {
          item = GroupMessageBubble(
            message: m,
            groupId: detail.id,
            showName: startsRun,
            showAvatar: endsRun,
            canClose: m.mine || detail.isAdmin,
            highlighted: highlightId == m.id,
            onMenu: () => onMenu(m),
            onReply: canWrite && !m.deleted ? () => onReply(m) : null,
            onJump: onJump,
            onPollChanged: (p) => onPollChanged(m, p),
          );
        }
        return Column(
          key: keyFor(m.id),
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (newDay) _DaySeparator(label: _dayLabel(t, f, m.createdAt)),
            item,
          ],
        );
      },
    );
  }
}

class _DaySeparator extends StatelessWidget {
  const _DaySeparator({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final chat = ChatColors.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.md),
      child: Center(
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
          decoration: BoxDecoration(
            color: chat.theirs.withValues(alpha: colors.isGlass ? 1 : 0.92),
            borderRadius: BorderRadius.circular(AppRadii.pill),
            border: Border.all(color: chat.theirsBorder),
          ),
          child: Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: type.caption.copyWith(
              color: colors.textSecondary,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ),
    );
  }
}
