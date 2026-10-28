import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

/// Where an invited person lands.
const lawbidInviteLink = 'https://lawbid.dev';

/// Opens a URL; false when nothing could handle it. Overridden in tests.
final inviteUrlLauncherProvider = Provider<Future<bool> Function(Uri)>(
  (_) => (uri) async {
    try {
      return await launchUrl(uri);
    } on Object {
      return false;
    }
  },
);

/// The SMS composer URL: iOS separates the body with `&`, Android with `?`.
Uri inviteSmsUri(String number, String body) {
  final sep = defaultTargetPlatform == TargetPlatform.iOS ? '&' : '?';
  final phone = number.replaceAll(RegExp(r'[^\d+]'), '');
  return Uri.parse('sms:$phone${sep}body=${Uri.encodeComponent(body)}');
}

/// Opens the SMS composer to [number] with the invitation; when that cannot
/// open, the system share sheet. The text is in the inviter's app language.
Future<void> inviteContact(
  BuildContext context,
  WidgetRef ref,
  String name,
  String number,
) async {
  final t = ref.read(translatorProvider);
  final text = t.t('phoneContacts.inviteTo', {
    'name': name,
    'link': lawbidInviteLink,
  });
  // The context may sit on a sliver, which is not a box.
  final box = context.findRenderObject();
  final origin = box is RenderBox && box.hasSize
      ? box.localToGlobal(Offset.zero) & box.size
      : null;
  if (number.isNotEmpty) {
    final open = ref.read(inviteUrlLauncherProvider);
    if (await open(inviteSmsUri(number, text))) return;
  }
  await SharePlus.instance.share(
    ShareParams(text: text, sharePositionOrigin: origin),
  );
}
