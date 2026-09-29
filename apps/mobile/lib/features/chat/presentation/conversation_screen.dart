import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/inbox_screen.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/widgets/post_sheets.dart';
import 'package:lawbid/shared/domain/user_role.dart';

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
    ref.listen(chatThreadProvider(widget.conversationId).select((x) => x.messages.firstOrNull?.id),
        (_, __) => _markRead());
    final attorney = ref.watch(currentUserRoleProvider) == UserRole.attorney;
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
          if (c != null)
            AppIconButton(
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
                    Expanded(child: _MessageList(state: s, onMore: _thread.loadMore)),
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
                    if (c != null && !c.closed)
                      ValueListenableBuilder<bool>(
                        valueListenable: subscriptionGate,
                        builder: (context, gated, _) => gated && attorney
                            ? _SubscriptionGate(t: t)
                            : Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  if (!c.contactsUnlocked) const _MaskingHint(),
                                  _Composer(
                                    controller: _text,
                                    onSend: _send,
                                    onTyping: _thread.typing,
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
    final attorney = ref.watch(currentUserRoleProvider) == UserRole.attorney;
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
          } else if (c.counterpart.isAttorney && c.counterpart.username != null) {
            context.push(AppRoutes.lawyer(c.counterpart.username!));
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
          onMore();
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
            !DateUtils.isSameDay(older.createdAt.toLocal(), m.createdAt.toLocal());
        final seen = seenIndex >= 0 && i >= seenIndex && m.senderId == me;
        return Column(
          children: [
            if (newDay) _DaySeparator(label: _dayLabel(t, f, m.createdAt)),
            if (m.kind == MessageKind.system)
              _SystemMessage(text: t.t('chat.system.${m.body}'))
            else
              _Bubble(
                message: m,
                mine: m.senderId == me,
                seen: seen,
                showSeenLabel: m.id == newestOwnSeen,
                threadId: state.conversation?.id ?? m.conversationId,
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
  });

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
            backgroundColor: (mine ? colors.gold : colors.goldTint)
                .withValues(alpha: 0.35),
          ),
        ));
      }
    }

    final bubble = Container(
      constraints: BoxConstraints(
          maxWidth: MediaQuery.sizeOf(context).width * 0.78),
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
                style: type.caption.copyWith(
                    color: fg.withValues(alpha: 0.7), fontSize: 11),
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
          AppEntrance(
            child: Semantics(
              label: [
                m.body.replaceAll(kContactMask, t.t('chat.masked')),
                if (mine) t.t(_deliveryKey(m.delivery, seen)),
              ].join('. '),
              excludeSemantics: true,
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
                  onPressed: () => ref
                      .read(chatThreadProvider(threadId).notifier)
                      .retry(m),
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
            child: Text(text,
                style: type.bodySmall.copyWith(color: colors.text)),
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
            icon: Icon(Icons.close_rounded, size: 18, color: colors.textSecondary),
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
              onPressed: () => context.push(AppRoutes.subscriptionRequired),
            ),
          ],
        ),
      ),
    );
  }
}

class _Composer extends ConsumerWidget {
  const _Composer({
    required this.controller,
    required this.onSend,
    required this.onTyping,
  });

  final TextEditingController controller;
  final VoidCallback onSend;
  final void Function(bool active) onTyping;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Material(
      color: colors.surface,
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(
              AppSpacing.screenSide, AppSpacing.sm, AppSpacing.sm, AppSpacing.sm),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: TextField(
                  controller: controller,
                  minLines: 1,
                  maxLines: 5,
                  maxLength: kMessageMaxChars,
                  buildCounter: (_,
                          {required currentLength,
                          required isFocused,
                          maxLength}) =>
                      null,
                  textCapitalization: TextCapitalization.sentences,
                  onChanged: (v) => onTyping(v.isNotEmpty),
                  style: type.body.copyWith(color: colors.text),
                  decoration: InputDecoration(
                    hintText: t.t('chat.hint'),
                    filled: true,
                    fillColor: colors.bg,
                    contentPadding: const EdgeInsets.symmetric(
                        horizontal: AppSpacing.lg, vertical: AppSpacing.md),
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
              ),
              const SizedBox(width: AppSpacing.xs),
              ValueListenableBuilder<TextEditingValue>(
                valueListenable: controller,
                builder: (context, v, _) {
                  final enabled = v.text.trim().isNotEmpty;
                  return AnimatedScale(
                    scale: enabled ? 1 : 0.86,
                    duration: context.reduceMotion
                        ? Duration.zero
                        : AppMotion.stateChange,
                    curve: Curves.easeOutBack,
                    child: Semantics(
                      button: true,
                      enabled: enabled,
                      label: t.t('chat.send'),
                      excludeSemantics: true,
                      child: AppPressable(
                        onTap: enabled ? onSend : () {},
                        child: AnimatedContainer(
                          duration: context.reduceMotion
                              ? Duration.zero
                              : AppMotion.stateChange,
                          width: AppSizes.touchTarget + 4,
                          height: AppSizes.touchTarget + 4,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: enabled ? colors.gold : colors.border,
                          ),
                          child: Icon(Icons.arrow_upward_rounded,
                              color: enabled ? colors.navy : colors.textSecondary),
                        ),
                      ),
                    ),
                  );
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}
