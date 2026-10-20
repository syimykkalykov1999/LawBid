import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:share_plus/share_plus.dart';

/// Where an invited person lands.
const lawbidInviteLink = 'https://lawbid.dev';

/// Opens the system share sheet with the invitation (the person picks
/// WhatsApp, SMS, …). The text is in the inviter's app language.
Future<void> inviteContact(BuildContext context, WidgetRef ref) async {
  final t = ref.read(translatorProvider);
  final box = context.findRenderObject() as RenderBox?;
  await SharePlus.instance.share(
    ShareParams(
      text: t.t('phoneContacts.inviteText', {'link': lawbidInviteLink}),
      sharePositionOrigin:
          box == null ? null : box.localToGlobal(Offset.zero) & box.size,
    ),
  );
}
