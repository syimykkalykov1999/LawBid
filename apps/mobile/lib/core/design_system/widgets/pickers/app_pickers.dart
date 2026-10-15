import 'package:flutter/material.dart';

/// Owner 2026-10-15: the date and time pickers of the app. Colours come from
/// the theme (`datePickerTheme` / `timePickerTheme` in app_theme.dart, opaque
/// in all four themes); here they are only made a little more compact: the
/// Material dialog scales its size with the text scale, so a smaller scale
/// gives a smaller calendar and smaller type together (the person's own
/// system font size still counts).
const double _compactScale = 0.88;

Widget _compact(BuildContext context, Widget? child) {
  final media = MediaQuery.of(context);
  return MediaQuery(
    data: media.copyWith(
      textScaler: TextScaler.linear(media.textScaler.scale(1) * _compactScale),
    ),
    child: child ?? const SizedBox.shrink(),
  );
}

/// [showDatePicker] with the app's compact size.
Future<DateTime?> showAppDatePicker({
  required BuildContext context,
  required DateTime initialDate,
  required DateTime firstDate,
  required DateTime lastDate,
}) =>
    showDatePicker(
      context: context,
      initialDate: initialDate,
      firstDate: firstDate,
      lastDate: lastDate,
      builder: _compact,
    );

/// [showTimePicker] with the app's compact size.
Future<TimeOfDay?> showAppTimePicker({
  required BuildContext context,
  required TimeOfDay initialTime,
}) =>
    showTimePicker(
      context: context,
      initialTime: initialTime,
      builder: _compact,
    );
