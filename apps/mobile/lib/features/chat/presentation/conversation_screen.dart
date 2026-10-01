import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/blocks/application/blocks_providers.dart';
import 'package:lawbid/features/blocks/presentation/block_actions.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';
import 'package:lawbid/features/calls/presentation/call_log_entry.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/application/voice_player.dart';
import 'package:lawbid/features/chat/application/voice_recorder.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/inbox_screen.dart';
import 'package:lawbid/features/chat/presentation/attachment_widgets.dart';
import 'package:lawbid/features/chat/presentation/voice_widgets.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/widgets/post_sheets.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/features/team/domain/team_models.dart';

/// docs/05 §8.2: 2000 characters, text only.
const kMessageMaxChars = 2000;

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
  bool _resumed = true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _text.dispose();
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
    HapticFeedback.lightImpact();
    _text.clear();
    _thread.typing(false);
    await _thread.send(text);
  }

  /// OQ-041: calls open once the bid is accepted (contacts unlocked).
  void _call(Conversation c) {
    final t = ref.read(translatorProvider);
    if (!c.contactsUnlocked) {
      showAppSnackBar(context,
          t.t(c.isDirect ? 'call.notAllowedRequest' : 'call.notAllowed'));
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
        );
  }

  /// OQ-047: pick photos / documents and send each; the typed text goes
  /// with the first as its caption.
  Future<void> _attach() async {
    final t = ref.read(translatorProvider);
    final files = await pickChatFiles(context, t);
    if (files.isEmpty || !mounted) return;
    final caption = _text.text.trim();
    if (caption.isNotEmpty) _text.clear();
    for (var i = 0; i < files.length; i++) {
      final f = files[i];
      unawaited(_thread.sendAttachment(
        bytes: f.bytes,
        name: f.name,
        mime: f.mime,
        caption: i == 0 && caption.isNotEmpty ? caption : null,
      ));
    }
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
            // OQ-047: every photo and document of this chat.
            if (c.contactsUnlocked)
              AppListRow(
                icon: Icons.folder_open_rounded,
                label: t.t('chat.files.title'),
                onTap: () {
                  Navigator.of(sheet).pop();
                  Navigator.of(context).push(MaterialPageRoute<void>(
                    builder: (_) => ChatFilesScreen(conversationId: c.id),
                  ));
                },
              ),
            AppListRow(
              icon: c.muted
                  ? Icons.notifications_active_outlined
                  : Icons.notifications_off_outlined,
              label: t.t(c.muted ? 'chat.unmute' : 'chat.mute'),
              showChevron: false,
              onTap: () async {
                Navigator.of(sheet).pop();
                try {
                  await _thread.setMuted(!c.muted);
                } on Object catch (e) {
                  if (mounted) showAppSnackBar(context, errorText(t, e));
                }
              },
            ),
            if (c.counterpart.id != null)
              // OQ-028: block / unblock the other party.
              BlockListRow(
                userId: c.counterpart.id!,
                displayName: c.counterpart.displayName ??
                    (c.counterpart.username == null
                        ? ''
                        : '@${c.counterpart.username}'),
                currentlyBlocked: ref.read(blockedIdsProvider).value?.contains(
                          c.counterpart.id,
                        ) ??
                    false,
                onChanged: () {},
              ),
            if (c.counterpart.id != null)
              AppListRow(
                icon: Icons.flag_outlined,
                label: t.t('post.menu.report'),
                showChevron: false,
                onTap: () {
                  Navigator.of(sheet).pop();
                  showReportSheet(
                      context, ref, ReportTarget.user, c.counterpart.id!);
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
        (_, __) => _markRead());
    final attorney = ref.watch(actsAsAttorneyProvider);
    final subscriptionGate =
        ref.watch(outboxSenderProvider).subscriptionRequired;

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: c == null ? null : _Header(conversation: c),
        actions: [
          // OQ-041: an in-app audio call (after acceptance).
          // OQ-043: a direct chat gets calls once the request is accepted.
          // Owner 2026-09-30: no call button until a request is accepted.
          if (c != null &&
              !c.closed &&
              !c.myRequestPending &&
              !c.awaitingMyAnswer &&
              !c.myRequestDeclined)
            AppIconButton(
              plain: true,
              icon: Icon(
                Icons.call_outlined,
                color: c.contactsUnlocked ? colors.text : colors.textSecondary,
              ),
              semanticLabel: t.t('call.button'),
              onPressed: () => _call(c),
            ),
          if (c != null)
            AppIconButton(
              plain: true,
              icon: Icon(Icons.more_horiz_rounded, color: colors.text),
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
                        icon: Icons.lock_outline_rounded,
                        text: t.t('chat.closed'),
                      ),
                    Expanded(
                        child:
                            _MessageList(state: s, onMore: _thread.loadMore)),
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
                    else if (c != null && c.myRequestDeclined)
                      _Banner(
                        icon: Icons.block_rounded,
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
                                      icon: Icons.schedule_send_outlined,
                                      text: t.t('chat.requests.sentNote'),
                                    )
                                  else if (!c.contactsUnlocked)
                                    const _MaskingHint(),
                                  _Composer(
                                    controller: _text,
                                    onSend: _send,
                                    onTyping: _thread.typing,
                                    // OQ-048: assistants need "files".
                                    onAttach: c.contactsUnlocked &&
                                            ref.watch(canDoProvider(
                                                AssistantDuty.files))
                                        ? () => _attach()
                                        : null,
                                    onVoice: (r) => _thread.sendVoice(
                                      path: r.path,
                                      durationMs: r.durationMs,
                                      waveform: r.waveform,
                                    ),
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
  const _Header({required this.conversation});

  final Conversation conversation;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final c = conversation;
    final attorney = ref.watch(actsAsAttorneyProvider);
    final caseId = c.caseId;
    return Semantics(
      button: caseId != null,
      label: caseId != null ? t.t('chat.openCase') : counterpartName(t, c),
      child: AppPressable(
        // Without a case (reserved) the header opens the attorney's profile.
        onTap: () {
          if (caseId != null) {
            context.push(attorney
                ? AppRoutes.caseDetail(caseId)
                : AppRoutes.myCase(caseId));
          } else if (c.counterpart.username != null) {
            // OQ-043: a direct chat opens the other person's profile.
            context.push(c.counterpart.isAttorney
                ? AppRoutes.lawyer(c.counterpart.username!)
                : AppRoutes.client(c.counterpart.username!));
          }
        },
        child: Row(
          children: [
            CounterpartAvatar(counterpart: c.counterpart, size: 36),
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
                        color: colors.text, fontWeight: FontWeight.w600),
                  ),
                  Text(
                    c.caseTitle ??
                        (c.counterpart.username == null
                            ? t.t('chat.direct')
                            : '@${c.counterpart.username}'),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: type.caption.copyWith(color: colors.goldDark),
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
        icon: Icons.chat_bubble_outline_rounded,
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

    return ListView.builder(
      reverse: true,
      padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.screenSide, vertical: AppSpacing.md),
      itemCount: items.length + (state.nextCursor != null ? 1 : 0),
      itemBuilder: (context, i) {
        if (i == items.length) {
          if (state.loadMoreFailed) {
            return Center(
              child: TextButton(
                  onPressed: onMore, child: Text(t.t('error.retry'))),
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
                    strokeWidth: AppSizes.footerSpinnerStroke),
              ),
            ),
          );
        }
        final m = items[i];
        final older = i + 1 < items.length ? items[i + 1] : null;
        final newDay = older == null ||
            !DateUtils.isSameDay(
                older.createdAt.toLocal(), m.createdAt.toLocal());
        final seen = seenIndex >= 0 && i >= seenIndex && m.senderId == me;
        return Column(
          // Stretch: a bubble sits at the right (mine) or left (theirs)
          // edge like Telegram, never centered (owner 2026-09-29).
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (newDay) _DaySeparator(label: _dayLabel(t, f, m.createdAt)),
            if (m.kind == MessageKind.system)
              _SystemMessage(text: t.t('chat.system.${m.body}'))
            else if (m.kind == MessageKind.call && m.callLog != null)
              CallLogEntry(
                message: m,
                mine: m.senderId == me,
                conversation: state.conversation,
              )
            else
              _Bubble(
                message: m,
                mine: m.senderId == me,
                seen: seen,
                showSeenLabel: m.id == newestOwnSeen,
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
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.md),
      child: Row(
        children: [
          Expanded(child: Divider(color: colors.border)),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
            child: Text(label,
                style: type.caption.copyWith(color: colors.textSecondary)),
          ),
          Expanded(child: Divider(color: colors.border)),
        ],
      ),
    );
  }
}

class _SystemMessage extends StatelessWidget {
  const _SystemMessage({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
      child: Center(
        child: Container(
          padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.md, vertical: AppSpacing.sm),
          decoration: BoxDecoration(
            color: colors.goldTint,
            borderRadius: BorderRadius.circular(AppRadii.pill),
            border: Border.all(color: colors.goldStroke),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.gavel_rounded, size: 14, color: colors.goldDark),
              const SizedBox(width: AppSpacing.xs),
              Flexible(
                child: Text(
                  text,
                  textAlign: TextAlign.center,
                  style: type.caption.copyWith(
                      color: colors.text, fontWeight: FontWeight.w600),
                ),
              ),
            ],
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
    this.attorneyName,
  });

  /// Set when the message came from the other side (the attorney's team).
  final String? attorneyName;

  final ChatMessage message;
  final bool mine;
  final bool seen;
  final bool showSeenLabel;
  final String threadId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final m = message;
    final fg = mine ? colors.onAccent : colors.text;
    final failed = m.delivery == DeliveryState.failed;

    // Hidden contacts shown as a localized inline marker (§8.3).
    final parts = m.body.split(kContactMask);
    final spans = <InlineSpan>[];
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].isNotEmpty) spans.add(TextSpan(text: parts[i]));
      if (i < parts.length - 1) {
        spans.add(TextSpan(
          text: ' ${t.t('chat.masked')} ',
          style: TextStyle(
            fontStyle: FontStyle.italic,
            backgroundColor:
                (mine ? colors.gold : colors.goldTint).withValues(alpha: 0.35),
          ),
        ));
      }
    }

    final bubble = Container(
      constraints:
          BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.78),
      padding: const EdgeInsets.fromLTRB(
          AppSpacing.md, AppSpacing.sm, AppSpacing.md, AppSpacing.xs),
      decoration: BoxDecoration(
        color: mine ? colors.accent : colors.surface,
        borderRadius: BorderRadius.only(
          topLeft: const Radius.circular(18),
          topRight: const Radius.circular(18),
          bottomLeft: Radius.circular(mine ? 18 : 4),
          bottomRight: Radius.circular(mine ? 4 : 18),
        ),
        border: mine ? null : Border.all(color: colors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.end,
        mainAxisSize: MainAxisSize.min,
        children: [
          if (m.kind == MessageKind.voice && m.voice != null)
            VoiceMessageBody(message: m, mine: mine, threadId: threadId)
          else if (m.kind == MessageKind.attachment && m.attachment != null)
            AttachmentMessageBody(message: m, mine: mine)
          else
            Text.rich(
              TextSpan(children: spans),
              style: type.body.copyWith(color: fg, height: 1.35),
            ),
          const SizedBox(height: 2),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                f.time(m.createdAt),
                style: type.caption
                    .copyWith(color: fg.withValues(alpha: 0.7), fontSize: 11),
              ),
              if (mine) ...[
                const SizedBox(width: 4),
                Icon(
                  switch (m.delivery) {
                    DeliveryState.sending => Icons.schedule_rounded,
                    DeliveryState.failed => Icons.error_outline_rounded,
                    DeliveryState.sent =>
                      seen ? Icons.done_all_rounded : Icons.done_rounded,
                  },
                  size: 14,
                  color: failed
                      ? colors.danger
                      : seen
                          ? colors.gold
                          : fg.withValues(alpha: 0.7),
                ),
              ],
            ],
          ),
        ],
      ),
    );

    return Padding(
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
                  Icon(Icons.support_agent_rounded,
                      size: 12, color: colors.gold),
                  const SizedBox(width: 3),
                  Text(
                    attorneyName != null
                        ? t.t('assistant.ofAttorney', {'name': attorneyName!})
                        : t.t('assistant.of', {'name': m.sentByAssistant!}),
                    style: type.caption.copyWith(
                      color: colors.textSecondary,
                      fontSize: 11,
                    ),
                  ),
                ],
              ),
            ),
          AppEntrance(
            child: Semantics(
              label: [
                if (m.kind == MessageKind.voice)
                  t.t('chat.voice.label')
                else if (m.kind == MessageKind.attachment)
                  '${t.t('chat.attach.label')}: ${m.attachment?.name ?? ''}'
                else
                  m.body.replaceAll(kContactMask, t.t('chat.masked')),
                if (mine) t.t(_deliveryKey(m.delivery, seen)),
              ].join('. '),
              // Voice bubbles keep their play/speed buttons reachable.
              excludeSemantics: m.kind != MessageKind.voice &&
                  m.kind != MessageKind.attachment,
              child: bubble,
            ),
          ),
          if (showSeenLabel)
            Padding(
              padding: const EdgeInsets.only(top: 2, right: 4),
              child: Text(t.t('chat.seen'),
                  style: type.caption.copyWith(color: colors.textSecondary)),
            ),
          if (failed)
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(t.t('chat.notSent'),
                    style: type.caption.copyWith(color: colors.danger)),
                TextButton(
                  onPressed: () =>
                      ref.read(chatThreadProvider(threadId).notifier).retry(m),
                  child: Text(t.t('error.retry')),
                ),
                TextButton(
                  onPressed: () => ref
                      .read(chatThreadProvider(threadId).notifier)
                      .discard(m),
                  child: Text(t.t('chat.discard')),
                ),
              ],
            ),
        ],
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
    return Consumer(builder: (context, ref, _) {
      final t = ref.watch(translatorProvider);
      return Semantics(
        liveRegion: true,
        label: t.t('chat.typing'),
        child: Container(
          margin: const EdgeInsets.only(
              left: AppSpacing.screenSide, bottom: AppSpacing.xs),
          padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.md, vertical: AppSpacing.sm + 2),
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
                                math.sin(((_c.value - i * 0.18) % 1.0) *
                                    2 *
                                    math.pi),
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
    });
  }
}

class _Banner extends StatelessWidget {
  const _Banner({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.screenSide, vertical: AppSpacing.md),
      color: colors.goldTint,
      child: Row(
        children: [
          Icon(icon, size: AppSizes.iconSm, color: colors.goldDark),
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
          AppSpacing.screenSide, 0, AppSpacing.screenSide, AppSpacing.xs),
      padding: const EdgeInsets.only(left: AppSpacing.md),
      decoration: BoxDecoration(
        color: colors.infoTint,
        borderRadius: BorderRadius.circular(AppRadii.card),
      ),
      child: Row(
        children: [
          Icon(Icons.privacy_tip_outlined,
              size: AppSizes.iconSm, color: colors.info),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Text(t.t('chat.maskingHint'),
                style: type.caption.copyWith(color: colors.text)),
          ),
          AppIconButton(
            icon: Icon(Icons.close_rounded,
                size: 18, color: colors.textSecondary),
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
          padding: const EdgeInsets.fromLTRB(AppSpacing.screenSide,
              AppSpacing.md, AppSpacing.screenSide, AppSpacing.md),
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
            Text(t.t('chat.subscriptionRequired'),
                textAlign: TextAlign.center,
                style: type.body.copyWith(color: colors.text)),
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
    required this.onSend,
    required this.onTyping,
    required this.onVoice,
    this.onAttach,
  });

  /// OQ-047: photos and documents — only once the bid is accepted.
  final VoidCallback? onAttach;

  final TextEditingController controller;
  final VoidCallback onSend;
  final void Function(bool active) onTyping;
  final Future<void> Function(VoiceRecording r) onVoice;

  @override
  ConsumerState<_Composer> createState() => _ComposerState();
}

class _ComposerState extends ConsumerState<_Composer> {
  static const _cancelDx = -110.0;
  static const _lockDy = -80.0;

  bool _recording = false;
  bool _locked = false;

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

  @override
  void dispose() {
    _levelSub?.cancel();
    _tick?.cancel();
    unawaited(() async {
      if (_rec.recording) await _rec.cancel();
      await _rec.dispose();
    }());
    super.dispose();
  }

  Future<void> _start() async {
    final t = ref.read(translatorProvider);
    // One note at a time: stop whatever is playing.
    unawaited(ref.read(voicePlayerProvider.notifier).stop());
    HapticFeedback.mediumImpact();
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
    setState(() {
      _recording = true;
      _locked = false;
      _drag = Offset.zero;
      _elapsed = Duration.zero;
    });
  }

  Future<void> _finish({required bool send}) async {
    if (!_recording) return;
    await _levelSub?.cancel();
    _tick?.cancel();
    setState(() {
      _recording = false;
      _locked = false;
      _drag = Offset.zero;
    });
    if (!send) {
      HapticFeedback.lightImpact();
      await _rec.cancel();
      return;
    }
    final r = await _rec.stop();
    if (!mounted) return;
    if (r == null) {
      showAppSnackBar(
          context, ref.read(translatorProvider).t('chat.voice.hold'));
      return;
    }
    HapticFeedback.lightImpact();
    await widget.onVoice(r);
  }

  void _onMove(PointerMoveEvent e) {
    if (!_recording || _locked) return;
    setState(() => _drag += e.delta);
    if (_drag.dx < _cancelDx) {
      unawaited(_finish(send: false));
    } else if (_drag.dy < _lockDy) {
      HapticFeedback.selectionClick();
      setState(() => _locked = true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final motion = context.reduceMotion ? Duration.zero : AppMotion.stateChange;

    final field = TextField(
      onTapOutside: hideKeyboardOnTapOutside,
      controller: widget.controller,
      minLines: 1,
      maxLines: 5,
      maxLength: kMessageMaxChars,
      buildCounter:
          (_, {required currentLength, required isFocused, maxLength}) => null,
      textCapitalization: TextCapitalization.sentences,
      onChanged: (v) => widget.onTyping(v.isNotEmpty),
      style: type.body.copyWith(color: colors.text),
      decoration: InputDecoration(
        hintText: t.t('chat.hint'),
        filled: true,
        fillColor: colors.bg,
        contentPadding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.md, vertical: AppSpacing.md),
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
    );

    final recordingRow = Container(
      height: AppSizes.touchTarget + 4,
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
      decoration: BoxDecoration(
        color: colors.bg,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: colors.goldStroke),
      ),
      child: Row(
        children: [
          _RecDot(color: colors.danger),
          const SizedBox(width: AppSpacing.sm),
          Text(
            voiceClock(_elapsed),
            style: type.body.copyWith(
              color: colors.text,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: _locked
                ? RecordingMeter(levels: _levels)
                : Opacity(
                    opacity: (1 + _drag.dx / -_cancelDx).clamp(0.2, 1.0),
                    child: Text(
                      '‹ ${t.t('chat.voice.slideCancel')}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      textAlign: TextAlign.center,
                      style:
                          type.bodySmall.copyWith(color: colors.textSecondary),
                    ),
                  ),
          ),
          if (_locked)
            AppIconButton(
              plain: true,
              icon: Icon(Icons.delete_outline_rounded, color: colors.danger),
              semanticLabel: t.t('chat.voice.cancel'),
              onPressed: () => _finish(send: false),
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
              child: Icon(icon, color: on ? colors.navy : colors.textSecondary),
            ),
          ),
        );

    // The composer (send, attach, mic) keeps the keyboard; taps outside
    // it hide the keyboard.
    return TextFieldTapRegion(child: Material(
      color: colors.surface,
      child: SafeArea(
        top: false,
        child: Padding(
          // Owner 2026-09-30: the paperclip and the field sit close to the
          // left edge.
          padding: EdgeInsets.fromLTRB(
              widget.onAttach != null ? AppSpacing.xs : AppSpacing.sm,
              AppSpacing.sm,
              AppSpacing.sm,
              AppSpacing.sm),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              if (widget.onAttach != null && !_recording)
                Padding(
                  padding: EdgeInsets.zero,
                  child: AppIconButton(
                    plain: true,
                    icon:
                        Icon(Icons.attach_file_rounded, color: colors.goldDark),
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
                        icon: Icons.arrow_upward_rounded,
                        on: true,
                        label: t.t('chat.send'),
                      ),
                    );
                  }
                  if (_locked) {
                    return AppPressable(
                      onTap: () => _finish(send: true),
                      child: circle(
                        icon: Icons.arrow_upward_rounded,
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
                            opacity: (0.4 + _drag.dy / _lockDy).clamp(0.4, 1.0),
                            child: Container(
                              padding: const EdgeInsets.all(8),
                              decoration: BoxDecoration(
                                color: colors.surface,
                                borderRadius:
                                    BorderRadius.circular(AppRadii.pill),
                                border: Border.all(color: colors.border),
                              ),
                              child: Icon(Icons.lock_outline_rounded,
                                  size: 18, color: colors.goldDark),
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
                            icon: Icons.mic_rounded,
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
    ));
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
            : Tween(begin: 0.25, end: 1.0).animate(_c),
        child: Container(
          width: 10,
          height: 10,
          decoration:
              BoxDecoration(shape: BoxShape.circle, color: widget.color),
        ),
      );
}
