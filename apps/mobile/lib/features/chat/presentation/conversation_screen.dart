import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart' show XFile;
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/files/upload_limits.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/language_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/limits/text_limits.dart';
import 'package:lawbid/core/media/video_compression.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/core/text/bidi.dart';
import 'package:lawbid/features/blocks/application/blocks_providers.dart';
import 'package:lawbid/features/blocks/presentation/block_actions.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';
import 'package:lawbid/features/calls/presentation/call_log_entry.dart';
import 'package:lawbid/features/case_payments/presentation/chat_payment_bar.dart';
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/application/presence_providers.dart';
import 'package:lawbid/features/chat/application/voice_player.dart';
import 'package:lawbid/features/chat/application/voice_recorder.dart';
import 'package:lawbid/features/chat/data/voice_files.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/domain/message_groups.dart';
import 'package:lawbid/features/chat/presentation/attachment_widgets.dart';
import 'package:lawbid/features/chat/presentation/chat_album.dart';
import 'package:lawbid/features/chat/presentation/chat_folders.dart';
import 'package:lawbid/features/chat/presentation/contact_info_screen.dart';
import 'package:lawbid/features/chat/presentation/inbox_screen.dart';
import 'package:lawbid/features/chat/presentation/message_actions.dart';
import 'package:lawbid/features/chat/presentation/voice_widgets.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/plans/presentation/plan_offer.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/stickers/presentation/sticker_widgets.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/features/team/domain/team_models.dart';
import 'package:lawbid/features/team/team_routes.dart';
import 'package:lawbid/features/templates/application/templates_providers.dart';
import 'package:lawbid/features/templates/presentation/templates_screen.dart';

/// docs/05 §8.2: 2000 characters, text only.
int get kMessageMaxChars => TextLimits.of(TextLimit.chatMessage);

/// docs/05 §8.2 conversation: header (who, case title → case, "⋯": mute,
/// report), bubbles with day separators and delivery states (sending /
/// sent / seen), "печатает…", masked contacts with a one-time hint,
/// "Чат закрыт" banner, the subscription gate for attorneys (§8.4).
class ConversationScreen extends ConsumerStatefulWidget {
  const ConversationScreen({required this.conversationId, super.key});

  final String conversationId;

  @override
  ConsumerState<ConversationScreen> createState() => _ConversationScreenState();
}

class _ConversationScreenState extends ConsumerState<ConversationScreen>
    with WidgetsBindingObserver {
  final _text = TextEditingController();
  final _focus = FocusNode();
  bool _resumed = true;

  /// Owner 2026-10-01: the Emoji · Stickers panel in place of the keyboard.
  bool _stickers = false;

  void _toggleStickers() {
    if (_stickers) {
      setState(() => _stickers = false);
      return;
    }
    FocusManager.instance.primaryFocus?.unfocus();
    setState(() => _stickers = true);
  }

  void _insertEmoji(String e) {
    final v = _text.value;
    final start = v.selection.isValid ? v.selection.start : v.text.length;
    final end = v.selection.isValid ? v.selection.end : v.text.length;
    final text = v.text.replaceRange(start, end, e);
    _text.value = TextEditingValue(
      text: text,
      selection: TextSelection.collapsed(offset: start + e.length),
    );
    _thread.typing(true);
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _text.dispose();
    _focus.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _resumed = state == AppLifecycleState.resumed;
    if (_resumed) _markRead();
  }

  ChatThread get _thread =>
      ref.read(chatThreadProvider(widget.conversationId).notifier);

  /// Read receipts only while the chat is actually on screen (§8.4).
  void _markRead() {
    if (!_resumed || !mounted) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _thread.markRead();
    });
  }

  Future<void> _send() async {
    final text = _text.text;
    if (text.trim().isEmpty) return;
    final compose = ref.read(chatComposeProvider(widget.conversationId));
    final composeN =
        ref.read(chatComposeProvider(widget.conversationId).notifier);
    // ignore: unawaited_futures
    HapticFeedback.lightImpact();
    final editing = compose.editing;
    if (editing != null) {
      // Owner 2026-10-20: an edit keeps the typed text until the server
      // accepts it (the window may have closed meanwhile).
      try {
        await _thread.edit(editing, text);
        _text.clear();
        composeN.clear();
      } on Object catch (e) {
        if (!mounted) return;
        final t = ref.read(translatorProvider);
        showAppSnackBar(
          context,
          e is ApiException && e.code == 'MESSAGE_WINDOW_EXPIRED'
              ? t.t('chat.err.windowExpired')
              : errorText(t, e),
        );
      }
      return;
    }
    _text.clear();
    composeN.clear();
    _thread.typing(false);
    await _thread.send(text, replyToId: compose.replyTo?.id);
  }

  /// OQ-041: calls open once the bid is accepted (contacts unlocked).
  /// Owner 2026-10-05: [video] = a video call.
  void _call(Conversation c, {bool video = false}) {
    final t = ref.read(translatorProvider);
    if (!c.contactsUnlocked) {
      showAppSnackBar(
        context,
        t.t(c.isDirect ? 'call.notAllowedRequest' : 'call.notAllowed'),
      );
      return;
    }
    HapticFeedback.mediumImpact();
    ref.read(callControllerProvider.notifier).call(
          c.id,
          peer: c.counterpart.id == null
              ? null
              : CallPeer(
                  id: c.counterpart.id!,
                  isAttorney: c.counterpart.isAttorney,
                  displayName: c.counterpart.displayName,
                  username: c.counterpart.username,
                  avatarUrl: c.counterpart.avatarUrl,
                ),
          video: video,
        );
  }

  /// OQ-047: pick photos / documents and send each; the typed text goes
  /// with the last as its caption. Owner 2026-10-19 (albums): they upload
  /// together but are sent in the picked order (one album bubble).
  Future<void> _attach() async {
    final t = ref.read(translatorProvider);
    final files = await pickChatFiles(
      context,
      t,
      onTemplate: ref.read(templatesEnabledProvider) ? _sendTemplate : null,
      limits: ref.read(uploadLimitsProvider)[UploadPlace.chat],
      prepareVideo: _prepareVideo,
    );
    if (files.isEmpty || !mounted) return;
    final caption = _text.text.trim();
    if (caption.isNotEmpty) _text.clear();
    Future<void>? previous;
    for (var i = 0; i < files.length; i++) {
      final f = files[i];
      final last = i == files.length - 1;
      previous = _thread.sendAttachment(
        bytes: f.bytes,
        name: f.name,
        mime: f.mime,
        caption: last && caption.isNotEmpty ? caption : null,
        after: previous,
      );
      unawaited(previous);
    }
  }

  /// Owner 2026-10-17 (WhatsApp): a chat video is re-encoded on the phone
  /// to at most 720p (the admin's reel setting may make it smaller) before
  /// upload; the original goes when compressing fails or doesn't help.
  Future<XFile> _prepareVideo(XFile video) async {
    final t = ref.read(translatorProvider);
    showAppSnackBar(context, t.t('chat.attach.videoPreparing'));
    final reel = videoLimitsOf(ref.read(featureFlagsControllerProvider));
    final limits = (
      maxHeight: reel.maxHeight <= 0 ? 720 : math.min(720, reel.maxHeight),
      frameRate: reel.frameRate,
    );
    final out =
        await ref.read(videoCompressorProvider).compress(video, limits: limits);
    return out == null
        ? video
        : XFile(out.path, name: 'video.mp4', mimeType: 'video/mp4');
  }

  /// Owner 2026-10-05: a document template from the library, sent as a
  /// regular attachment (the server copies it; nothing is uploaded).
  Future<void> _sendTemplate() async {
    final tpl = await pickTemplate(context);
    if (tpl == null || !mounted) return;
    final caption = _text.text.trim();
    if (caption.isNotEmpty) _text.clear();
    unawaited(
      _thread.sendTemplate(tpl, caption: caption.isEmpty ? null : caption),
    );
  }

  Future<void> _menu(ChatThreadState s) async {
    final t = ref.read(translatorProvider);
    final c = s.conversation;
    if (c == null) return;
    await showAppBottomSheet<void>(
      context: context,
      builder: (sheet) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const AppSheetHandle(),
            // Owner 2026-10-18: the contact screen holds the media, mute,
            // block and report rows; the menu keeps what it does not.
            AppListRow(
              key: const ValueKey('chat-menu-contact'),
              icon: AppIcons.personOutlineRounded,
              label: t.t('contact.menu'),
              onTap: () {
                Navigator.of(sheet).pop();
                openContactInfo(
                  context,
                  conversationId: c.id,
                  onCall: () => _call(c),
                );
              },
            ),
            AppListRow(
              key: const ValueKey('chat-menu-organize'),
              icon: AppIcons.pushPinOutlined,
              label: t.t('contact.menuOrganize'),
              onTap: () {
                Navigator.of(sheet).pop();
                showChatOrganizeSheet(context, ref, c);
              },
            ),
            // Owner 2026-10-05: a task about this chat — linked to it (and
            // its case), with this person already on it.
            if (ref.read(actsAsAttorneyProvider) &&
                ref.read(canDoProvider(AssistantDuty.tasks)))
              AppListRow(
                key: const ValueKey('chat-new-task'),
                icon: AppIcons.eventNoteOutlined,
                label: t.t('tasks.fromChat'),
                onTap: () {
                  Navigator.of(sheet).pop();
                  final name = c.counterpart.displayName ??
                      (c.counterpart.username == null
                          ? null
                          : atHandle(c.counterpart.username));
                  context.push(
                    TeamRoutes.newTaskFor(
                      chatId: c.id,
                      chatTitle: name,
                      caseId: c.caseId,
                      caseTitle: c.caseTitle,
                      personId: c.counterpart.id,
                      personName: name,
                      personRole:
                          c.counterpart.isAttorney ? 'attorney' : 'client',
                    ),
                  );
                },
              ),
            const SizedBox(height: AppSpacing.md),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final s = ref.watch(chatThreadProvider(widget.conversationId));
    final c = s.conversation;
    ref.listen(
      chatThreadProvider(widget.conversationId)
          .select((x) => x.messages.firstOrNull?.id),
      (_, __) => _markRead(),
    );
    final compose = ref.watch(chatComposeProvider(widget.conversationId));
    final selecting =
        ref.watch(chatMsgSelectionProvider(widget.conversationId)).isNotEmpty;
    // An edit loads the message into the field; closing it clears the field.
    ref.listen(chatComposeProvider(widget.conversationId), (prev, next) {
      // A reply or an edit starts: the keyboard opens on the field.
      if ((next.replyTo != null && next.replyTo?.id != prev?.replyTo?.id) ||
          (next.editing != null && next.editing?.id != prev?.editing?.id)) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) _focus.requestFocus();
        });
      }
      final e = next.editing;
      if (e != null && e.id != prev?.editing?.id) {
        _text.value = TextEditingValue(
          text: e.body,
          selection: TextSelection.collapsed(offset: e.body.length),
        );
      } else if (e == null && prev?.editing != null) {
        _text.clear();
      }
    });
    final attorney = ref.watch(actsAsAttorneyProvider);
    final subscriptionGate =
        ref.watch(outboxSenderProvider).subscriptionRequired;

    return Scaffold(
      // Owner 2026-10-17: the chat's own wallpaper (WhatsApp-like).
      backgroundColor: ChatColors.of(context).wallpaper,
      appBar: selecting
          ? SelectionBar(conversationId: widget.conversationId)
          : AppTopBar(
              leading: AppBackButton(
                semanticLabel: t.t('common.back'),
                onPressed: () => Navigator.of(context).maybePop(),
              ),
              title: c == null
                  ? null
                  : _Header(conversation: c, onCall: () => _call(c)),
              actions: [
                // OQ-041: an in-app audio call (after acceptance).
                // OQ-043: a direct chat gets calls once the request
                // is accepted.
                // Owner 2026-09-30: no call button until a request is accepted.
                // Audit 2026-10-02: no call button across a block or for an
                // assistant without the "calls" duty (the server refuses both).
                // Audit 2026-10-04: nor in a case chat before acceptance.
                if (c != null && chatAudioCallAllowed(ref, c))
                  AppIconButton(
                    icon: AppIcon(
                      AppIcons.callOutlined,
                      color: colors.text,
                    ),
                    semanticLabel: t.t('call.button'),
                    onPressed: () => _call(c),
                  ),
                // Owner 2026-10-05: "Видеозвонок" next to the call — only while
                // the owner has video calls on (flag + TURN configured).
                if (c != null &&
                    !c.closed &&
                    !c.myRequestPending &&
                    !c.awaitingMyAnswer &&
                    !c.myRequestDeclined &&
                    ref.watch(videoCallsEnabledProvider) &&
                    ref.watch(canDoProvider(AssistantDuty.calls)) &&
                    !(ref
                            .watch(blockedIdsProvider)
                            .value
                            ?.contains(c.counterpart.id) ??
                        false))
                  AppIconButton(
                    icon: AppIcon(
                      AppIcons.videoCameraOutlined,
                      color: c.contactsUnlocked
                          ? colors.text
                          : colors.textSecondary,
                    ),
                    semanticLabel: t.t('call.videoButton'),
                    onPressed: () => _call(c, video: true),
                  ),
                if (c != null)
                  AppIconButton(
                    icon:
                        AppIcon(AppIcons.moreHorizRounded, color: colors.text),
                    semanticLabel: t.t('chat.menu'),
                    onPressed: () => _menu(s),
                  ),
              ],
            ),
      body: s.loading && c == null
          ? const CasesListSkeleton()
          : s.error != null && c == null
              ? CasesErrorView(error: s.error!, t: t, onRetry: _thread.load)
              : Column(
                  children: [
                    if (c != null && c.closed)
                      _Banner(
                        icon: AppIcons.lockOutlineRounded,
                        text: t.t('chat.closed'),
                      ),
                    PinnedBanner(
                      state: s,
                      conversationId: widget.conversationId,
                    ),
                    Expanded(
                      child: _MessageList(state: s, onMore: _thread.loadMore),
                    ),
                    AnimatedSwitcher(
                      duration: context.reduceMotion
                          ? Duration.zero
                          : AppMotion.stateChange,
                      child: s.typing
                          ? const Align(
                              key: ValueKey('typing'),
                              alignment: Alignment.centerLeft,
                              child: _TypingDots(),
                            )
                          : const SizedBox.shrink(),
                    ),
                    // OQ-043: a request sent to me — accept / delete /
                    // block before anything else.
                    if (c != null && c.awaitingMyAnswer)
                      _RequestPanel(conversation: c, thread: _thread)
                    else if (c != null && c.blockedHere && !c.closed)
                      _Banner(
                        key: const ValueKey('chat-blocked-banner'),
                        icon: AppIcons.blockRounded,
                        text: t.t('chat.blockedBanner'),
                      )
                    else if (c != null && c.myRequestDeclined)
                      _Banner(
                        icon: AppIcons.blockRounded,
                        text: t.t('chat.requests.declinedForYou'),
                      )
                    else if (c != null && !c.closed)
                      ValueListenableBuilder<bool>(
                        valueListenable: subscriptionGate,
                        builder: (context, gated, _) => gated && attorney
                            ? _SubscriptionGate(t: t)
                            : Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  if (c.myRequestPending)
                                    _Banner(
                                      icon: AppIcons.scheduleSendOutlined,
                                      text: t.t('chat.requests.sentNote'),
                                    )
                                  else if (!c.contactsUnlocked)
                                    const _MaskingHint(),
                                  // Owner 2026-10-05: pay / invoice from
                                  // the chat in two taps.
                                  if (c.caseId != null && c.contactsUnlocked)
                                    ChatPaymentBar(caseId: c.caseId!),
                                  if (compose.replyTo != null)
                                    ReplyQuote(
                                      key: const ValueKey('reply-bar'),
                                      bar: true,
                                      mine: false,
                                      preview: ReplyPreview.of(
                                        compose.replyTo!,
                                      ),
                                      conversation: c,
                                      onClose: ref
                                          .read(
                                            chatComposeProvider(
                                              widget.conversationId,
                                            ).notifier,
                                          )
                                          .clear,
                                    ),
                                  if (compose.editing != null)
                                    EditBar(
                                      message: compose.editing!,
                                      onClose: ref
                                          .read(
                                            chatComposeProvider(
                                              widget.conversationId,
                                            ).notifier,
                                          )
                                          .clear,
                                    ),
                                  _Composer(
                                    draftKey: widget.conversationId,
                                    controller: _text,
                                    focusNode: _focus,
                                    onSend: _send,
                                    stickersOpen: _stickers,
                                    onStickers: _toggleStickers,
                                    onFieldTap: () {
                                      if (_stickers) {
                                        setState(() => _stickers = false);
                                      }
                                    },
                                    onTyping: _thread.typing,
                                    // OQ-048: assistants need "files".
                                    onAttach: c.contactsUnlocked &&
                                            ref.watch(
                                              canDoProvider(
                                                AssistantDuty.files,
                                              ),
                                            )
                                        ? _attach
                                        : null,
                                    onVoice: (r) => _thread.sendVoice(
                                      path: r.path,
                                      durationMs: r.durationMs,
                                      waveform: r.waveform,
                                    ),
                                  ),
                                  if (_stickers)
                                    StickerPanel(
                                      onSticker: _thread.sendSticker,
                                      onEmoji: _insertEmoji,
                                    ),
                                ],
                              ),
                      ),
                  ],
                ),
    );
  }
}

class _Header extends ConsumerWidget {
  const _Header({required this.conversation, this.onCall});

  final Conversation conversation;
  final VoidCallback? onCall;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final c = conversation;
    final formats = ref.watch(l10nFormatsProvider);
    // Owner 2026-10-01: online / last seen, live while the chat is open.
    final presence = chatPresenceOf(ref, c);
    // Owner 2026-10-18 (WhatsApp): the name and the status only; the
    // "@username" and the case live on the contact screen.
    return Semantics(
      button: true,
      label: t.t('contact.title'),
      child: AppPressable(
        key: const ValueKey('chat-header'),
        onTap: () => openContactInfo(
          context,
          conversationId: c.id,
          onCall: onCall,
        ),
        child: Row(
          children: [
            CounterpartAvatar(
              counterpart: c.counterpart,
              size: 36,
              online: presence?.online,
            ),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    counterpartName(t, c),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: type.body.copyWith(
                      color: colors.text,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  if (presence != null)
                    Text(
                      presenceLabel(
                        t,
                        presence,
                        time: formats.time,
                        date: formats.date,
                      ),
                      key: const ValueKey('chat-presence'),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: type.caption.copyWith(
                        color: presence.online
                            ? colors.goldDark
                            : colors.textSecondary,
                        fontWeight: presence.online ? FontWeight.w600 : null,
                      ),
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

class _MessageList extends ConsumerWidget {
  const _MessageList({required this.state, required this.onMore});

  final ChatThreadState state;
  final VoidCallback onMore;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final me = ref.watch(currentUserIdProvider);
    final items = state.all;
    if (items.isEmpty) {
      return AppEmptyState(
        icon: AppIcons.chatBubbleOutlineRounded,
        message: t.t('chat.thread.empty'),
      );
    }
    // The newest own message the other side has read (§8.2 "Seen").
    final lastRead = state.conversation?.counterpartLastReadId;
    final seenIndex =
        lastRead == null ? -1 : items.indexWhere((m) => m.id == lastRead);
    final newestOwnSeen = seenIndex < 0
        ? null
        : items.skip(seenIndex).where((m) => m.senderId == me).firstOrNull?.id;
    // Owner 2026-10-19: photos / files sent together share one bubble.
    final entries = groupChatMessages(items);
    final seenIds = seenIndex < 0
        ? const <String>{}
        : items.skip(seenIndex).map((m) => m.id).toSet();

    return CustomPaint(
      // Owner 2026-10-17: a faint pattern of legal signs behind the
      // messages (it stays put while they scroll, like WhatsApp).
      painter: _WallpaperPainter(ChatColors.of(context).pattern),
      child: ListView.builder(
        reverse: true,
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.screenSide,
          vertical: AppSpacing.md,
        ),
        itemCount: entries.length + (state.nextCursor != null ? 1 : 0),
        itemBuilder: (context, i) {
          if (i == entries.length) {
            if (state.loadMoreFailed) {
              return Center(
                child: TextButton(
                  onPressed: onMore,
                  child: Text(t.t('error.retry')),
                ),
              );
            }
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
          final entry = entries[i];
          final m = entry.newest;
          final older = i + 1 < entries.length ? entries[i + 1].newest : null;
          final newDay = older == null ||
              !DateUtils.isSameDay(
                older.createdAt.toLocal(),
                entry.oldest.createdAt.toLocal(),
              );
          final seen = seenIds.contains(m.id) && m.senderId == me;
          return Column(
            // Stretch: a bubble sits at the right (mine) or left (theirs)
            // edge like Telegram, never centered (owner 2026-09-29).
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (newDay) _DaySeparator(label: _dayLabel(t, f, m.createdAt)),
              if (state.unreadFromId != null &&
                  entry.messages.any((x) => x.id == state.unreadFromId))
                UnreadDivider(count: state.unreadCount),
              if (m.kind == MessageKind.system)
                _SystemMessage(
                  text: systemLineText(t, m.body, formats: f),
                  // Owner 2026-10-19: a tap opens what the line is about.
                  target: _systemTarget(
                    m.body,
                    caseId: state.conversation?.caseId,
                    attorney: ref.read(actsAsAttorneyProvider),
                  ),
                )
              else if (m.kind == MessageKind.call && m.callLog != null)
                CallLogEntry(
                  message: m,
                  mine: m.senderId == me,
                  conversation: state.conversation,
                )
              else
                _Bubble(
                  message: m,
                  group: entry.isGroup ? entry.messages : null,
                  mine: m.senderId == me,
                  seen: seen,
                  showSeenLabel:
                      entry.messages.any((x) => x.id == newestOwnSeen),
                  threadId: state.conversation?.id ?? m.conversationId,
                  // Owner 2026-10-01: the client sees "Assistant of <the
                  // attorney>", not the assistant's own account.
                  attorneyName: m.senderId == me
                      ? null
                      : state.conversation?.counterpart.displayName,
                ),
            ],
          );
        },
      ),
    );
  }

  static String _dayLabel(Translator t, L10nFormats f, DateTime at) {
    final now = DateTime.now();
    final d = at.toLocal();
    if (DateUtils.isSameDay(d, now)) return t.t('chat.today');
    if (DateUtils.isSameDay(d, now.subtract(const Duration(days: 1)))) {
      return t.t('chat.yesterday');
    }
    return f.dateLong(d);
  }
}

class _DaySeparator extends StatelessWidget {
  const _DaySeparator({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    // Owner 2026-10-17 (WhatsApp): the day on a small pill in the middle.
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

/// Owner 2026-10-19: where a system line leads — the case it is about
/// (the hired attorney's work card, the client's case), or null.
String? _systemTarget(
  String body, {
  required String? caseId,
  required bool attorney,
}) {
  if (caseId == null) return null;
  final key = body.split(':').first;
  return switch (key) {
    'offer_accepted' ||
    'case_closed' ||
    'payment_received' ||
    'payment_requested' ||
    'payment_request_canceled' ||
    'payment_fee_countered' ||
    'payment_fee_agreed' =>
      attorney ? AppRoutes.workCase(caseId) : AppRoutes.myCase(caseId),
    'no_agreement' ||
    'accepted_by_other' =>
      attorney ? AppRoutes.caseDetail(caseId) : AppRoutes.myCase(caseId),
    _ => attorney ? AppRoutes.caseDetail(caseId) : AppRoutes.myCase(caseId),
  };
}

class _SystemMessage extends StatelessWidget {
  const _SystemMessage({required this.text, this.target});

  final String text;

  /// The route a tap opens (null: not tappable).
  final String? target;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final to = target;
    final onTap = to == null ? null : () => context.push(to);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
      child: Center(
        child: Semantics(
          button: onTap != null,
          child: AppPressable(
            onTap: onTap,
            child: Container(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.md,
                vertical: AppSpacing.sm,
              ),
              decoration: BoxDecoration(
                color: colors.goldTint,
                borderRadius: BorderRadius.circular(AppRadii.pill),
                border: Border.all(color: colors.goldStroke),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  AppIcon(
                    AppIcons.gavelRounded,
                    size: 14,
                    color: colors.goldDark,
                  ),
                  const SizedBox(width: AppSpacing.xs),
                  Flexible(
                    child: Text(
                      text,
                      textAlign: TextAlign.center,
                      style: type.caption.copyWith(
                        color: colors.text,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  if (onTap != null) ...[
                    const SizedBox(width: AppSpacing.xs),
                    AppIcon(
                      AppIcons.chevronRightRounded,
                      size: 14,
                      color: colors.goldDark,
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Bubble extends ConsumerWidget {
  const _Bubble({
    required this.message,
    required this.mine,
    required this.seen,
    required this.showSeenLabel,
    required this.threadId,
    this.group,
    this.attorneyName,
  });

  /// Set when the message came from the other side (the attorney's team).
  final String? attorneyName;

  final ChatMessage message;
  final bool mine;
  final bool seen;
  final bool showSeenLabel;
  final String threadId;

  /// Owner 2026-10-19: an album / a list of files sent together (oldest
  /// first, [message] is the newest — its time, ticks and caption).
  final List<ChatMessage>? group;

  Widget _attachment(WidgetRef ref, ChatMessage m) {
    final g = group;
    if (g == null) return AttachmentMessageBody(message: m, mine: mine);
    return ChatAttachmentGroupBody(
      messages: g,
      mine: mine,
      onRetry: (x) => ref.read(chatThreadProvider(threadId).notifier).retry(x),
    );
  }

  /// Owner 2026-10-17: a voice note shows its sender's photo (WhatsApp).
  Widget _voice(WidgetRef ref, ChatMessage m) {
    String? url;
    String? name;
    if (mine) {
      final me = ref.watch(currentUserControllerProvider).user;
      url = me?.avatarUrl;
      name = [me?.firstName, me?.lastName]
          .whereType<String>()
          .where((x) => x.trim().isNotEmpty)
          .join(' ');
    } else {
      final c = ref.watch(
        chatThreadProvider(threadId).select((s) => s.conversation),
      );
      final p = c?.counterpart;
      if (p != null && !p.hidden) {
        url = p.avatarUrl;
        name = attorneyName ?? p.displayName ?? p.username;
      }
    }
    return VoiceMessageBody(
      message: m,
      mine: mine,
      threadId: threadId,
      avatarUrl: url,
      avatarName: name,
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final m = message;
    // Owner 2026-10-17: WhatsApp-like colours of the theme (ChatColors).
    final chat = ChatColors.of(context);
    final fg = mine ? chat.onMine : chat.onTheirs;
    final meta = mine ? chat.mineMeta : chat.theirsMeta;
    final failed = m.delivery == DeliveryState.failed;
    final selection = ref.watch(chatMsgSelectionProvider(threadId));
    final selecting = selection.isNotEmpty;
    final selected = selection.contains(m.id);
    final conversation = ref.watch(
      chatThreadProvider(threadId).select((s) => s.conversation),
    );
    final a = m.kind == MessageKind.attachment ? m.attachment : null;
    // A photo / video without a caption: a thin frame, the time on it.
    final media =
        a != null && (a.isImage || a.isVideo) && m.body.trim().isEmpty;
    final fileNames = [
      for (final x in group ?? [m]) x.attachment?.name ?? '',
    ].join(', ');
    final failedItems = [
      for (final x in group ?? [m])
        if (x.delivery == DeliveryState.failed) x,
    ];
    Widget ticks(Color plain) => AppIcon(
          switch (m.delivery) {
            DeliveryState.sending => AppIcons.scheduleRounded,
            DeliveryState.failed => AppIcons.errorOutlineRounded,
            DeliveryState.sent =>
              seen ? AppIcons.doneAllRounded : AppIcons.doneRounded,
          },
          size: 15,
          color: failed
              ? colors.danger
              : seen
                  ? chat.tickRead
                  : plain,
        );

    // Hidden contacts shown as a localized inline marker (§8.3).
    final parts = m.body.split(kContactMask);
    final spans = <InlineSpan>[];
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].isNotEmpty) spans.add(TextSpan(text: parts[i]));
      if (i < parts.length - 1) {
        spans.add(
          TextSpan(
            text: ' ${t.t('chat.masked')} ',
            style: TextStyle(
              fontStyle: FontStyle.italic,
              backgroundColor: (mine ? colors.gold : colors.goldTint)
                  .withValues(alpha: 0.35),
            ),
          ),
        );
      }
    }

    // Owner 2026-10-01: a sticker stands alone, like Telegram — the time
    // and ticks on a small chip under it.
    final sticker = m.kind == MessageKind.sticker ? m.sticker : null;
    final bubble = sticker != null
        ? Column(
            crossAxisAlignment:
                mine ? CrossAxisAlignment.end : CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              StickerMessageBody(sticker: sticker),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: colors.surface.withValues(alpha: 0.85),
                  borderRadius: BorderRadius.circular(AppRadii.pill),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      f.time(m.createdAt),
                      style: type.caption.copyWith(
                        color: colors.textSecondary,
                        fontSize: 11,
                      ),
                    ),
                    if (mine) ...[
                      const SizedBox(width: 4),
                      ticks(colors.textSecondary),
                    ],
                  ],
                ),
              ),
            ],
          )
        : Container(
            constraints: BoxConstraints(
              maxWidth: MediaQuery.sizeOf(context).width * 0.78,
            ),
            padding: media
                ? const EdgeInsets.all(3)
                : const EdgeInsets.fromLTRB(
                    AppSpacing.md,
                    AppSpacing.sm,
                    AppSpacing.md,
                    AppSpacing.xs,
                  ),
            decoration: BoxDecoration(
              color: mine ? chat.mine : chat.theirs,
              borderRadius: BorderRadius.only(
                topLeft: const Radius.circular(18),
                topRight: const Radius.circular(18),
                bottomLeft: Radius.circular(mine ? 18 : 4),
                bottomRight: Radius.circular(mine ? 4 : 18),
              ),
              border: mine ? null : Border.all(color: chat.theirsBorder),
            ),
            child: media
                ? Stack(
                    children: [
                      _attachment(ref, m),
                      // WhatsApp: the time (and ticks) on the picture.
                      Positioned(
                        right: 6,
                        bottom: 6,
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 6,
                            vertical: 2,
                          ),
                          decoration: BoxDecoration(
                            color: ChatColors.mediaScrim,
                            borderRadius: BorderRadius.circular(AppRadii.pill),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                f.time(m.createdAt),
                                style: type.caption.copyWith(
                                  color: ChatColors.onMediaScrim,
                                ),
                              ),
                              if (mine) ...[
                                const SizedBox(width: 3),
                                ticks(ChatColors.onMediaScrim),
                              ],
                            ],
                          ),
                        ),
                      ),
                    ],
                  )
                : Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (m.forwarded && !m.revoked)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 3),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              AppIcon(
                                AppIcons.forwardRounded,
                                size: 13,
                                color: meta,
                              ),
                              const SizedBox(width: 4),
                              Text(
                                t.t('chat.forwarded'),
                                style: type.caption.copyWith(
                                  color: meta,
                                  fontStyle: FontStyle.italic,
                                  fontSize: 11,
                                ),
                              ),
                            ],
                          ),
                        ),
                      if (m.replyTo != null && !m.revoked)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 4),
                          child: ConstrainedBox(
                            constraints: BoxConstraints(
                              minWidth: MediaQuery.sizeOf(context).width * 0.4,
                            ),
                            child: ReplyQuote(
                              preview: m.replyTo!,
                              conversation: conversation,
                              mine: mine,
                            ),
                          ),
                        ),
                      if (m.revoked)
                        Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            AppIcon(
                              AppIcons.blockRounded,
                              size: 15,
                              color: meta,
                            ),
                            const SizedBox(width: 6),
                            Flexible(
                              child: Text(
                                t.t(mine ? 'chat.deletedMine' : 'chat.deleted'),
                                style: type.body.copyWith(
                                  color: meta,
                                  fontStyle: FontStyle.italic,
                                  height: 1.35,
                                ),
                              ),
                            ),
                          ],
                        )
                      else if (m.kind == MessageKind.voice && m.voice != null)
                        _voice(ref, m)
                      else if (m.kind == MessageKind.attachment &&
                          m.attachment != null)
                        _attachment(ref, m)
                      else
                        _MessageText(
                          message: m,
                          spans: spans,
                          style: type.body.copyWith(color: fg, height: 1.35),
                          // Owner 2026-10-04: only other people's text.
                          translatable: !mine &&
                              m.kind == MessageKind.text &&
                              m.body.trim().isNotEmpty &&
                              ref
                                  .watch(featureFlagsControllerProvider)
                                  .isEnabled('chat_translate'),
                          threadId: threadId,
                        ),
                      const SizedBox(height: 2),
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          if (m.pinned && !m.revoked) ...[
                            AppIcon(AppIcons.pushPin, size: 11, color: meta),
                            const SizedBox(width: 4),
                          ],
                          if (m.editedAt != null && !m.revoked) ...[
                            Text(
                              t.t('chat.edited'),
                              style: type.caption.copyWith(
                                color: meta,
                                fontStyle: FontStyle.italic,
                              ),
                            ),
                            const SizedBox(width: 4),
                          ],
                          Text(
                            f.time(m.createdAt),
                            style: type.caption.copyWith(color: meta),
                          ),
                          if (mine && !m.revoked) ...[
                            const SizedBox(width: 4),
                            ticks(meta),
                          ],
                        ],
                      ),
                    ],
                  ),
          );

    final interactive = m.kind != MessageKind.system;
    void menu() => unawaited(showMessageMenu(context, ref, threadId, m));
    final shown = AppEntrance(
      child: Semantics(
        label: [
          if (m.revoked)
            t.t(mine ? 'chat.deletedMine' : 'chat.deleted')
          else if (m.kind == MessageKind.voice)
            t.t('chat.voice.label')
          else if (m.kind == MessageKind.sticker)
            '${t.t('stickers.label')} ${m.sticker?.emoji ?? ''}'
          else if (m.kind == MessageKind.attachment)
            '${t.t('chat.attach.label')}: $fileNames'
          else
            m.body.replaceAll(kContactMask, t.t('chat.masked')),
          if (m.editedAt != null && !m.revoked) t.t('chat.edited'),
          if (mine) t.t(_deliveryKey(m.delivery, seen)),
        ].join('. '),
        // Voice bubbles keep their play/speed buttons reachable.
        excludeSemantics:
            m.kind != MessageKind.voice && m.kind != MessageKind.attachment,
        onLongPress: interactive && !selecting ? menu : null,
        child: bubble,
      ),
    );
    final actionable = interactive && !m.isLocal
        ? GestureDetector(
            onLongPress: selecting
                ? () => ref
                    .read(chatMsgSelectionProvider(threadId).notifier)
                    .toggle(m.id)
                : menu,
            onTap: selecting
                ? () => ref
                    .read(chatMsgSelectionProvider(threadId).notifier)
                    .toggle(m.id)
                : null,
            behavior: HitTestBehavior.deferToChild,
            child: selecting || m.revoked
                ? shown
                : SwipeToReply(
                    onReply: () => ref
                        .read(chatComposeProvider(threadId).notifier)
                        .reply(m),
                    child: shown,
                  ),
          )
        : shown;

    final column = Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Column(
        crossAxisAlignment:
            mine ? CrossAxisAlignment.end : CrossAxisAlignment.start,
        children: [
          // OQ-048: "Assistant · Sam" over an assistant's message.
          if (m.sentByAssistant != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 2, left: 4, right: 4),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  AppIcon(
                    AppIcons.supportAgentRounded,
                    size: 12,
                    color: colors.gold,
                  ),
                  const SizedBox(width: 3),
                  Flexible(
                    child: Text(
                      attorneyName != null
                          ? t.t('assistant.ofAttorney', {'name': attorneyName!})
                          : t.t('assistant.of', {'name': m.sentByAssistant!}),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: type.caption.copyWith(
                        color: colors.textSecondary,
                        fontSize: 11,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          actionable,
          if (m.reactions.isNotEmpty && !m.revoked)
            ReactionChips(message: m, conversationId: threadId, mine: mine),
          if (showSeenLabel)
            Padding(
              padding: const EdgeInsetsDirectional.only(top: 2, end: 4),
              child: Text(
                t.t('chat.seen'),
                style: type.caption.copyWith(color: colors.textSecondary),
              ),
            ),
          // One row; in long languages the labels shrink instead of moving.
          if (failedItems.isNotEmpty)
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Flexible(
                  child: FitText(
                    t.t('chat.notSent'),
                    style: type.caption.copyWith(color: colors.danger),
                  ),
                ),
                Flexible(
                  child: TextButton(
                    onPressed: () {
                      final n = ref.read(chatThreadProvider(threadId).notifier);
                      for (final x in failedItems) {
                        unawaited(n.retry(x));
                      }
                    },
                    child: FitText(t.t('error.retry')),
                  ),
                ),
                Flexible(
                  child: TextButton(
                    onPressed: () {
                      final n = ref.read(chatThreadProvider(threadId).notifier);
                      for (final x in failedItems) {
                        unawaited(n.discard(x));
                      }
                    },
                    child: FitText(t.t('chat.discard')),
                  ),
                ),
              ],
            ),
        ],
      ),
    );
    if (!selecting) return column;
    // Select mode: a round check at the start, the picked rows tinted.
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: interactive
          ? () =>
              ref.read(chatMsgSelectionProvider(threadId).notifier).toggle(m.id)
          : null,
      child: Container(
        color: selected ? colors.gold.withValues(alpha: 0.16) : null,
        child: Row(
          children: [
            if (interactive)
              Padding(
                padding: const EdgeInsetsDirectional.only(end: 8),
                child: AppIcon(
                  selected
                      ? AppIcons.checkCircleRounded
                      : AppIcons.radioButtonCheckedRounded,
                  size: 22,
                  color: selected ? colors.gold : colors.textSecondary,
                ),
              ),
            Expanded(child: IgnorePointer(child: column)),
          ],
        ),
      ),
    );
  }

  static String _deliveryKey(DeliveryState d, bool seen) => switch (d) {
        DeliveryState.sending => 'chat.state.sending',
        DeliveryState.failed => 'chat.notSent',
        DeliveryState.sent => seen ? 'chat.seen' : 'chat.state.sent',
      };
}

/// Three dots bouncing in turn (§8.2 "печатает…").
/// Owner 2026-10-04: a message's text with "Translate" under it (chats
/// only). The translation is into the app language and replaces the text
/// in place until "Show original"; the original is never lost.
class _MessageText extends ConsumerStatefulWidget {
  const _MessageText({
    required this.message,
    required this.spans,
    required this.style,
    required this.translatable,
    required this.threadId,
  });

  final ChatMessage message;
  final List<InlineSpan> spans;
  final TextStyle style;
  final bool translatable;
  final String threadId;

  @override
  ConsumerState<_MessageText> createState() => _MessageTextState();
}

class _MessageTextState extends ConsumerState<_MessageText> {
  String? _translated;
  bool _showTranslation = false;
  bool _loading = false;

  Future<void> _toggle() async {
    if (_translated != null) {
      setState(() => _showTranslation = !_showTranslation);
      return;
    }
    final target =
        (ref.read(languageControllerProvider).value ?? AppLanguage.fallback)
            .code;
    setState(() => _loading = true);
    try {
      final text = await ref
          .read(chatRepositoryProvider)
          .translate(widget.threadId, widget.message.id, target);
      if (!mounted) return;
      setState(() {
        _translated = text;
        _showTranslation = true;
      });
    } on Object catch (e) {
      if (mounted) showErrorOrPlans(context, ref, e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final showing = _showTranslation && _translated != null;
    final text = showing
        ? Text(_translated!, style: widget.style)
        : Text.rich(TextSpan(children: widget.spans), style: widget.style);
    if (!widget.translatable) return text;
    final link = type.caption.copyWith(
      color: colors.goldDark,
      fontSize: 12,
      fontWeight: FontWeight.w600,
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        text,
        const SizedBox(height: 4),
        Semantics(
          button: true,
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: _loading ? null : _toggle,
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 2),
              child: Text(
                _loading
                    ? t.t('chat.translate.loading')
                    : showing
                        ? '${t.t('chat.translate.note')} · '
                            '${t.t('chat.translate.original')}'
                        : t.t('chat.translate'),
                style: link,
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _TypingDots extends StatefulWidget {
  const _TypingDots();

  @override
  State<_TypingDots> createState() => _TypingDotsState();
}

class _TypingDotsState extends State<_TypingDots>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1100),
  )..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return Consumer(
      builder: (context, ref, _) {
        final t = ref.watch(translatorProvider);
        return Semantics(
          liveRegion: true,
          label: t.t('chat.typing'),
          child: Container(
            margin: const EdgeInsets.only(
              left: AppSpacing.screenSide,
              bottom: AppSpacing.xs,
            ),
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.md,
              vertical: AppSpacing.sm + 2,
            ),
            decoration: BoxDecoration(
              color: colors.surface,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: colors.border),
            ),
            child: AnimatedBuilder(
              animation: _c,
              builder: (context, _) => Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  for (var i = 0; i < 3; i++)
                    Transform.translate(
                      // Each dot rises in turn: a half sine, phase-shifted.
                      offset: Offset(
                        0,
                        context.reduceMotion
                            ? 0
                            : -4 *
                                math.max(
                                  0,
                                  math.sin(
                                    ((_c.value - i * 0.18) % 1.0) * 2 * math.pi,
                                  ),
                                ),
                      ),
                      child: Container(
                        width: 7,
                        height: 7,
                        margin: const EdgeInsets.symmetric(horizontal: 2),
                        decoration: BoxDecoration(
                          color: colors.goldDark,
                          shape: BoxShape.circle,
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}

class _Banner extends StatelessWidget {
  const _Banner({required this.icon, required this.text, super.key});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.screenSide,
        vertical: AppSpacing.md,
      ),
      color: colors.goldTint,
      child: Row(
        children: [
          AppIcon(icon, size: AppSizes.iconSm, color: colors.goldDark),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child:
                Text(text, style: type.bodySmall.copyWith(color: colors.text)),
          ),
        ],
      ),
    );
  }
}

/// §8.3 one-time hint "Контакты скрываются до принятия предложения".
class _MaskingHint extends ConsumerStatefulWidget {
  const _MaskingHint();

  @override
  ConsumerState<_MaskingHint> createState() => _MaskingHintState();
}

class _MaskingHintState extends ConsumerState<_MaskingHint> {
  static const _key = 'chat.maskingHintSeen';

  @override
  Widget build(BuildContext context) {
    final prefs = ref.watch(sharedPreferencesProvider);
    if (prefs.getBool(_key) ?? false) return const SizedBox.shrink();
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Container(
      margin: const EdgeInsets.fromLTRB(
        AppSpacing.screenSide,
        0,
        AppSpacing.screenSide,
        AppSpacing.xs,
      ),
      padding: const EdgeInsets.only(left: AppSpacing.md),
      decoration: BoxDecoration(
        color: colors.infoTint,
        borderRadius: BorderRadius.circular(AppRadii.card),
      ),
      child: Row(
        children: [
          AppIcon(
            AppIcons.privacyTipOutlined,
            size: AppSizes.iconSm,
            color: colors.info,
          ),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Text(
              t.t('chat.maskingHint'),
              style: type.caption.copyWith(color: colors.text),
            ),
          ),
          AppIconButton(
            icon: AppIcon(
              AppIcons.closeRounded,
              size: 18,
              color: colors.textSecondary,
            ),
            semanticLabel: t.t('common.close'),
            onPressed: () async {
              await prefs.setBool(_key, true);
              if (mounted) setState(() {});
            },
          ),
        ],
      ),
    );
  }
}

/// OQ-043: "Anna wants to message you" — Accept · Delete · Block.
class _RequestPanel extends ConsumerStatefulWidget {
  const _RequestPanel({required this.conversation, required this.thread});

  final Conversation conversation;
  final ChatThread thread;

  @override
  ConsumerState<_RequestPanel> createState() => _RequestPanelState();
}

class _RequestPanelState extends ConsumerState<_RequestPanel> {
  bool _busy = false;

  Future<void> _answer(bool accept) async {
    final t = ref.read(translatorProvider);
    setState(() => _busy = true);
    try {
      await widget.thread.answerRequest(accept: accept);
      if (!accept && mounted) Navigator.of(context).maybePop();
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, errorText(t, e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final c = widget.conversation;
    final name = counterpartName(t, c);
    return Material(
      color: colors.surface,
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.screenSide,
            AppSpacing.md,
            AppSpacing.screenSide,
            AppSpacing.md,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                t.t('chat.requests.wants', {'name': name}),
                textAlign: TextAlign.center,
                style: type.body
                    .copyWith(color: colors.text, fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: AppSpacing.xs),
              Text(
                t.t('chat.requests.privacy'),
                textAlign: TextAlign.center,
                style: type.caption.copyWith(color: colors.textSecondary),
              ),
              const SizedBox(height: AppSpacing.md),
              Row(
                children: [
                  if (c.counterpart.id != null)
                    Expanded(
                      child: AppButton(
                        label: t.t('chat.requests.block'),
                        variant: AppButtonVariant.secondary,
                        height: AppSizes.touchTarget,
                        onPressed: _busy
                            ? null
                            : () async {
                                final blocked = await toggleBlock(
                                  context,
                                  ref,
                                  userId: c.counterpart.id!,
                                  displayName: name,
                                  currentlyBlocked: false,
                                );
                                if (blocked) await _answer(false);
                              },
                      ),
                    ),
                  if (c.counterpart.id != null)
                    const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: AppButton(
                      label: t.t('chat.requests.delete'),
                      variant: AppButtonVariant.secondary,
                      height: AppSizes.touchTarget,
                      onPressed: _busy ? null : () => _answer(false),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: AppButton(
                      label: t.t('chat.requests.accept'),
                      height: AppSizes.touchTarget,
                      onPressed: _busy ? null : () => _answer(true),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SubscriptionGate extends StatelessWidget {
  const _SubscriptionGate({required this.t});

  final Translator t;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return SafeArea(
      top: false,
      child: Container(
        margin: const EdgeInsets.all(AppSpacing.screenSide),
        padding: const EdgeInsets.all(AppSpacing.lg),
        decoration: BoxDecoration(
          color: colors.surface,
          borderRadius: BorderRadius.circular(AppRadii.card),
          border: Border.all(color: colors.goldStroke),
        ),
        child: Column(
          children: [
            Text(
              t.t('chat.subscriptionRequired'),
              textAlign: TextAlign.center,
              style: type.body.copyWith(color: colors.text),
            ),
            const SizedBox(height: AppSpacing.md),
            AppButton(
              label: t.t('chat.renew'),
              height: AppSizes.touchTarget,
              onPressed: () =>
                  context.push(AppRoutes.subscriptionRequiredFor('chat')),
            ),
          ],
        ),
      ),
    );
  }
}

/// Text field + send; with an empty field the button is a mic (OQ-040):
/// hold to record, slide left to cancel, slide up to lock and keep
/// recording hands-free, release (or Send when locked) to send.
class _Composer extends ConsumerStatefulWidget {
  const _Composer({
    required this.controller,
    required this.focusNode,
    required this.onSend,
    required this.onTyping,
    required this.onVoice,
    required this.draftKey,
    this.onAttach,
    this.onStickers,
    this.onFieldTap,
    this.stickersOpen = false,
  });

  /// Owner 2026-10-01: the Emoji · Stickers button in the field.
  final VoidCallback? onStickers;
  final VoidCallback? onFieldTap;
  final bool stickersOpen;

  /// OQ-047: photos and documents — only once the bid is accepted.
  final VoidCallback? onAttach;

  final TextEditingController controller;
  final FocusNode focusNode;
  final VoidCallback onSend;
  // ignore: avoid_positional_boolean_parameters
  final void Function(bool active) onTyping;
  final Future<void> Function(VoiceRecording r) onVoice;

  /// The chat id: a recording left unsent waits under it.
  final String draftKey;

  @override
  ConsumerState<_Composer> createState() => _ComposerState();
}

class _ComposerState extends ConsumerState<_Composer> {
  static const _cancelDx = -110.0;
  static const _lockDy = -80.0;

  bool _recording = false;
  bool _locked = false;

  /// Lock mode: recording paused (the bars freeze, preview is offered).
  bool _paused = false;

  /// The finished file: a recording left here earlier, or the paused note
  /// once it was played back (a resume is no longer possible then — the
  /// file is closed).
  VoiceRecording? _held;

  /// The finger is on the mic. Starting the recorder takes a moment; a
  /// quick tap may lift the finger before it runs — then nothing records.
  bool _pressed = false;
  Offset _drag = Offset.zero;
  final List<double> _levels = [];
  StreamSubscription<double>? _levelSub;
  Timer? _tick;
  Duration _elapsed = Duration.zero;

  // Owned by the composer: lives exactly as long as the chat screen.
  final VoiceRecorder _rec = VoiceRecorder();
  late final VoiceDrafts _drafts;
  late final VoicePlayer _player;

  @override
  void initState() {
    super.initState();
    // Resolved now: dispose cannot read providers.
    _drafts = ref.read(voiceDraftsProvider.notifier);
    _player = ref.read(voicePlayerProvider.notifier);
    // A recording left here (call came in, screen left) is back, paused.
    final draft = _drafts.of(widget.draftKey);
    if (draft != null) {
      _held = draft;
      _recording = true;
      _locked = true;
      _paused = true;
      _elapsed = Duration(milliseconds: draft.durationMs);
    }
  }

  @override
  void dispose() {
    _levelSub?.cancel();
    _tick?.cancel();
    unawaited(_player.stopDraft());
    unawaited(_saveDraft());
    super.dispose();
  }

  /// Leaving the chat or a call coming in must not throw a recording away:
  /// it is closed into a file and waits in the composer.
  Future<void> _saveDraft() async {
    if (!_recording) {
      await _rec.dispose();
      return;
    }
    var r = _held;
    if (r == null && _rec.recording) {
      r = await _rec.stop();
    }
    if (r != null) {
      _drafts.put(widget.draftKey, r);
    } else if (_rec.recording) {
      await _rec.cancel();
    }
    await _rec.dispose();
  }

  bool get _callBusy => _player.callBusy;

  /// A call rings or starts while recording: the microphone belongs to the
  /// call. The note is closed into a paused draft the user can send later.
  Future<void> _onCall() async {
    if (!_recording || _held != null) return;
    await _levelSub?.cancel();
    _tick?.cancel();
    final r = await _rec.stop();
    if (!mounted) return;
    if (r == null) {
      setState(_reset);
      return;
    }
    setState(() {
      _held = r;
      _locked = true;
      _paused = true;
      _elapsed = Duration(milliseconds: r.durationMs);
    });
  }

  Future<void> _start() async {
    final t = ref.read(translatorProvider);
    if (_callBusy) {
      showAppSnackBar(context, t.t('chat.voice.duringCall'));
      return;
    }
    // One note at a time: stop whatever is playing.
    unawaited(_player.stop());
    // ignore: unawaited_futures
    HapticFeedback.mediumImpact();
    // The buzz is over before the microphone opens, so it is not recorded.
    await Future<void>.delayed(const Duration(milliseconds: 130));
    if (!mounted) return;
    final ok = await _rec.start(onCap: () => _finish(send: true));
    if (!mounted) return;
    if (!ok) {
      showAppSnackBar(context, t.t('chat.voice.noMic'));
      return;
    }
    if (!_pressed) {
      // Released before the recorder started: a tap, not a hold.
      await _rec.cancel();
      if (mounted) showAppSnackBar(context, t.t('chat.voice.hold'));
      return;
    }
    _levels.clear();
    _listenLevels();
    setState(() {
      _recording = true;
      _locked = false;
      _paused = false;
      _drag = Offset.zero;
      _elapsed = Duration.zero;
    });
  }

  void _listenLevels() {
    _levelSub = _rec.levels.listen((l) {
      if (!mounted) return;
      setState(() {
        _levels.add(l);
        if (_levels.length > 40) _levels.removeAt(0);
      });
    });
    _tick = Timer.periodic(const Duration(milliseconds: 200), (_) {
      if (mounted) setState(() => _elapsed = _rec.elapsed);
    });
  }

  /// Back to an empty composer.
  void _reset() {
    _drafts.clear(widget.draftKey);
    _held = null;
    _recording = false;
    _locked = false;
    _paused = false;
    _drag = Offset.zero;
  }

  Future<void> _finish({required bool send}) async {
    if (!_recording) return;
    await _levelSub?.cancel();
    _tick?.cancel();
    await _player.stop();
    final held = _held;
    setState(_reset);
    if (!send) {
      // ignore: unawaited_futures
      HapticFeedback.lightImpact();
      if (held != null) {
        await deleteVoiceFile(held.path);
      } else {
        await _rec.cancel();
      }
      return;
    }
    final r = held ?? await _rec.stop();
    if (!mounted) return;
    if (r == null) {
      showAppSnackBar(
        context,
        ref.read(translatorProvider).t('chat.voice.hold'),
      );
      return;
    }
    // ignore: unawaited_futures
    HapticFeedback.lightImpact();
    await widget.onVoice(r);
  }

  /// Lock mode: pause — the bars freeze, play-back and resume appear.
  Future<void> _pauseRec() async {
    await _rec.pause();
    _tick?.cancel();
    await _levelSub?.cancel();
    if (!mounted) return;
    setState(() {
      _paused = true;
      _elapsed = _rec.elapsed;
    });
  }

  Future<void> _resumeRec() async {
    if (_held != null) return;
    await _player.stop();
    await _rec.resume();
    if (!mounted) return;
    _listenLevels();
    setState(() => _paused = false);
  }

  /// Plays the paused note (closes the file the first time) through the
  /// app's one voice player: same fades, never two sounds at once.
  Future<void> _togglePreview() async {
    if (_callBusy) {
      showAppSnackBar(
        context,
        ref.read(translatorProvider).t('chat.voice.duringCall'),
      );
      return;
    }
    final r = _held ?? await _rec.stop();
    if (!mounted) return;
    if (r == null) {
      showAppSnackBar(
        context,
        ref.read(translatorProvider).t('chat.voice.hold'),
      );
      return;
    }
    setState(() => _held = r);
    await _player.toggleLocal(r.path, r.durationMs);
  }

  Future<void> _seekPreview(double f) async {
    final h = _held;
    if (h == null) return;
    final playback = ref.read(voicePlayerProvider);
    if (playback.messageId != kVoiceDraftId) await _togglePreview();
    await _player.seekTo(Duration(milliseconds: (h.durationMs * f).round()));
  }

  Future<void> _sendLocked() async {
    final h = _held;
    if (h == null) return _finish(send: true);
    await _levelSub?.cancel();
    _tick?.cancel();
    await _player.stop();
    setState(_reset);
    // ignore: unawaited_futures
    HapticFeedback.lightImpact();
    await widget.onVoice(h);
  }

  void _onMove(PointerMoveEvent e) {
    if (!_recording || _locked) return;
    setState(() => _drag += e.delta);
    if (_drag.dx < _cancelDx) {
      unawaited(_finish(send: false));
    } else if (_drag.dy < _lockDy) {
      // No buzz here: the microphone is open and would record it.
      setState(() => _locked = true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final motion = context.reduceMotion ? Duration.zero : AppMotion.stateChange;
    ref.listen(callControllerProvider.select((c) => c.phase), (_, phase) {
      if (phase != CallPhase.idle) unawaited(_onCall());
    });
    final playback = ref.watch(voicePlayerProvider);
    final onDraft = playback.messageId == kVoiceDraftId;
    final previewPlaying = onDraft && playback.playing;
    final previewAt = onDraft ? playback.position : Duration.zero;

    // Owner 2026-10-15: the counter shows up near the limit (Telegram).
    // Owner 2026-10-19: inside the field, bottom right.
    final maxChars = kMessageMaxChars;
    final counterFrom = (maxChars * 0.9).ceil();
    final field = ListenableBuilder(
      listenable: widget.controller,
      builder: (context, _) {
        final near = widget.controller.text.characters.length >= counterFrom;
        return InsideCounter(
          controller: widget.controller,
          max: maxChars,
          showFrom: counterFrom,
          child: TextField(
            onTapOutside: hideKeyboardOnTapOutside,
            controller: widget.controller,
            focusNode: widget.focusNode,
            minLines: 1,
            maxLines: 5,
            maxLength: maxChars,
            buildCounter: noFieldCounter,
            textCapitalization: TextCapitalization.sentences,
            onChanged: (v) => widget.onTyping(v.isNotEmpty),
            onTap: widget.onFieldTap,
            style: type.body.copyWith(color: colors.text),
            decoration: InputDecoration(
              hintText: t.t('chat.hint'),
              suffixIcon: widget.onStickers == null
                  ? null
                  : IconButton(
                      tooltip: t.t('stickers.button'),
                      onPressed: widget.onStickers,
                      icon: AppIcon(
                        widget.stickersOpen
                            ? AppIcons.keyboardRounded
                            : AppIcons.smileyStickerOutlined,
                        color: widget.stickersOpen
                            ? colors.goldDark
                            : colors.textSecondary,
                      ),
                    ),
              filled: true,
              fillColor: colors.bg,
              contentPadding: EdgeInsets.fromLTRB(
                AppSpacing.md,
                AppSpacing.md,
                AppSpacing.md,
                AppSpacing.md + (near ? kInsideCounterRoom : 0),
              ),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(24),
                borderSide: BorderSide(color: colors.border),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(24),
                borderSide: BorderSide(color: colors.border),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(24),
                borderSide: BorderSide(color: colors.gold),
              ),
            ),
          ),
        );
      },
    );

    final recordingRow = Container(
      height: AppSizes.touchTarget + 4,
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xs),
      decoration: BoxDecoration(
        color: colors.bg,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: colors.goldStroke),
      ),
      child: Row(
        children: [
          if (_locked)
            AppIconButton(
              icon:
                  AppIcon(AppIcons.deleteOutlineRounded, color: colors.danger),
              semanticLabel: t.t('chat.voice.cancel'),
              onPressed: () => _finish(send: false),
            )
          else ...[
            const SizedBox(width: AppSpacing.sm),
            _RecDot(color: colors.danger),
          ],
          if (_paused)
            AppIconButton(
              icon: AppIcon(
                previewPlaying
                    ? AppIcons.pauseRounded
                    : AppIcons.playArrowRounded,
                color: colors.goldDark,
              ),
              semanticLabel: t.t(
                previewPlaying ? 'chat.voice.pause' : 'chat.voice.play',
              ),
              onPressed: _togglePreview,
            )
          else
            const SizedBox(width: AppSpacing.sm),
          Text(
            voiceClock(
              _paused && previewAt > Duration.zero ? previewAt : _elapsed,
            ),
            style: type.body.copyWith(
              color: colors.text,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: _paused
                ? VoiceWave(
                    bars: _held?.waveform ?? _rec.waveformNow,
                    progress: _held == null || _held!.durationMs == 0
                        ? 0
                        : previewAt.inMilliseconds / _held!.durationMs,
                    onSeek: _held == null ? null : _seekPreview,
                  )
                : _locked
                    ? RecordingMeter(levels: _levels)
                    : Opacity(
                        opacity: (1 + _drag.dx / -_cancelDx).clamp(0.2, 1.0),
                        child: Text(
                          '‹ ${t.t('chat.voice.slideCancel')}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          textAlign: TextAlign.center,
                          style: type.bodySmall
                              .copyWith(color: colors.textSecondary),
                        ),
                      ),
          ),
          if (_locked && !_paused)
            AppIconButton(
              icon: AppIcon(AppIcons.pauseRounded, color: colors.danger),
              semanticLabel: t.t('chat.voice.pauseRec'),
              onPressed: _pauseRec,
            ),
          if (_paused && _held == null)
            AppIconButton(
              icon: AppIcon(AppIcons.micRounded, color: colors.danger),
              semanticLabel: t.t('chat.voice.resume'),
              onPressed: _resumeRec,
            ),
        ],
      ),
    );

    Widget circle({
      required IconData icon,
      required bool on,
      required String label,
      double scale = 1,
    }) =>
        AnimatedScale(
          scale: scale,
          duration: motion,
          curve: Curves.easeOutBack,
          child: Semantics(
            button: true,
            label: label,
            excludeSemantics: true,
            child: AnimatedContainer(
              duration: motion,
              width: AppSizes.touchTarget + 4,
              height: AppSizes.touchTarget + 4,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: on ? colors.gold : colors.border,
              ),
              child:
                  AppIcon(icon, color: on ? colors.navy : colors.textSecondary),
            ),
          ),
        );

    // The composer (send, attach, mic) keeps the keyboard; taps outside
    // it hide the keyboard.
    return TextFieldTapRegion(
      child: Material(
        color: colors.surface,
        child: SafeArea(
          top: false,
          // The sticker panel below takes the system-nav inset instead.
          bottom: !widget.stickersOpen,
          child: Padding(
            // Owner 2026-09-30: the paperclip and the field sit close to the
            // left edge.
            padding: EdgeInsets.fromLTRB(
              widget.onAttach != null ? AppSpacing.xs : AppSpacing.sm,
              AppSpacing.sm,
              AppSpacing.sm,
              AppSpacing.sm,
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                if (widget.onAttach != null && !_recording)
                  Padding(
                    padding: EdgeInsets.zero,
                    child: AppIconButton(
                      icon: AppIcon(
                        AppIcons.attachFileRounded,
                        color: colors.goldDark,
                      ),
                      semanticLabel: t.t('chat.attach.button'),
                      onPressed: widget.onAttach,
                    ),
                  ),
                Expanded(
                  child: AnimatedSwitcher(
                    duration: motion,
                    child: _recording ? recordingRow : field,
                  ),
                ),
                const SizedBox(width: AppSpacing.xs),
                ValueListenableBuilder<TextEditingValue>(
                  valueListenable: widget.controller,
                  builder: (context, v, _) {
                    final hasText = v.text.trim().isNotEmpty;
                    if (hasText && !_recording) {
                      return AppPressable(
                        onTap: widget.onSend,
                        child: circle(
                          icon: AppIcons.arrowUpwardRounded,
                          on: true,
                          label: t.t('chat.send'),
                        ),
                      );
                    }
                    if (_locked) {
                      return AppPressable(
                        onTap: _sendLocked,
                        child: circle(
                          icon: AppIcons.arrowUpwardRounded,
                          on: true,
                          label: t.t('chat.voice.sendNow'),
                        ),
                      );
                    }
                    // Hold-to-record mic; a lock hint floats above it.
                    return Stack(
                      clipBehavior: Clip.none,
                      alignment: Alignment.bottomCenter,
                      children: [
                        if (_recording)
                          Positioned(
                            bottom: AppSizes.touchTarget + 16,
                            child: Opacity(
                              opacity:
                                  (0.4 + _drag.dy / _lockDy).clamp(0.4, 1.0),
                              child: Container(
                                padding: const EdgeInsets.all(8),
                                decoration: BoxDecoration(
                                  color: colors.surface,
                                  borderRadius:
                                      BorderRadius.circular(AppRadii.pill),
                                  border: Border.all(color: colors.border),
                                ),
                                child: AppIcon(
                                  AppIcons.lockOutlineRounded,
                                  size: 18,
                                  color: colors.goldDark,
                                ),
                              ),
                            ),
                          ),
                        Listener(
                          onPointerDown: (_) {
                            _pressed = true;
                            unawaited(_start());
                          },
                          onPointerMove: _onMove,
                          onPointerUp: (_) {
                            _pressed = false;
                            if (!_locked) unawaited(_finish(send: true));
                          },
                          onPointerCancel: (_) {
                            _pressed = false;
                            if (!_locked) unawaited(_finish(send: false));
                          },
                          child: Transform.translate(
                            offset: _recording && !_locked
                                ? Offset(math.min(0, _drag.dx) * 0.5, 0)
                                : Offset.zero,
                            child: circle(
                              icon: AppIcons.micRounded,
                              on: true,
                              label: t.t('chat.voice.record'),
                              scale: _recording ? 1.25 : 1,
                            ),
                          ),
                        ),
                      ],
                    );
                  },
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Blinking red dot of a running recording.
class _RecDot extends StatefulWidget {
  const _RecDot({required this.color});

  final Color color;

  @override
  State<_RecDot> createState() => _RecDotState();
}

class _RecDotState extends State<_RecDot> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 900),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => FadeTransition(
        opacity: context.reduceMotion
            ? const AlwaysStoppedAnimation(1)
            // ignore: prefer_int_literals
            : Tween(begin: 0.25, end: 1.0).animate(_c),
        child: Container(
          width: 10,
          height: 10,
          decoration:
              BoxDecoration(shape: BoxShape.circle, color: widget.color),
        ),
      );
}

/// Owner 2026-10-17: the chat wallpaper's pattern — small legal signs
/// (scales, gavel, document, quote, lock) in a loose staggered grid, one
/// faint colour per theme (ChatColors.pattern).
class _WallpaperPainter extends CustomPainter {
  _WallpaperPainter(this.color);

  final Color color;

  static const _icons = [
    AppIcons.balanceRounded,
    AppIcons.gavelRounded,
    AppIcons.descriptionOutlined,
    AppIcons.chatBubbleOutlineRounded,
    AppIcons.lockOutlineRounded,
    AppIcons.eventOutlined,
  ];
  static const _cell = 76.0;
  static const _glyph = 22.0;

  /// Owner 2026-10-18 (speed): the pattern is recorded once per colour and
  /// size into a picture and that picture is drawn on every repaint (it
  /// used to lay out ~70 icon glyphs — a TextPainter each — on every
  /// repaint). The six glyphs are laid out once per colour and kept with
  /// the picture.
  static Color? _pictureColor;
  static Size? _pictureSize;
  static ui.Picture? _picture;
  static List<TextPainter> _glyphs = const [];

  static ui.Picture _patternFor(Color color, Size size) {
    final cached = _picture;
    if (cached != null && _pictureColor == color && _pictureSize == size) {
      return cached;
    }
    if (_pictureColor != color) {
      for (final g in _glyphs) {
        g.dispose();
      }
      _glyphs = [
        for (final icon in _icons)
          TextPainter(
            text: TextSpan(
              text: String.fromCharCode(icon.codePoint),
              style: TextStyle(
                fontFamily: icon.fontFamily,
                package: icon.fontPackage,
                fontSize: _glyph,
                color: color,
              ),
            ),
            textDirection: TextDirection.ltr,
          )..layout(),
      ];
    }
    final recorder = ui.PictureRecorder();
    final canvas = Canvas(recorder);
    var row = 0;
    for (var y = 0.0; y < size.height + _cell; y += _cell, row++) {
      var col = 0;
      final shift = row.isOdd ? _cell / 2 : 0.0;
      for (var x = -shift; x < size.width + _cell; x += _cell, col++) {
        final tp = _glyphs[(row * 5 + col * 3) % _icons.length];
        canvas
          ..save()
          ..translate(x + 18, y + 18)
          ..rotate(((row + col) % 5 - 2) * 0.18);
        tp.paint(canvas, Offset(-tp.width / 2, -tp.height / 2));
        canvas.restore();
      }
    }
    cached?.dispose();
    final picture = recorder.endRecording();
    _picture = picture;
    _pictureColor = color;
    _pictureSize = size;
    return picture;
  }

  @override
  void paint(Canvas canvas, Size size) {
    if (color.a == 0) return;
    canvas.drawPicture(_patternFor(color, size));
  }

  @override
  bool shouldRepaint(_WallpaperPainter old) => old.color != color;
}
