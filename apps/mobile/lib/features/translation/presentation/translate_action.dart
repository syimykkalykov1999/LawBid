import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/language_providers.dart';
import 'package:lawbid/features/plans/presentation/plan_offer.dart';
import 'package:lawbid/features/translation/data/device_translator.dart';

/// Owner 2026-10-20: translates [text] into the app language when the person
/// asks (a menu item). It runs on the phone (ML Kit, free; the language model
/// downloads only now, on the tap); [server] (the paid Google Translate) is
/// used only when the phone has no model for the pair. Returns `null` after
/// telling the person why nothing was translated.
Future<String?> translateOnRequest(
  BuildContext context,
  WidgetRef ref,
  String text, {
  Future<String> Function(String target)? server,
}) async {
  final t = ref.read(translatorProvider);
  final device = ref.read(deviceTranslatorProvider);
  final target =
      (ref.read(languageControllerProvider).value ?? AppLanguage.fallback).code;
  try {
    try {
      if (!device.supportsTarget(target)) {
        throw const DeviceTranslateException(
          DeviceTranslateFailure.targetUnsupported,
        );
      }
      if (context.mounted) {
        showAppSnackBar(context, t.t('chat.translate.loading'));
      }
      return await device.translate(
        text,
        target,
        onDownloading: () {
          if (context.mounted) {
            showAppSnackBar(context, t.t('translate.download'));
          }
        },
      );
    } on DeviceTranslateException catch (e) {
      if (e.reason == DeviceTranslateFailure.sameLanguage || server == null) {
        if (context.mounted) showAppSnackBar(context, t.t(e.reason.key));
        return null;
      }
      return await server(target);
    }
  } on Object catch (e) {
    if (context.mounted) showErrorOrPlans(context, ref, e);
    return null;
  }
}
