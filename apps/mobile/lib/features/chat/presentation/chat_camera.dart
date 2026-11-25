import 'dart:async';

import 'package:flutter/services.dart' show PlatformException;
import 'package:image_picker/image_picker.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/platform/app_settings_opener.dart';
import 'package:material_ui/material_ui.dart';

/// ROUND1 25.11 row 17 (WhatsApp / Telegram): the camera of a chat (1:1 and
/// group) when the phone refuses it. image_picker answers a refused camera
/// permission with `PlatformException(camera_access_denied)` on iOS and
/// Android; the tap used to do nothing. Now the reason shows with
/// «Настройки», which opens the app's page in the phone's settings (as the
/// ID camera and the call screen do). Another camera failure says the
/// camera could not start. Null: no photo.
Future<XFile?> takeChatPhoto(
  BuildContext context,
  Translator t, {
  double? maxWidth,
  double? maxHeight,
  int? imageQuality,
}) async {
  try {
    return await ImagePicker().pickImage(
      source: ImageSource.camera,
      maxWidth: maxWidth,
      maxHeight: maxHeight,
      imageQuality: imageQuality,
      requestFullMetadata: false,
    );
  } on PlatformException catch (e) {
    if (context.mounted) {
      final denied = e.code == 'camera_access_denied';
      showAppSnackBar(
        context,
        t.t(
          denied
              ? 'verification.camera.denied.body'
              : 'verification.camera.unavailable.body',
        ),
        actionLabel: denied ? t.t('settings.title') : null,
        onAction: denied ? () => unawaited(openAppSettingsPage()) : null,
      );
    }
    return null;
  }
}
