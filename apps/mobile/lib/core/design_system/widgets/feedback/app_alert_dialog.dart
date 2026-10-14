import 'package:flutter/material.dart';

/// Owner 2026-10-14: every dialog of the app has its buttons centred, as
/// wide as the dialog and one under another (RTL too) — never pushed to one
/// side. A drop-in for [AlertDialog]: the same title / content / icon, the
/// [actions] are laid out by this widget.
class AppAlertDialog extends StatelessWidget {
  const AppAlertDialog({
    this.icon,
    this.title,
    this.content,
    this.actions = const [],
    this.backgroundColor,
    this.scrollable = false,
    super.key,
  });

  final Widget? icon;
  final Widget? title;
  final Widget? content;
  final List<Widget> actions;
  final Color? backgroundColor;
  final bool scrollable;

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      backgroundColor: backgroundColor,
      icon: icon,
      title: title,
      content: content,
      scrollable: scrollable,
      actionsPadding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
      actions: actions.isEmpty
          ? null
          : [
              SizedBox(
                width: double.infinity,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    for (final (i, a) in actions.indexed) ...[
                      if (i > 0) const SizedBox(height: 8),
                      SizedBox(width: double.infinity, child: a),
                    ],
                  ],
                ),
              ),
            ],
    );
  }
}
