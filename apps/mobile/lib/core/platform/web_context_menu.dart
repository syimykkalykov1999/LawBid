import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';

/// Owner row 113 (2026-11-14, like Telegram Web and WhatsApp Web): on the
/// website a right-click on a message, a post or a chat row opens the same
/// menu a long press opens on the phone, and the text of messages and posts
/// can be selected with the mouse and copied (Ctrl/Cmd+C).
///
/// Built from Flutter's own pieces only: `onSecondaryTap`, [SelectionArea]
/// and [BrowserContextMenu] (the browser's menu is switched off only while
/// the mouse is over such a widget, so fields elsewhere keep it). On phones
/// nothing changes: the widgets return their child.

/// Tests switch the website branch on (kIsWeb is false under flutter test).
@visibleForTesting
bool? debugWebContextMenuOverride;

bool get _onWeb => debugWebContextMenuOverride ?? kIsWeb;

/// How many [WebRightClickMenu]s the mouse is over (they nest: a bubble in
/// a list row); the browser's own menu is off while it is above zero.
int _hovered = 0;

void _enter() {
  if (_hovered++ == 0 && kIsWeb) {
    unawaited(BrowserContextMenu.disableContextMenu());
  }
}

void _exit() {
  if (_hovered == 0) return;
  if (--_hovered == 0 && kIsWeb) {
    unawaited(BrowserContextMenu.enableContextMenu());
  }
}

/// A right-click on [child] calls [onMenu] (the long-press menu). Null:
/// [child] as it is.
class WebRightClickMenu extends StatefulWidget {
  const WebRightClickMenu({
    required this.onMenu,
    required this.child,
    super.key,
  });

  final VoidCallback? onMenu;
  final Widget child;

  /// The nearest menu above [context], for a [WebSelectableText] inside.
  static VoidCallback? maybeOf(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<_WebMenuScope>()?.onMenu;

  @override
  State<WebRightClickMenu> createState() => _WebRightClickMenuState();
}

class _WebRightClickMenuState extends State<WebRightClickMenu> {
  bool _inside = false;

  void _setInside(bool inside) {
    if (_inside == inside) return;
    _inside = inside;
    inside ? _enter() : _exit();
  }

  @override
  void dispose() {
    _setInside(false);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final onMenu = widget.onMenu;
    if (!_onWeb || onMenu == null) {
      _setInside(false);
      return widget.child;
    }
    return _WebMenuScope(
      onMenu: onMenu,
      child: MouseRegion(
        onEnter: (_) => _setInside(true),
        onExit: (_) => _setInside(false),
        child: GestureDetector(
          onSecondaryTap: onMenu,
          child: widget.child,
        ),
      ),
    );
  }
}

class _WebMenuScope extends InheritedWidget {
  const _WebMenuScope({required this.onMenu, required super.child});

  final VoidCallback onMenu;

  @override
  bool updateShouldNotify(_WebMenuScope oldWidget) =>
      oldWidget.onMenu != onMenu;
}

/// On the website the text in [child] can be selected with the mouse
/// ([SelectionArea]); a right-click on it opens the menu of the nearest
/// [WebRightClickMenu] (Telegram Web keeps the selection and shows its
/// menu). Phones: [child] as it is.
class WebSelectableText extends StatelessWidget {
  const WebSelectableText({required this.child, super.key});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    if (!_onWeb) return child;
    final onMenu = WebRightClickMenu.maybeOf(context);
    return SelectionArea(
      contextMenuBuilder: (context, state) {
        if (onMenu != null) {
          scheduleMicrotask(() {
            state.hideToolbar();
            onMenu();
          });
        }
        return const SizedBox.shrink();
      },
      child: child,
    );
  }
}
