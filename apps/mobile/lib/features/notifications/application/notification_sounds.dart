import 'dart:io';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

/// Two notification channels — chats and everything else. Owner
/// 2026-10-07: both play the phone's own default sound (LawBid ships no
/// sounds of its own). Android keeps a sound per channel, so the user can
/// pick any system sound in that channel's settings; iOS has one
/// notification screen per app.
enum NotificationSoundChannel {
  chats('chats'),
  general('general');

  const NotificationSoundChannel(this.id);

  final String id;
}

const _channel = MethodChannel('lawbid/notification_sounds');

/// Opens the system screen where the sound of [which] can be changed.
/// [iconBadge] false: the alerts come through the channel's no-badge twin
/// (owner 2026-10-21, inbox 29; MainActivity.kt), so that one is opened.
Future<void> openNotificationSoundSettings(
  NotificationSoundChannel which, {
  bool iconBadge = true,
}) async {
  if (kIsWeb) return;
  if (Platform.isAndroid) {
    await _channel.invokeMethod<void>('openChannel', {
      'id': iconBadge ? which.id : '${which.id}_nobadge',
    });
  } else if (Platform.isIOS) {
    await launchUrl(Uri.parse('app-settings:'));
  }
}
