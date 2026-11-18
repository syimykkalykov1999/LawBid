import 'package:cupertino_interactive_keyboard/cupertino_interactive_keyboard.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';

/// Row 191 (Messages / WhatsApp / Telegram on iPhone): the keyboard follows
/// the finger that drags the chat down and goes away (or comes back) where
/// the finger lets go. UIKit's own interactive dismissal, through the
/// `cupertino_interactive_keyboard` plugin (MIT); on Android and the
/// website the chat stays as it was (dragging hides the keyboard).
bool get interactiveKeyboard =>
    !kIsWeb && defaultTargetPlatform == TargetPlatform.iOS;

/// How a chat's list treats the keyboard while dragged: on iPhone UIKit
/// moves it with the finger, elsewhere a drag hides it.
ScrollViewKeyboardDismissBehavior get chatKeyboardDismiss => interactiveKeyboard
    ? ScrollViewKeyboardDismissBehavior.manual
    : ScrollViewKeyboardDismissBehavior.onDrag;

/// The area (the message list) where a drag moves the keyboard.
class ChatKeyboardDragArea extends StatelessWidget {
  const ChatKeyboardDragArea({required this.child, super.key});

  final Widget child;

  @override
  Widget build(BuildContext context) =>
      interactiveKeyboard ? CupertinoInteractiveKeyboard(child: child) : child;
}

/// The input bar that rides on top of the keyboard while it is dragged.
class ChatKeyboardAccessory extends StatelessWidget {
  const ChatKeyboardAccessory({required this.child, super.key});

  final Widget child;

  @override
  Widget build(BuildContext context) =>
      interactiveKeyboard ? CupertinoInputAccessory(child: child) : child;
}
