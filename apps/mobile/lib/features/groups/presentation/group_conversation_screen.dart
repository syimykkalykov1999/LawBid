import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart' show XFile;
import 'package:lawbid/core/config/client_tuning.dart';
import 'package:lawbid/core/connectivity/connection_title.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/design_system/haptics/app_haptics.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/files/upload_limits.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/media/video_compression.dart';
import 'package:lawbid/core/navigation/pop_if_current.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/features/cases/presentation/widgets/detail_widgets.dart'
    show showConfirmSheet;
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/application/chat_text_drafts.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/chat/application/voice_recorder.dart';
import 'package:lawbid/features/chat/chat_routes.dart';
import 'package:lawbid/features/chat/domain/forward.dart';
import 'package:lawbid/features/chat/presentation/attachment_widgets.dart'
    show PickedChatFile, droppedChatFiles;
import 'package:lawbid/features/chat/presentation/chat_list_controller.dart';
import 'package:lawbid/features/chat/presentation/edit_draft_aside.dart';
import 'package:lawbid/features/chat/presentation/forward_sheet.dart';
import 'package:lawbid/features/chat/presentation/in_chat_search.dart';
import 'package:lawbid/features/chat/presentation/voice_widgets.dart'
    show VoiceThread;
import 'package:lawbid/features/groups/application/group_call_port.dart';
import 'package:lawbid/features/groups/application/group_photo_outbox.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/groups/application/group_typing.dart';
import 'package:lawbid/features/groups/domain/group_message_ext.dart';
import 'package:lawbid/features/groups/group_routes.dart';
import 'package:lawbid/features/groups/presentation/group_message_text.dart';
import 'package:lawbid/features/groups/presentation/poll/create_poll_sheet.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_attach.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_call_ui.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_composer.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_info_sheets.dart'
    show muteDuration, pickMute;
import 'package:lawbid/features/groups/presentation/widgets/group_message_bubble.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_message_menu.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_pin_banner.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_readers_sheet.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_selection_bar.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_system_line.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_topic_list.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart'
    show GoldRingAvatar;
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:lawbid/shared/presentation/file_drop_zone.dart';
import 'package:lawbid/shared/presentation/interactive_keyboard.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;
import 'package:material_ui/material_ui.dart';

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
  // Audit 26.10 B3: keeps what is read in place when a message comes in.
  final _anchor = ChatScrollAnchor();
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

  /// Owner 2026-10-21 (Telegram): the messages picked in «Select» mode.
  Set<String> _selected = const {};

  GroupThreadKey get _key => (groupId: widget.groupId, topicId: widget.topicId);

  GroupThread get _thread => ref.read(groupThreadProvider(_key).notifier);

  /// Groups WhatsApp parity, the 1:1 chat's drafts (chatTextDraftsProvider,
  /// kept on the device per account): the unsent text of this group (or
  /// topic) survives leaving the chat and killing the app.
  String get _draftKey => groupDraftKey(widget.groupId, widget.topicId);

  /// The draft (and the quoted message) that wait while an old message is
  /// edited - the 1:1 chat's keeper (ROUND1 25.11 rows 13, 30).
  final _heldDraft = EditDraftAside<api.GroupMessageDto>();

  void _saveDraft() {
    // The field holds the edited message's text then, not a draft.
    if (_editing != null) return;
    ref.read(chatTextDraftsProvider.notifier).set(_draftKey, _text.text);
  }

  /// Leaves edit mode (the composer clears the field); the draft that
  /// waited comes back right after.
  void _stopEditing() {
    if (_editing == null) return;
    _editing = null;
    final aside = _heldDraft.release();
    // The quote that was open before «Изменить» is back (1:1), unless
    // «Ответить» on another message is what ends the edit.
    _replyTo ??= aside.quote;
    final held = aside.text;
    if (held.isEmpty) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && _editing == null && _text.text.isEmpty) {
        _text.value = TextEditingValue(
          text: held,
          selection: TextSelection.collapsed(offset: held.length),
        );
      }
    });
  }

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_onScroll);
    // Groups WhatsApp parity (1:1 ConversationScreen): the unsent text is
    // back.
    final draft = ref.read(chatTextDraftsProvider.notifier).of(_draftKey);
    if (draft != null) _text.text = draft;
    _text
      ..addListener(_saveDraft)
      ..addListener(_onTyping);
    // A call may start or end in the group while this chat is open:
    // groupRunningCallProvider follows the server's `call:ongoing` events
    // (owner 2026-10-22, load audit finding 3: no 10 s polling).
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

  /// D1-2: my «typing…» to the group while the field has text (not while
  /// editing an old message), at most every 2 s.
  void _onTyping() {
    if (_text.text.trim().isEmpty || _editing != null) return;
    ref.read(groupTypingProvider(widget.groupId).notifier).send(true);
  }

  // Row 110 (Telegram 🔍 in a chat): the search, while it is open.
  InChatSearch? _search;
  final _searchText = TextEditingController();

  void _openSearch() {
    final repo = ref.read(groupRepositoryProvider);
    setState(() {
      _search = InChatSearch(
        search: (q, {cursor}) async {
          final page = await repo.searchMessages(
            widget.groupId,
            q,
            topicId: widget.topicId,
            cursor: cursor,
          );
          return CursorPage(
            items: [for (final m in page.items) m.id],
            nextCursor: page.nextCursor,
          );
        },
        jump: (id) async {
          await _jumpTo(id);
          return true;
        },
      );
    });
  }

  void _closeSearch() {
    final s = _search;
    if (s == null) return;
    setState(() => _search = null);
    _searchText.clear();
    s.dispose();
  }

  @override
  void dispose() {
    _search?.dispose();
    _searchText.dispose();
    _events?.cancel();
    _highlightTimer?.cancel();
    _scroll
      ..removeListener(_onScroll)
      ..dispose();
    _text
      ..removeListener(_saveDraft)
      ..dispose();
    super.dispose();
  }

  Future<void> _startCall(
    api.GroupDetailDto detail, {
    required bool video,
  }) async {
    final code = await startGroupChatCall(
      context,
      ref,
      detail,
      video: video,
      me: ref.read(currentUserIdProvider),
    );
    if (code != null && mounted) {
      showAppSnackBar(
        context,
        groupCallError(
          ref.read(translatorProvider),
          code,
          max: context.digits(groupCallMax),
        ),
      );
    }
    ref.invalidate(groupRunningCallProvider(widget.groupId));
  }

  Future<void> _joinCall(
    api.GroupDetailDto detail,
    GroupRunningCall running,
  ) async {
    final code = await running.join(detail.title, detail.avatarUrl);
    if (code != null && mounted) {
      showAppSnackBar(
        context,
        groupCallError(
          ref.read(translatorProvider),
          code,
          max: context.digits(groupCallMax),
        ),
      );
    }
    ref.invalidate(groupRunningCallProvider(widget.groupId));
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
      // The page did not come (failed / backing off): stop instead of spinning.
      if (!mounted) return;
      if (ref.read(groupThreadProvider(_key)).messages.length ==
          s.messages.length) {
        break;
      }
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
      final target = (index * 96.0).clamp(
        0.0,
        _scroll.position.maxScrollExtent,
      );
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

  /// Groups WhatsApp parity: a recorded note goes through the queue (the
  /// 1:1 chat's), as a reply when one is open.
  Future<void> _sendVoice(VoiceRecording r) async {
    final reply = _replyTo;
    setState(() => _replyTo = null);
    _toBottom();
    try {
      await _thread.sendVoice(
        path: r.path,
        durationMs: r.durationMs,
        waveform: r.waveform,
        replyToId: reply?.id,
      );
    } on Object catch (e) {
      _error(e);
    }
  }

  void _send(String text, List<String> mentionIds) {
    ref.read(groupTypingProvider(widget.groupId).notifier).send(false);
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
    if (text == m.body.trim()) {
      setState(_stopEditing);
      return;
    }
    try {
      await _thread.edit(m.id, text);
      // Leaving edit mode also clears the field; a failure keeps the text.
      if (mounted && _editing?.id == m.id) setState(_stopEditing);
    } on Object catch (e) {
      if (!mounted) return;
      _error(e);
    }
  }

  Future<void> _attach() async {
    final t = ref.read(translatorProvider);
    final d = ref.read(groupDetailProvider(widget.groupId)).value;
    final choice = await showGroupAttachMenu(
      context,
      t,
      media: d?.canSendMedia ?? true,
      poll: d?.canSendPolls ?? true,
      video: ref.read(uploadLimitsProvider)[UploadPlace.chat].allowsVideo,
    );
    if (choice == null || !mounted) return;
    if (choice == GroupAttachChoice.poll) {
      await showCreatePollSheet(
        context,
        groupId: widget.groupId,
        topicId: widget.topicId,
      );
      return;
    }
    // R-255: the queue and the disk, not memory; off = as before.
    final fromDisk = ref
        .read(featureFlagsControllerProvider)
        .isEnabled('group_files_from_disk');
    final limits = ref.read(uploadLimitsProvider)[UploadPlace.chat];
    final prepareVideo = _videoPreparer();
    if (!fromDisk) {
      final files = await pickGroupFiles(
        context,
        t,
        choice,
        limits: limits,
        prepareVideo: prepareVideo,
      );
      await _sendFiles(files, fromDisk: false);
      return;
    }
    // Owner 26.11 (WhatsApp / Telegram): each picked file goes to the
    // upload queue — and its bubble on screen, with its own picture and
    // ring — the moment it is ready, while the next ones are still being
    // prepared, instead of all of them at the end. Read before the first
    // await: the group may be left meanwhile and the files must still go.
    final thread = _thread;
    final caption = _editing != null ? '' : _text.text.trim();
    if (caption.isNotEmpty) _text.clear();
    final reply = _replyTo;
    if (reply != null) setState(() => _replyTo = null);
    // The previous file waits for the next one: only the last one carries
    // the caption (the album's caption, as before).
    PickedChatFile? held;
    var queued = 0;
    Future<void> queue(PickedChatFile f, {String? text}) async {
      await thread.queueAttachment(
        bytes: f.bytes,
        path: f.path,
        name: f.name,
        mime: f.mime,
        caption: text,
        replyToId: queued == 0 ? reply?.id : null,
      );
      queued++;
      if (mounted) _toBottom();
    }

    try {
      await thread.keepAliveWhile(() async {
        await pickGroupFiles(
          context,
          t,
          choice,
          limits: limits,
          fromDisk: true,
          prepareVideo: prepareVideo,
          onEach: (f) async {
            final before = held;
            held = f;
            if (before != null) await queue(before);
          },
        );
        final last = held;
        if (last != null) {
          await queue(last, text: caption.isEmpty ? null : caption);
        } else if (caption.isNotEmpty) {
          // Nothing could be sent: the typed text is not lost.
          await thread.sendText(caption, replyToId: reply?.id);
        }
      });
    } on Object catch (e) {
      // Never a silent loss (owner 26.11): what failed is said.
      if (mounted) _error(e);
    }
  }

  /// Groups WhatsApp parity, copied from the 1:1 chat (ConversationScreen):
  /// a video is re-encoded on the phone to at most the admin's
  /// `media.chat_video_max_height` before upload — the one encode it gets;
  /// the original goes when compressing fails or doesn't help. Everything
  /// it needs is read now: the files keep being prepared after the screen
  /// is left.
  Future<XFile> Function(XFile video) _videoPreparer() {
    final t = ref.read(translatorProvider);
    final limits = chatVideoLimitsOf(ref.read(featureFlagsControllerProvider));
    final compressor = ref.read(videoCompressorProvider);
    return (video) async {
      if (mounted) showAppSnackBar(context, t.t('chat.attach.videoPreparing'));
      final out = await compressor.compress(video, limits: limits);
      return out == null
          ? video
          : XFile(out.path, name: 'video.mp4', mimeType: 'video/mp4');
    };
  }

  /// Files dragged onto the group in the browser go out like picked ones.
  Future<void> _drop(List<XFile> dropped) async {
    final files = await droppedChatFiles(
      context,
      ref.read(translatorProvider),
      dropped,
      limits: ref.read(uploadLimitsProvider)[UploadPlace.chat],
    );
    await _sendFiles(
      files,
      fromDisk: ref
          .read(featureFlagsControllerProvider)
          .isEnabled('group_files_from_disk'),
    );
  }

  Future<void> _sendFiles(
    List<PickedChatFile> files, {
    required bool fromDisk,
  }) async {
    if (files.isEmpty || !mounted) return;
    // Final pass 18.11 (FA4): while an old message is being edited the
    // field holds that message, not a caption (a keyboard GIF, a paste or
    // a drop can arrive then): the files go without it, the edit stays.
    final caption = _editing != null ? '' : _text.text.trim();
    if (caption.isNotEmpty) _text.clear();
    final reply = _replyTo;
    if (reply != null) setState(() => _replyTo = null);
    final thread = _thread;
    final chat = ref.read(chatRepositoryProvider);
    setState(() => _uploading++);
    try {
      if (fromDisk) {
        for (var i = 0; i < files.length; i++) {
          final f = files[i];
          await thread.queueAttachment(
            bytes: f.bytes,
            path: f.path,
            name: f.name,
            mime: f.mime,
            caption:
                i == files.length - 1 && caption.isNotEmpty ? caption : null,
            replyToId: i == 0 ? reply?.id : null,
          );
        }
        _toBottom();
        return;
      }
      // R-251: several files go up together, then the messages in order. With
      // the flag off, one after another as before.
      await thread.uploadAndSend(
        items: files,
        atOnce: ref
                .read(featureFlagsControllerProvider)
                .isEnabled('chat_upload_parallel')
            ? ClientTuning.uploadsAtOnce
            : 1,
        upload: (f) => chat.uploadAttachment(f.bytes, f.mime),
        send: (i, f, fileId) => thread.sendAttachment(
          fileId: fileId,
          fileName: f.name,
          caption: i == files.length - 1 && caption.isNotEmpty ? caption : null,
          replyToId: i == 0 ? reply?.id : null,
        ),
      );
    } on Object catch (e) {
      _error(e);
    } finally {
      if (mounted) setState(() => _uploading--);
    }
    _toBottom();
  }

  // --- select / forward (owner 2026-10-21, Telegram) ------------------------

  void _toggle(api.GroupMessageDto m) {
    if (m.deleted || m.isSystem) return;
    final next = {..._selected};
    if (!next.remove(m.id)) next.add(m.id);
    setState(() => _selected = next);
  }

  void _clearSelection() => setState(() => _selected = const {});

  /// The picked messages, oldest first.
  List<api.GroupMessageDto> _picked() {
    final s = ref.read(groupThreadProvider(_key));
    return [
      for (final m in s.messages)
        if (_selected.contains(m.id)) m,
    ]..sort((a, b) => a.createdAt.compareTo(b.createdAt));
  }

  Future<void> _copy(List<api.GroupMessageDto> messages) async {
    final text = [
      for (final m in messages)
        if (!m.deleted && !m.isPoll && m.body.trim().isNotEmpty) m.body,
    ].join('\n');
    if (text.isEmpty) return;
    await Clipboard.setData(ClipboardData(text: text));
    if (!mounted) return;
    showAppSnackBar(
      context,
      ref.read(translatorProvider).t('group.conv.copied'),
    );
  }

  Future<void> _forward(List<api.GroupMessageDto> messages) =>
      forwardWithSheet(context, ref, [
        for (final m in messages)
          if (m.canForward) ForwardSource(ForwardSourceKind.groupMessage, m.id),
      ]);

  /// A protected group shares its link instead of its messages.
  Future<void> _shareLink(api.GroupDetailDto detail) => forwardWithSheet(
        context,
        ref,
        [ForwardSource(ForwardSourceKind.groupLink, detail.id)],
      );

  PreferredSizeWidget _selectionBar(api.GroupDetailDto detail) {
    final picked = _picked();
    final protected = detail.isProtected;
    final canCopy = !protected &&
        picked.any((m) => !m.deleted && !m.isPoll && m.body.trim().isNotEmpty);
    final canForward =
        !protected && picked.isNotEmpty && picked.every((m) => m.canForward);
    return GroupSelectionBar(
      count: _selected.length,
      onClose: _clearSelection,
      onCopy: canCopy
          ? () async {
              await _copy(picked);
              _clearSelection();
            }
          : null,
      onForward: canForward
          ? () async {
              await _forward(picked);
              if (mounted) _clearSelection();
            }
          : null,
      onShareLink: protected && detail.hasShareLink
          ? () async {
              await _shareLink(detail);
              if (mounted) _clearSelection();
            }
          : null,
    );
  }

  Future<void> _menu(
    api.GroupMessageDto m,
    api.GroupDetailDto detail, {
    required bool canWrite,
  }) async {
    if (m.deleted || m.isSystem) return;
    if (_selected.isNotEmpty) return _toggle(m);
    final t = ref.read(translatorProvider);
    final pinned = detail.pinnedMessage?.id == m.id;
    // Owner 2026-10-21 (Telegram «Запретить копирование»): no Copy and no
    // Forward in a protected group — its link can be shared instead.
    final protected = detail.isProtected;
    final action = await showGroupMessageMenu(
      context,
      t,
      canReply: canWrite,
      canCopy: !protected && !m.isPoll && m.body.trim().isNotEmpty,
      canForward: !protected && m.canForward,
      canShareLink: protected && detail.hasShareLink,
      canSelect: true,
      canEdit: m.mine && m.type == api.GroupMessageDtoType.text,
      canPin: detail.canPinMessages,
      pinned: pinned,
      canDelete: m.mine || detail.canDeleteOthers,
      canSeeReaders: m.mine && !m.deleted && !m.isSystem,
      // Groups WhatsApp parity: the 1:1 quick reactions (not on a message
      // that is still sending or deleted).
      myReaction: m.myReaction,
      onReact: m.deleted || m.isSystem
          ? null
          : (e) => _react(m, e == m.myReaction ? null : e),
    );
    if (action == null || !mounted) return;
    switch (action) {
      case GroupMessageAction.readers:
        await showGroupReadersSheet(context, groupId: detail.id, message: m);
      case GroupMessageAction.reply:
        setState(() {
          _replyTo = m;
          _stopEditing();
        });
      case GroupMessageAction.copy:
        await Clipboard.setData(ClipboardData(text: m.body));
        if (mounted) showAppSnackBar(context, t.t('group.conv.copied'));
      case GroupMessageAction.forward:
        await _forward([m]);
      case GroupMessageAction.shareLink:
        await _shareLink(detail);
      case GroupMessageAction.select:
        setState(() => _selected = {m.id});
      case GroupMessageAction.edit:
        // The unsent text waits while an old message is edited, and comes
        // back in the field afterwards (WhatsApp). A second message picked
        // for editing keeps the draft already aside (ROUND1 25.11 row 13).
        _heldDraft.hold(_text.text, quote: _replyTo);
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

  Future<void> _react(api.GroupMessageDto m, String? emoji) async {
    unawaited(AppHaptics.selection());
    try {
      await _thread.react(m.id, emoji);
    } on Object catch (e) {
      _error(e);
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
            // Row 110 (Telegram 🔍): search this group.
            AppListRow(
              key: const ValueKey('group-menu-search'),
              icon: AppIcons.searchRounded,
              label: t.t('common.search'),
              showChevron: false,
              onTap: () => Navigator.of(sheet).pop('search'),
            ),
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
      case 'search':
        _openSearch();
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
    // Row 110: how long (1 h · 8 h · 2 d · forever), as in group info.
    Duration? span;
    if (!muted) {
      final pick = await pickMute(context, t, muted: false);
      if (pick == null || !mounted) return;
      span = muteDuration(pick);
      if (span == null) return;
    }
    try {
      final updated = await ref.read(groupRepositoryProvider).updateMine(
            detail.id,
            api.UpdateGroupMeDto(
              // The client cannot send an explicit null, so «unmute» is a
              // moment in the past: the mute has already ended.
              mutedUntil: span == null
                  ? DateTime.now().toUtc().subtract(const Duration(seconds: 1))
                  : DateTime.now().toUtc().add(span),
            ),
          );
      if (!mounted) return;
      // Package B: the answer is the row — applied, not re-read.
      ref.read(groupsProvider.notifier).applyMine(updated);
      ref.invalidate(groupDetailProvider(detail.id));
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
    ref.read(groupsProvider.notifier).removeWhere((g) => g.id == detail.id);
    if (!context.isCurrentRoute) {
      // Covered meanwhile: stay where the person is.
    } else if (context.canPop()) {
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
        if (mounted) {
          ref
              .read(groupsProvider.notifier)
              .removeWhere((g) => g.id == widget.groupId);
        }
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

    final selecting = _selected.isNotEmpty && !topicList;
    return PopScope(
      canPop: !selecting,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && selecting) _clearSelection();
      },
      child: Scaffold(
        backgroundColor: topicList ? null : ChatColors.of(context).wallpaper,
        appBar: selecting
            ? _selectionBar(detail)
            : AppTopBar(
                leading: AppBackButton(
                  semanticLabel: t.t('common.back'),
                  // Row 110: while searching the arrow closes the search.
                  onPressed: _search != null ? _closeSearch : _back,
                ),
                title: switch (_search) {
                  final InChatSearch s => InChatSearchField(
                      search: s,
                      controller: _searchText,
                      t: t,
                    ),
                  null => _Header(detail: detail, topic: topic),
                },
                actions: [
                  // Like WhatsApp: video and phone, tight, before the menu.
                  if (_search == null &&
                      detail.canCall &&
                      ref.watch(groupCallsProvider) &&
                      // Row 183: «Звонки в группах».
                      ref.watch(groupChatCallsEnabledProvider) &&
                      ref.watch(groupCallPortProvider) != null) ...[
                    if (ref.watch(groupVideoCallsProvider))
                      AppIconButton(
                        key: const ValueKey('group-video-call'),
                        icon: AppIcon(
                          AppIcons.videoCameraOutlined,
                          size: 22,
                          color: Theme.of(context)
                              .extension<AppColorTokens>()!
                              .text,
                        ),
                        semanticLabel: t.t('call.videoButton'),
                        onPressed: () => _startCall(detail, video: true),
                      ),
                    AppIconButton(
                      key: const ValueKey('group-audio-call'),
                      icon: AppIcon(
                        AppIcons.callOutlined,
                        size: 22,
                        color:
                            Theme.of(context).extension<AppColorTokens>()!.text,
                      ),
                      semanticLabel: t.t('call.button'),
                      onPressed: () => _startCall(detail, video: false),
                    ),
                  ],
                  if (_search == null)
                    AppIconButton(
                      icon: AppIcon(
                        AppIcons.moreVertRounded,
                        color:
                            Theme.of(context).extension<AppColorTokens>()!.text,
                      ),
                      semanticLabel: t.t('chat.menu'),
                      onPressed: () => _headerMenu(detail),
                    ),
                ],
              ),
        body: topicList
            ? GroupTopicList(detail: detail)
            : _chat(t, detail, topic),
      ),
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
        // Audit 26.10 B3 (Telegram): reading above, the new row comes in
        // below without moving the text on screen.
        _anchor.holdFor(_scroll);
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
        anchor: _anchor,
        keyFor: _keyFor,
        highlightId: _highlightId,
        canWrite: canWrite,
        onMore: _thread.loadMore,
        onMenu: (m) => _menu(m, detail, canWrite: canWrite),
        selected: _selected,
        onToggle: _selected.isEmpty ? null : _toggle,
        onReply: (m) => setState(() {
          _replyTo = m;
          _stopEditing();
        }),
        onJump: _jumpTo,
        onRetry: _thread.retry,
        onDiscard: _thread.dropPending,
        onPollChanged: (m, p) => _thread.applyPoll(m.id, p),
        onReact: _react,
      );
    }

    final running = ref.watch(groupRunningCallProvider(widget.groupId)).value;
    return Column(
      children: [
        if (running != null)
          GroupCallJoinBar(
            running: running,
            live: groupRunningCallProvider(widget.groupId),
            onJoin: () => _joinCall(detail, running),
          ),
        if (showPin)
          GroupPinBanner(
            message: pinned,
            t: t,
            onTap: () => _jumpTo(pinned.id),
            onUnpin: detail.canPinMessages
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
          child: FileDropZone(
            enabled: canWrite && detail.canSendMedia,
            // Row 185: Ctrl+V / Cmd+V of a screenshot.
            paste: true,
            onFiles: (f) => unawaited(_drop(f)),
            child: Stack(
              children: [
                // Row 191: on iPhone the keyboard follows the finger.
                Positioned.fill(child: ChatKeyboardDragArea(child: list)),
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
        ),
        // Row 110: while searching, «N of M» and ↑ / ↓ (Telegram).
        if (_search != null)
          InChatSearchBar(search: _search!, t: t)
        else if (canWrite)
          GroupComposer(
            controller: _text,
            members: detail.members,
            replyTo: _replyTo,
            editing: _editing,
            uploading: _uploading > 0,
            onSend: _send,
            onSaveEdit: _saveEdit,
            onAttach: _attach,
            // Row 185: a GIF from the keyboard.
            onKeyboardFiles:
                detail.canSendMedia ? (f) => unawaited(_drop(f)) : null,
            canAttach: detail.canSendMedia || detail.canSendPolls,
            draftKey: _draftKey,
            // Groups WhatsApp parity: a voice note is media, like a photo.
            onVoice: detail.canSendMedia ? _sendVoice : null,
            onVoiceTyping: (active, {voice = false}) => ref
                .read(groupTypingProvider(widget.groupId).notifier)
                .send(active, voice: voice),
            onCancelReply: () => setState(() => _replyTo = null),
            onCancelEdit: () {
              setState(_stopEditing);
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
    // D1-2: «Анна печатает…» as in Telegram / WhatsApp groups.
    final typer = ref.watch(groupTypingProvider(detail.id));
    final typerName = typer == null
        ? null
        : detail.members
            .where((m) => m.userId == typer.userId)
            .map((m) => m.displayName?.trim() ?? '')
            .firstOrNull;
    // Row 110 (Telegram): no network / no server → the status line says so.
    final offline = connectionTitle(t, watchOfflineReason(ref));
    final String subtitle;
    if (offline != null) {
      subtitle = offline;
    } else if (typer != null) {
      final name = (typerName == null || typerName.isEmpty)
          ? t.t('group.someone')
          : typerName;
      subtitle =
          '$name ${t.t(typer.voice ? 'chat.recordingVoice' : 'chat.typing')}';
    } else if (topic != null) {
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
              preview: groupPhotoPreview(ref, detail.id, detail.avatarUrl),
              initials: avatarInitials(detail.title),
              size: 36,
            ),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    children: [
                      Flexible(
                        child: Text(
                          detail.title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: type.body.copyWith(
                            color: colors.text,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      // Owner 2026-10-21: disappearing messages are on.
                      if (detail.disappearAfterS != null) ...[
                        const SizedBox(width: AppSpacing.xs),
                        Icon(
                          AppIcons.timerOutlined,
                          key: const ValueKey('group-header-timer'),
                          size: 14,
                          color: colors.textSecondary,
                        ),
                      ],
                    ],
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
                child: AppIcon(AppIcons.expandMoreRounded, color: colors.text),
              ),
              if (count > 0)
                PositionedDirectional(
                  top: 0,
                  end: 0,
                  child: Container(
                    constraints: const BoxConstraints(
                      minWidth: 20,
                      minHeight: 20,
                    ),
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

/// Row 38: groups whose older page is already queued for the next frame
/// (one request per frame however many rows near the top get built).
final _olderQueued = <String>{};

/// The messages, newest at the bottom; unsent ones below them; the day
/// separators, the runs of one sender and the older pages.
class _MessageList extends ConsumerWidget {
  const _MessageList({
    required this.state,
    required this.detail,
    required this.controller,
    required this.anchor,
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
    this.onReact,
    this.selected = const {},
    this.onToggle,
  });

  final GroupThreadState state;
  final api.GroupDetailDto detail;
  final ScrollController controller;
  final ChatScrollAnchor anchor;
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

  /// Groups WhatsApp parity: a reaction chip tapped (null = mine removed).
  final void Function(api.GroupMessageDto m, String? emoji)? onReact;

  /// «Select» mode: the picked ids; a tap on a message calls [onToggle].
  final Set<String> selected;
  final void Function(api.GroupMessageDto m)? onToggle;

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
    // Admin switched the service lines off: nobody sees them (rows that
    // were already loaded included).
    final messages = detail.showServiceMessages
        ? state.messages
        : [
            for (final m in state.messages)
              if (!m.isSystem) m,
          ];
    final pending = state.pending;
    final extra = state.hasMore ? 1 : 0;
    Map<Key, int>? byKey;
    // Groups WhatsApp parity: the next voice notes in a row play by
    // themselves (the 1:1 bubble); a group has no «played» mark to report.
    final voiceThread = VoiceThread(
      messages: () => [
        for (final m in messages)
          if (m.voiceMessage case final v?) v,
      ],
      played: (_) async {},
    );
    // Audit 26.10 B3: a custom scroll view so the anchor sliver can keep
    // what is read in place; rows are found by key when a message comes in
    // below (the rest move one index, their elements are kept).
    return CustomScrollView(
      reverse: true,
      controller: controller,
      // Row 95 (catalog K2): dragging the chat hides the keyboard.
      // Row 191: on iPhone UIKit moves it with the finger instead.
      keyboardDismissBehavior: chatKeyboardDismiss,
      semanticChildCount: pending.length + messages.length,
      slivers: [
        SliverPadding(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.screenSide,
            vertical: AppSpacing.md,
          ),
          sliver: SliverList.builder(
            itemCount: pending.length + messages.length + extra,
            findChildIndexCallback: (key) => (byKey ??= {
              for (var k = 0; k < messages.length; k++)
                keyFor(messages[k].id): pending.length + k,
            })[key],
            itemBuilder: (context, i) {
              if (i < pending.length) {
                final p = pending[pending.length - 1 - i];
                return GroupPendingBubble(
                  pending: p,
                  groupId: detail.id,
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
              // Row 38 (Telegram): the older page is asked for a few rows
              // before the oldest one (`client.load_ahead_rows`), not when
              // the spinner shows; once per frame, like the 1:1 chat.
              if (k >= messages.length - LoadAhead.rows &&
                  state.hasMore &&
                  !state.loadingMore &&
                  state.error == null &&
                  _olderQueued.add(detail.id)) {
                WidgetsBinding.instance.addPostFrameCallback((_) {
                  _olderQueued.remove(detail.id);
                  onMore();
                });
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
                  canClose: m.mine || detail.canDeleteOthers,
                  highlighted: highlightId == m.id,
                  selected: selected.contains(m.id),
                  onTap: onToggle == null ? null : () => onToggle!(m),
                  protectContent: detail.isProtected,
                  onMenu: () => onMenu(m),
                  onReply: canWrite && !m.deleted && onToggle == null
                      ? () => onReply(m)
                      : null,
                  onJump: onJump,
                  onPollChanged: (p) => onPollChanged(m, p),
                  voiceThread: voiceThread,
                  onReact: onReact == null || onToggle != null
                      ? null
                      : (e) => onReact!(m, e),
                );
              }
              return Column(
                key: keyFor(m.id),
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (newDay)
                    _DaySeparator(label: _dayLabel(t, f, m.createdAt)),
                  item,
                ],
              );
            },
          ),
        ),
        ChatAnchorSliver(anchor: anchor),
      ],
    );
  }
}

class _DaySeparator extends StatelessWidget {
  const _DaySeparator({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final chat = ChatColors.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.md),
      child: Center(
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
          decoration: BoxDecoration(
            color: chat.theirs.withValues(alpha: 0.92),
            borderRadius: BorderRadius.circular(AppRadii.pill),
            border: Border.all(color: chat.theirsBorder),
          ),
          child: Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: type.caption.copyWith(
              color: chat.onTheirs,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ),
    );
  }
}
