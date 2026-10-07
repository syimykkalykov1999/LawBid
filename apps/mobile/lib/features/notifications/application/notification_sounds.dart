import 'package:flutter/foundation.dart';

import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

/// Owner 2026-10-02: LawBid ships two short sounds of its own — chats and
/// everything else. Android keeps a sound per notification channel, so the
/// user swaps it for any system sound in that channel's settings; iOS has
/// one notification screen per app (the branded sound is chosen by the
/// server in each push).
enum NotificationSoundChannel {
  chats('lawbid_chats'),
  general('lawbid_notifications');

  const NotificationSoundChannel(this.id);

  final String id;
}

const _channel = MethodChannel('lawbid/notification_sounds');

/// Opens the system screen where the sound of [which] can be changed.
Future<void> openNotificationSoundSettings(
  NotificationSoundChannel which,
) async {
  if (kIsWeb) return;
  if (defaultTargetPlatform == TargetPlatform.android) {
    await _channel.invokeMethod<void>('openChannel', {'id': which.id});
  } else if (defaultTargetPlatform == TargetPlatform.iOS) {
    await launchUrl(Uri.parse('app-settings:'));
  }
}
