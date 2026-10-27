import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/widgets/bars/app_bottom_nav.dart';
import 'package:lawbid/core/design_system/widgets/bars/app_side_nav.dart';
import 'package:lawbid/core/design_system/widgets/motion/app_entrance.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/core/navigation/route_observer.dart';
import 'package:lawbid/core/navigation/shell/bottom_nav_config.dart';
import 'package:lawbid/core/navigation/shell/shell_layout.dart';
import 'package:lawbid/core/navigation/shell/tab_reselect.dart';
import 'package:lawbid/core/navigation/shell/web_page_frame.dart';
import 'package:lawbid/core/session/guest_mode.dart';
import 'package:lawbid/core/session/proactive_refresh_provider.dart';
import 'package:lawbid/core/startup/startup_idle_queue.dart';
import 'package:lawbid/features/auth/presentation/widgets/passkey_nudge_sheet.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/chat/application/voice_player.dart';
import 'package:lawbid/features/chat/chat_routes.dart';
import 'package:lawbid/features/chat/presentation/voice_widgets.dart';
import 'package:lawbid/features/contacts_sync/application/contacts_background_sync.dart';
import 'package:lawbid/features/create/presentation/create_sheet.dart';
import 'package:lawbid/features/demo/presentation/demo_banner.dart';
import 'package:lawbid/features/notifications/application/notifications_providers.dart';
import 'package:lawbid/features/notifications/application/push_service.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/reels/application/reels_providers.dart';
import 'package:lawbid/features/referrals/application/install_referrer.dart';
import 'package:lawbid/shared/presentation/guest_gate.dart';

/// Shell scaffold for the 4 `StatefulShellRoute.indexedStack` branches
/// (Лента/Поиск/Моё/Профиль), hosting [AppBottomNav]. The "+" tab is not a
/// branch — tapping it pushes [AppRoutes.create] on the root navigator (file
/// 07 §3.4) rather than switching the indexed stack.
///
/// `StatefulShellRoute.indexedStack` (not plain `ShellRoute`) preserves each
/// tab's own Navigator/scroll state when switching — see the stage 1.5
/// architecture review in docs/CHANGELOG.md for why this variant was chosen
/// over the ТЗ's literal "ShellRoute" wording.
class MainShell extends ConsumerStatefulWidget {
  const MainShell({required this.navigationShell, super.key});

  final StatefulNavigationShell navigationShell;

  @override
  ConsumerState<MainShell> createState() => _MainShellState();
}

class _MainShellState extends ConsumerState<MainShell> {
  StatefulNavigationShell get navigationShell => widget.navigationShell;

  // The tabs' content, walked by [scrollToTopAndRefresh] on a re-tap.
  final _bodyKey = GlobalKey();
  bool _reselecting = false;

  /// Owner 2026-10-22: the feed's pages run on into Chats; the bottom bar
  /// slides down with them (0 = shown, 1 = gone), as a pushed Chats had it.
  final _navAway = ValueNotifier<double>(0);

  @override
  void dispose() {
    _navAway.dispose();
    super.dispose();
  }

  void _onTabSelected(int index) {
    // Owner 2026-10-22 (guest browsing): Mine and Profile need an account;
    // the guest comes back to the tab they were on after signing in.
    if (index >= 2 && !requireSignIn(context, ref)) return;
    final reselect = index == navigationShell.currentIndex;
    // Owner 2026-10-19: switching tabs drops the keyboard of the tab left.
    dropKeyboard();
    navigationShell.goBranch(index, initialLocation: reselect);
    if (reselect) unawaited(_scrollToTopAndRefresh());
  }

  /// «+»: a guest signs in first (owner 2026-10-22, guest browsing).
  void _create(BuildContext context) {
    if (!requireSignIn(context, ref)) return;
    unawaited(showCreateSheet(context, ref));
  }

  /// Owner 2026-10-06 (Instagram-style): a tap on the tab already open
  /// scrolls it to the top and refreshes it; repeat taps while that runs
  /// are ignored.
  Future<void> _scrollToTopAndRefresh() async {
    final body = _bodyKey.currentContext;
    if (_reselecting || body == null) return;
    _reselecting = true;
    try {
      await scrollToTopAndRefresh(body, reduceMotion: context.reduceMotion);
    } finally {
      _reselecting = false;
    }
  }

  @override
  void initState() {
    super.initState();
    // Owner 2026-09-30 (reverses the 2026-09-29 decision): the system
    // status bar (clock, network, battery) stays visible in-app too.
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    // docs/ops/demo-world.md: the shell is only reachable fully onboarded —
    // apply a pending install-referrer code / ask for one, once.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || ref.read(isGuestProvider)) return;
      unawaited(ref.read(referralOnboardingHookProvider).run(context));
      // Owner 2026-10-20: contacts re-sync at start and daily (if allowed).
      // S16-3: after the first content, at idle — the phone-book read and
      // hashing no longer share the frames of the first feed paint.
      StartupIdleQueue.enqueue(() {
        if (mounted) ref.read(contactsBackgroundSyncProvider).start();
      });
      // Owner 2026-10-24: attorneys / assistants without a passkey are
      // offered Face ID / fingerprint once (snoozable).
      unawaited(maybeShowPasskeyNudge(context, ref));
    });
  }

  @override
  Widget build(BuildContext context) {
    final role = ref.watch(currentUserRoleProvider);
    final translator = ref.watch(translatorProvider);
    final tabs = tabsForRole(role, translator);
    // Owner 2026-10-22 (guest browsing): no socket, badges or pushes
    // without an account; a «Sign in» strip above the tab bar instead.
    final guest = ref.watch(isGuestProvider);
    // docs/05 §8.5 / §9.5 / §10: while the signed-in app is on screen keep
    // the realtime socket, the offline outbox, the badges and push alive.
    // listen (not watch): a badge tick must not rebuild the shell.
    if (!guest) {
      ref
        ..listen(realtimeClientProvider, (_, __) {})
        ..listen(proactiveRefresherProvider, (_, __) {})
        ..listen(badgesProvider, (_, __) {})
        ..listen(sessionServicesProvider, (_, __) {});
    }

    final miniPlayer = ref.watch(
      voicePlayerProvider.select(
        (p) => p.messageId != null && p.messageId != kVoiceDraftId,
      ),
    );
    // Owner 2026-10-15 (web): on a wide window the bar moves to the side.
    final layout = shellLayoutFor(MediaQuery.sizeOf(context).width);
    final side = layout != ShellLayout.bottom;
    final body = InsideMainShell(
      navAway: _navAway,
      child: DemoBannerHost(
        child: Column(
          children: [
            // WhatsApp: a voice note keeps playing after the chat is left.
            VoiceMiniPlayer(
              onOpen: (id) => context.push(ChatRoutes.conversation(id)),
            ),
            Expanded(
              // The strip took the status bar's room; the screens below
              // must not leave it a second time.
              child: StatusBarTaken(
                taken: miniPlayer,
                // Owner 2026-10-18 (speed): tabs switch instantly — the
                // whole-body fade drew the tab into an extra layer.
                child: KeyedSubtree(key: _bodyKey, child: navigationShell),
              ),
            ),
          ],
        ),
      ),
    );
    return Scaffold(
      // Owner 2026-10-12: on the feed the posts run under the floating
      // nav bar (Instagram); other tabs keep their own space.
      extendBody: !side &&
          (navigationShell.currentIndex == 0 ||
              ref.watch(reelPlayersOpenProvider) > 0),
      // Owner 2026-10-15: every tab screen has its own Scaffold that already
      // makes room for the keyboard; this one must not shrink the body as
      // well (the screens inside were squeezed by the keyboard's height
      // twice and overflowed).
      resizeToAvoidBottomInset: false,
      // docs/ops/demo-world.md: floating «Демо-режим» banner over the tabs
      // while in a demo session (a no-op wrapper otherwise).
      body: side
          ? Row(
              children: [
                AppSideNav(
                  tabs: tabs,
                  currentIndex: navigationShell.currentIndex,
                  onTabSelected: _onTabSelected,
                  onCreatePressed: () => _create(context),
                  extended: layout == ShellLayout.extendedRail,
                  createLabel: translator.t('nav.create'),
                ),
                Expanded(
                  child: ContentColumn(
                    maxWidth: layout == ShellLayout.extendedRail
                        ? kShellContentMaxWidth
                        : null,
                    child: body,
                  ),
                ),
              ],
            )
          : body,
      bottomNavigationBar: side
          ? null
          : ValueListenableBuilder<double>(
              valueListenable: _navAway,
              builder: (context, away, nav) {
                // Only the feed tab runs into Chats.
                final a = navigationShell.currentIndex == 0 ? away : 0.0;
                if (a >= 1) return const SizedBox.shrink();
                if (a <= 0) return nav!;
                return FractionalTranslation(
                  translation: Offset(0, a),
                  child: nav,
                );
              },
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (guest) const GuestSignInBar(),
                  AppBottomNav(
                    tabs: tabs,
                    currentIndex: navigationShell.currentIndex,
                    onTabSelected: _onTabSelected,
                    onCreatePressed: () => _create(context),
                    createSemanticLabel: translator.t('nav.create'),
                  ),
                ],
              ),
            ),
    );
  }
}

/// A strip above [child] already covers the status bar: the screens below
/// must not leave its room a second time. Both `padding` and `viewPadding`
/// lose their top (screens read either), so the strip moves the content by
/// exactly its own height.
class StatusBarTaken extends StatelessWidget {
  const StatusBarTaken({required this.taken, required this.child, super.key});

  final bool taken;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    if (!taken) return child;
    final media = MediaQuery.of(context);
    return MediaQuery(
      data: media.copyWith(
        padding: media.padding.copyWith(top: 0),
        viewPadding: media.viewPadding.copyWith(top: 0),
      ),
      child: child,
    );
  }
}
