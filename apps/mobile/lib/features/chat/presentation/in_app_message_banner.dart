import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/physics.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/chat/chat_routes.dart';
import 'package:lawbid/features/chat/data/chat_repository.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/inbox_screen.dart';
import 'package:lawbid/features/notifications/application/notifications_providers.dart';
import 'package:lawbid/features/social/application/social_providers.dart';

/// Owner row 95 (2026-11-13, owner «Конечно»; WhatsApp / Telegram /
/// Instagram DMs): a message that arrives in ANOTHER chat while the app is
/// open shows a banner at the top — the sender's photo, name and the text.
/// A tap opens that chat, a swipe up puts it away, it goes by itself after
/// [InAppMessageBannerLayer.shownFor].
///
/// Never shown: for the chat on screen, for a muted chat, when «Messages»
/// is off in Settings → Notifications, for my own messages, for calls and
/// service lines, while the app is in the background (the system push is
/// there), and for a chat the list in memory does not hold (its mute is not
/// known).
@immutable
class InAppMessage {
  const InAppMessage({required this.conversation, required this.message});

  final Conversation conversation;
  final ChatMessage message;
}

class InAppMessageBannerController extends Notifier<InAppMessage?> {
  @override
  InAppMessage? build() {
    final sub = ref.watch(realtimeEventsProvider).listen(_onEvent);
    ref.onDispose(sub.cancel);
    return null;
  }

  void _onEvent(RealtimeEvent e) {
    if (e.name != 'message:new') return;
    final m = ChatMappers.fromEvent(e.data);
    if (m == null) return;
    final show = shouldShow(m);
    if (show != null) state = InAppMessage(conversation: show, message: m);
  }

  /// The chat to show [m] for, or null when the banner must stay away.
  Conversation? shouldShow(ChatMessage m) {
    final life = WidgetsBinding.instance.lifecycleState;
    final settings = ref.read(notificationSettingsProvider).value;
    final messages = settings?.categories
        // By name: the chat feature reads no other feature's data layer.
        .where((c) => c.category.name == 'messages')
        .firstOrNull;
    Conversation? known;
    if (ref.read(conversationsProvider.exists)) {
      known = ref
          .read(conversationsProvider)
          .value
          ?.items
          .where((c) => c.id == m.conversationId)
          .firstOrNull;
    }
    return inAppBannerChat(
      m,
      me: ref.read(currentUserIdProvider),
      foreground: life == null || life == AppLifecycleState.resumed,
      open: ref.read(chatSyncLedgerProvider).isOpen(m.conversationId),
      messagesOn: messages?.push ?? true,
      known: known,
    );
  }

  void dismiss() => state = null;
}

/// The rules of [InAppMessage] in one place (kept testable on its own).
Conversation? inAppBannerChat(
  ChatMessage m, {
  required String? me,
  required bool foreground,
  required bool open,
  required bool messagesOn,
  required Conversation? known,
}) {
  if (me == null || m.senderId == null || m.senderId == me) return null;
  if (m.kind == MessageKind.call || m.kind == MessageKind.system) return null;
  if (!foreground || open || !messagesOn) return null;
  if (known == null || known.muted) return null;
  return known;
}

final inAppMessageBannerProvider =
    NotifierProvider<InAppMessageBannerController, InAppMessage?>(
  InAppMessageBannerController.new,
);

/// The top banner over every screen (see [InAppMessage]); it slides down
/// from under the status bar on the Material 3 emphasized curves
/// ([AppMotion.topBannerEnter]) and follows the finger when dragged up.
class InAppMessageBannerLayer extends ConsumerStatefulWidget {
  const InAppMessageBannerLayer({required this.router, super.key});

  /// How long a banner stays (iOS banners ≈ 4 s).
  static const Duration shownFor = Duration(seconds: 4);

  final GoRouter router;

  @override
  ConsumerState<InAppMessageBannerLayer> createState() =>
      _InAppMessageBannerLayerState();
}

class _InAppMessageBannerLayerState
    extends ConsumerState<InAppMessageBannerLayer>
    with SingleTickerProviderStateMixin {
  late final AnimationController _slide = AnimationController.unbounded(
    vsync: this,
  );
  Timer? _hide;
  InAppMessage? _shown;
  double _height = 96;

  @override
  void dispose() {
    _hide?.cancel();
    _slide.dispose();
    super.dispose();
  }

  void _arrive(InAppMessage? next) {
    _hide?.cancel();
    if (next == null) {
      _leave();
      return;
    }
    // The route says which chat is open on a desktop pane too.
    final path = widget.router.routerDelegate.currentConfiguration.uri.path;
    if (path == ChatRoutes.conversation(next.conversation.id)) return;
    setState(() => _shown = next);
    if (context.reduceMotion) {
      _slide.value = 1;
    } else {
      unawaited(
        _slide.animateTo(
          1,
          duration: AppMotion.topBannerEnter,
          curve: AppMotion.topBannerEnterCurve,
        ),
      );
    }
    _hide = Timer(InAppMessageBannerLayer.shownFor, _leave);
  }

  Future<void> _leave({double velocity = 0}) async {
    _hide?.cancel();
    if (_shown == null) return;
    if (context.reduceMotion) {
      _slide.value = 0;
    } else if (velocity < 0) {
      // A throw up keeps its speed (the iOS banner flick).
      await _slide.animateWith(
        SpringSimulation(
          AppMotion.snapBackSpring,
          _slide.value,
          0,
          velocity / _height,
        ),
      );
    } else {
      await _slide.animateTo(
        0,
        duration: AppMotion.topBannerExit,
        curve: AppMotion.topBannerExitCurve,
      );
    }
    if (!mounted) return;
    setState(() => _shown = null);
    if (ref.read(inAppMessageBannerProvider) != null) {
      ref.read(inAppMessageBannerProvider.notifier).dismiss();
    }
  }

  void _open(InAppMessage m) {
    unawaited(_leave());
    unawaited(
      widget.router.push<void>(ChatRoutes.conversation(m.conversation.id)),
    );
  }

  void _drag(DragUpdateDetails d) {
    _hide?.cancel();
    final next = _slide.value + d.delta.dy / _height;
    _slide.value = next.clamp(0, 1);
  }

  void _release(DragEndDetails d) {
    final v = d.primaryVelocity ?? 0;
    if (v < -300 || _slide.value < 0.6) {
      unawaited(_leave(velocity: v.clamp(-4000, 0)));
    } else {
      unawaited(
        _slide.animateWith(
          SpringSimulation(AppMotion.snapBackSpring, _slide.value, 1, 0),
        ),
      );
      _hide = Timer(InAppMessageBannerLayer.shownFor, _leave);
    }
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(inAppMessageBannerProvider, (_, next) => _arrive(next));
    final m = _shown;
    if (m == null) return const SizedBox.shrink();
    return Positioned(
      top: 0,
      left: 0,
      right: 0,
      child: AnimatedBuilder(
        animation: _slide,
        builder: (context, child) => FractionalTranslation(
          translation: Offset(0, _slide.value - 1),
          child: child,
        ),
        child: GestureDetector(
          key: const ValueKey('in-app-message-banner'),
          behavior: HitTestBehavior.opaque,
          onTap: () => _open(m),
          onVerticalDragUpdate: _drag,
          onVerticalDragEnd: _release,
          child: _BannerCard(message: m, onSize: (h) => _height = h),
        ),
      ),
    );
  }
}

class _BannerCard extends ConsumerWidget {
  const _BannerCard({required this.message, required this.onSize});

  final InAppMessage message;
  final ValueChanged<double> onSize;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final me = ref.watch(currentUserIdProvider);
    final c = message.conversation;
    final top = MediaQuery.paddingOf(context).top;
    onSize(top + 88);
    return Semantics(
      container: true,
      liveRegion: true,
      button: true,
      label: '${counterpartName(t, c)}: '
          '${messagePreview(t, message.message, me: me)}',
      excludeSemantics: true,
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          AppSpacing.sm,
          top + AppSpacing.xs,
          AppSpacing.sm,
          0,
        ),
        child: Material(
          color: colors.surface,
          elevation: 8,
          shadowColor: colors.shadow,
          borderRadius: BorderRadius.circular(AppRadii.card),
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.md),
            child: Row(
              children: [
                CounterpartAvatar(counterpart: c.counterpart, size: 40),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        counterpartName(t, c),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: type.body.copyWith(
                          color: colors.text,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      Text(
                        messagePreview(t, message.message, me: me),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: type.bodySmall.copyWith(
                          color: colors.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
