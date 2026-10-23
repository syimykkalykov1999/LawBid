# Gestures: back, tabs, row actions

Owner 2026-10-22 (compared with Instagram on iPhone). One rule set for all
roles, phone and web. Code: `apps/mobile/lib/core/navigation/back_swipe.dart`,
`system_back.dart`, `app_page_transitions.dart`.

## What the big apps do (research)

| | iOS | Android |
|---|---|---|
| Instagram | back = swipe from anywhere on a pushed screen (full-screen interactive pop); carousels, tabs and the story rail win over it; photo viewer closes by a swipe down | system back = previous screen; on a tab other than Home it goes Home; on Home it leaves |
| Telegram | back = swipe from the left edge (and from the middle on most lists); chat rows swipe from their own edges | system back = previous screen / closes search / selection first |
| WhatsApp | edge swipe back; chat rows swipe | system back = previous screen; on the chat list it leaves |
| Flutter default | `CupertinoPageRoute`: edge only (20 dp) | Android 14+ predictive back needs the manifest flag; the app does not use it (see below) |

## Rule 1 - Back by swipe (touch only)

Every pushed screen (go_router page or `Navigator.push`) goes back by:

1. a swipe from the left edge (right edge in RTL), 24 dp, always;
2. a rightward swipe that starts **anywhere else, if no widget below it wants
   the horizontal drag**. A carousel, a tab page view, a slider or a row with
   side actions claims the drag first in the gesture arena (the back drag is
   an *ancestor* of the screen, so it is asked last). A mostly vertical move
   is a scroll, not a back.

Wired once: the theme's page transitions are `AppBackSwipeTransitionsBuilder`
(put over the Navigator by `BackSwipeTheme` in `app.dart`); go_router pages
are `MaterialPage`s, so they use it too. Package:
**`swipeable_page_route`** (edge strip, Cupertino transition, 2026-01, Flutter
>= 3.35); `cupertino_back_gesture` is Dart 2 only. The full-width drag is
ours (a copy of Flutter's private pop controller), because the package's own
full-width mode sits **on top** of the screen and would beat carousels.

A screen can choose with `BackSwipe(mode: ...)`:

| mode | edge strip | drag from anywhere | use |
|---|---|---|---|
| `full` (default) | yes | yes | almost everything |
| `rows` | no | yes | lists whose rows have side actions on their own edges (chats, groups, channels) |
| `edge` | yes | no | a screen whose middle must never go back |
| `off` | no | no | must be left by its own buttons |

Screens with their own horizontal pages (`SwipePages`, `ProfileTabPages`,
`BackAwarePages`) hand the **first page's rightward drag** to back; the
other pages swipe as before. Under "reduce motion" the theme's still
transitions stay (no slide, no swipe). On the web a mouse or a trackpad
never goes back (the browser's back button does).

## Rule 2 - Rows with side actions

`EdgeSwipe` rows (chat, group, task rows): the row's action starts only in
the 32 dp zone at each side of the row. A drag that starts in the middle of
the row is not the row's: it is the page view's (sections) or, on a pushed
screen, "back". On pushed screens that hold such rows the route uses
`BackSwipeMode.rows` (no edge strip, so the row's left zone is not taken by
back); the inbox, groups and channels routes do. The two never fight:
different start zones, and the arena order above.

## Rule 2b - Quoting a message (chat)

Telegram: a message is quoted by dragging it toward the START side
(left in LTR) past 56 dp. WhatsApp does the opposite direction, but that
is the direction of "back" here, so we use Telegram's: the reply drag
(`SwipeToReply`, `features/chat/presentation/reply_swipe.dart`) uses a
recogniser that REFUSES a pointer that first moves toward the end, so the
screen's back drag (an ancestor) takes it and a swipe back from the middle
of a chat works even when the finger lands on a bubble. A mostly vertical
move scrolls. The bubble follows the finger with growing resistance, a
reply arrow appears behind it and a haptic ticks at the threshold. RTL is
mirrored. Test: `test/features/chat/reply_swipe_test.dart`.

## Rule 3 - Tabs swipe

Every tabbed screen allows a swipe between its tabs: `PillTabs` +
`SwipePages` (nested ones hand the finger over at their ends: Groups |
Channels inside Mine · Following · Discover; Waiting | Invitations inside
Bids), `ProfileTabPages` (profiles, case screens), a `PageView` with
`BackAwarePages` (contacts, Q&A). A new tab row without pages is a bug.

## Rule 4 - System back (Android key, gesture, gesture bar)

All of them reach Dart as `popRoute`. `SystemBackGuard` (`system_back.dart`)
runs after the router:

1. the router closes the top page or dialog (a screen's `PopScope` is asked);
2. else on Search / Mine / Profile, or on a signed-in screen that stands
   alone after a `context.go` (the chat list): to the first tab (Feed);
3. else on the first tab: a hint "press back again to exit"; the second
   press within 2 s leaves the app;
4. sign-in and onboarding: the platform's default.

It also keeps telling the engine that Dart handles back (nested navigators
used to report `canHandlePop: false` late and Android closed the app
without asking). Rule for code: open a screen with `push`/`pushOnce`; use
`go` only to move between tab roots or after sign-in/out.

Android 14+ predictive back is **not** enabled
(`enableOnBackInvokedCallback` stays off): the in-app swipe already shows
the slide, and the system preview would replace the guard's decisions. Turn
it on only together with a device test.

## Tests

`test/core/navigation/back_swipe_test.dart` (middle swipe on a vertical list,
a settings list, a screen with a carousel, tabs, mouse, chat row edge,
`edge` mode), `system_back_test.dart` (profile feed, post, settings pages,
tabs, chat list, double press).
