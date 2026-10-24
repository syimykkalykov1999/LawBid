import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/design_system.dart';

/// Owner 2026-10-24: the menus, pickers and filters of «Мои» (Дела, Задачи,
/// Вопросы) keep their size and place — the sheet wraps its rows (at most
/// 70% of the screen, a long list scrolls) — and get a little more room
/// under the last row so it is not squeezed at the bottom.
class RaisedSheetBody extends StatelessWidget {
  const RaisedSheetBody({
    required this.children,
    this.title,
    this.header,
    this.handle = false,
    super.key,
  });

  /// The rows (or any widgets) of the sheet.
  final List<Widget> children;

  /// A bold title above the rows.
  final String? title;

  /// A custom block under the title (e.g. an address the menu is about).
  final Widget? header;

  /// Whether the sheet shows a drag handle (as the menu always did).
  final bool handle;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.sizeOf(context).height * 0.7,
        ),
        child: ListView(
          shrinkWrap: true,
          padding: const EdgeInsets.only(bottom: AppSpacing.xl),
          children: [
            if (handle) const AppSheetHandle(),
            if (title != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.screenSide,
                  0,
                  AppSpacing.screenSide,
                  AppSpacing.sm,
                ),
                child: Text(
                  title!,
                  style: typography.titleMedium.copyWith(color: colors.text),
                ),
              ),
            if (header != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.screenSide,
                  0,
                  AppSpacing.screenSide,
                  AppSpacing.sm,
                ),
                child: header,
              ),
            ...children,
          ],
        ),
      ),
    );
  }
}

/// Opens a [RaisedSheetBody] with the rows [rows] builds; whatever a row
/// pops is the result.
Future<T?> showRaisedSheet<T>(
  BuildContext context, {
  required List<Widget> Function(BuildContext sheet) rows,
  String? title,
  Widget? header,
  bool handle = false,
}) =>
    showAppBottomSheet<T>(
      context: context,
      isScrollControlled: true,
      builder: (sheet) => RaisedSheetBody(
        title: title,
        header: header,
        handle: handle,
        children: rows(sheet),
      ),
    );
