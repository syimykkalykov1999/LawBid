import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/icons/app_icons.dart';
import 'package:lawbid/core/design_system/widgets/display/app_icon_medallion.dart';
import 'package:lawbid/core/design_system/widgets/feedback/app_state_layout.dart';

/// Empty-state placeholder (file 01 §15; `.cursorrules` requires this on
/// every screen alongside loading/error/offline/pagination). Gold-seal
/// medallion + optional title + message, staggered in (UI modernization
/// pass, 2026-09-27).
class AppEmptyState extends StatelessWidget {
  const AppEmptyState({
    required this.message,
    super.key,
    this.title,
    this.icon = AppIcons.inboxOutlined,
    this.action,
    this.illustration,
  });

  final String message;
  final String? title;
  final IconData icon;
  final Widget? action;

  /// Optional picture instead of the icon medallion (see AppStateLayout).
  final Widget? illustration;

  @override
  Widget build(BuildContext context) {
    return AppStateLayout(
      icon: icon,
      title: title,
      message: message,
      action: action,
      illustration: illustration,
    );
  }
}

/// Offline state (`.cursorrules`: offline is one of the mandatory screen
/// states). All strings come from the caller's `t('key')` — see
/// `offline.title` / `offline.message` in static_translator.dart.
class AppOfflineState extends StatelessWidget {
  const AppOfflineState({
    required this.title,
    required this.message,
    super.key,
    this.action,
  });

  final String title;
  final String message;

  /// Typically an `AppButton` wired to the screen's retry.
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return AppStateLayout(
      icon: AppIcons.wifiOffRounded,
      tone: AppMedallionTone.neutral,
      title: title,
      message: message,
      action: action,
    );
  }
}
