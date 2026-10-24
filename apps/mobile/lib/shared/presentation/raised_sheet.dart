import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/design_system.dart';

/// Owner 2026-10-24: every menu, picker and filter of «Мои» (Дела, Задачи,
/// Вопросы) is one comfortable raised sheet, like the iOS Reminders or Notes
/// ones: a drag handle, a roomy title, rows under it. It wraps its content
/// (never a giant sheet), is at least [minFraction] and at most
/// [maxFraction] of the screen tall, and a long list scrolls under the title.
class RaisedSheetBody extends StatelessWidget {
  const RaisedSheetBody({
    required this.children,
    this.title,
    this.header,
    this.minFraction = 0.3,
    this.maxFraction = 0.6,
    super.key,
  });

  /// The rows (or any widgets) of the sheet.
  final List<Widget> children;

  /// A bold title under the handle.
  final String? title;

  /// A custom block under the title (e.g. an address the menu is about).
  final Widget? header;

  final double minFraction;
  final double maxFraction;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final height = MediaQuery.sizeOf(context).height;
    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(
          minHeight: height * minFraction,
          maxHeight: height * maxFraction,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const AppSheetHandle(),
            if (title != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.screenSide,
                  AppSpacing.xs,
                  AppSpacing.screenSide,
                  AppSpacing.md,
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
                  AppSpacing.md,
                ),
                child: header,
              ),
            Flexible(
              child: ListView(
                shrinkWrap: true,
                padding: const EdgeInsets.only(bottom: AppSpacing.md),
                children: children,
              ),
            ),
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
}) =>
    showAppBottomSheet<T>(
      context: context,
      isScrollControlled: true,
      builder: (sheet) => RaisedSheetBody(
        title: title,
        header: header,
        children: rows(sheet),
      ),
    );
