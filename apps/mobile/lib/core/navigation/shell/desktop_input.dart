import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lawbid/core/navigation/shell/shell_layout.dart';

/// Desktop web plan 2026-10-28 §7: on a desktop window every list shows a
/// scroll bar (also when the browser says «iPad» or «Android» for a large
/// window with a mouse); lists are moved by the wheel and the bar, never
/// by dragging with the mouse. Narrower windows keep Flutter's default, so
/// phones and tablets scroll exactly as before. Set on the app only when
/// the adaptive web layout is on.
class AppScrollBehavior extends MaterialScrollBehavior {
  const AppScrollBehavior();

  @override
  Widget buildScrollbar(
    BuildContext context,
    Widget child,
    ScrollableDetails details,
  ) {
    if (!isDesktopWindow(context)) {
      return super.buildScrollbar(context, child, details);
    }
    return Scrollbar(controller: details.controller, child: child);
  }
}

/// What a screen does with the desktop keys while it is the top page.
/// Each callback may be null (the key then does what it does elsewhere).
class DesktopKeyBindings extends StatefulWidget {
  const DesktopKeyBindings({
    required this.child,
    this.onSearch,
    this.onEscape,
    this.onStep,
    super.key,
  });

  final Widget child;

  /// Ctrl/⌘+K: this screen's own search (default: the Search tab).
  final VoidCallback? onSearch;

  /// Esc: true when it closed something (false lets the key go on).
  final bool Function()? onEscape;

  /// Alt+↑ (-1) / Alt+↓ (+1): the previous / next item (chat).
  final void Function(int delta)? onStep;

  @override
  State<DesktopKeyBindings> createState() => DesktopKeyBindingsState();
}

class DesktopKeyBindingsState extends State<DesktopKeyBindings> {
  static final List<DesktopKeyBindingsState> _live = [];

  @override
  void initState() {
    super.initState();
    _live.add(this);
  }

  @override
  void dispose() {
    _live.remove(this);
    super.dispose();
  }

  /// Only the page on top answers (a chat under a dialog or under another
  /// page keeps quiet).
  bool get _onTop => mounted && (ModalRoute.of(context)?.isCurrent ?? true);

  @override
  Widget build(BuildContext context) => widget.child;
}

/// The binding of the screen on top, newest first.
DesktopKeyBindings? _topBinding(bool Function(DesktopKeyBindings b) has) {
  for (final s in DesktopKeyBindingsState._live.reversed) {
    if (s._onTop && has(s.widget)) return s.widget;
  }
  return null;
}

/// Desktop web plan §7 «DesktopShortcuts»: the app-wide keys of a desktop
/// window — Ctrl/⌘+K search, Esc, Alt+↑/↓. Keys go to the field or dialog
/// that has the focus first (a dialog closes on Esc by itself); what they
/// leave comes here. Off on phones, tablets and in the app: [child] is
/// returned as it is.
class DesktopShortcuts extends StatelessWidget {
  const DesktopShortcuts({
    required this.child,
    required this.onSearch,
    super.key,
  });

  final Widget child;

  /// Ctrl/⌘+K when the screen on top has no search of its own.
  final VoidCallback onSearch;

  KeyEventResult _onKey(BuildContext context, KeyEvent e) {
    if (e is KeyUpEvent || !isDesktopWindow(context)) {
      return KeyEventResult.ignored;
    }
    final keys = HardwareKeyboard.instance;
    final key = e.logicalKey;
    if (key == LogicalKeyboardKey.keyK &&
        (keys.isControlPressed || keys.isMetaPressed) &&
        !keys.isAltPressed &&
        !keys.isShiftPressed) {
      if (e is KeyRepeatEvent) return KeyEventResult.handled;
      (_topBinding((b) => b.onSearch != null)?.onSearch ?? onSearch)();
      return KeyEventResult.handled;
    }
    if (key == LogicalKeyboardKey.escape && e is KeyDownEvent) {
      final b = _topBinding((b) => b.onEscape != null);
      return b != null && b.onEscape!()
          ? KeyEventResult.handled
          : KeyEventResult.ignored;
    }
    if (keys.isAltPressed &&
        !keys.isControlPressed &&
        !keys.isMetaPressed &&
        (key == LogicalKeyboardKey.arrowUp ||
            key == LogicalKeyboardKey.arrowDown)) {
      final b = _topBinding((b) => b.onStep != null);
      if (b == null) return KeyEventResult.ignored;
      b.onStep!(key == LogicalKeyboardKey.arrowUp ? -1 : 1);
      return KeyEventResult.handled;
    }
    return KeyEventResult.ignored;
  }

  @override
  Widget build(BuildContext context) {
    if (!adaptiveShellOn) return child;
    // Measured once here, from the window: the widgets below rebuild when
    // the window crosses a threshold, not on every pixel of a resize.
    final width = MediaQuery.sizeOf(context).width;
    return WindowClassScope(
      windowClass: windowClassFor(width),
      child: Focus(
        canRequestFocus: false,
        skipTraversal: true,
        onKeyEvent: (_, e) => _onKey(context, e),
        child: child,
      ),
    );
  }
}

/// Desktop web plan §6.3: in a message field on a desktop window Enter
/// sends, Shift+Enter starts a new line (the field's own behaviour), Esc
/// asks [onEscape] (close the reply / edit bar). While an input method is
/// still composing a word, Enter is the input method's. On phones and
/// tablets [child] is returned as it is.
class DesktopSendOnEnter extends StatelessWidget {
  const DesktopSendOnEnter({
    required this.child,
    required this.onSend,
    this.controller,
    this.onEscape,
    super.key,
  });

  final Widget child;
  final VoidCallback onSend;
  final TextEditingController? controller;

  /// True when it closed something.
  final bool Function()? onEscape;

  @override
  Widget build(BuildContext context) {
    if (!isDesktopWindow(context)) return child;
    return Focus(
      canRequestFocus: false,
      skipTraversal: true,
      onKeyEvent: (_, e) {
        if (e is! KeyDownEvent) return KeyEventResult.ignored;
        final keys = HardwareKeyboard.instance;
        final key = e.logicalKey;
        if (key == LogicalKeyboardKey.enter ||
            key == LogicalKeyboardKey.numpadEnter) {
          if (keys.isShiftPressed ||
              keys.isAltPressed ||
              keys.isControlPressed ||
              keys.isMetaPressed ||
              (controller?.value.composing.isValid ?? false)) {
            return KeyEventResult.ignored;
          }
          onSend();
          return KeyEventResult.handled;
        }
        if (key == LogicalKeyboardKey.escape) {
          return onEscape?.call() ?? false
              ? KeyEventResult.handled
              : KeyEventResult.ignored;
        }
        return KeyEventResult.ignored;
      },
      child: child,
    );
  }
}
