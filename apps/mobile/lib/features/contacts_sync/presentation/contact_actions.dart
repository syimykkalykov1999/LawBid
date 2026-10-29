import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/contact_info_screen.dart';
import 'package:lawbid/features/chat/presentation/open_direct_chat.dart';
import 'package:lawbid/features/contacts_sync/application/phone_contacts.dart';
import 'package:lawbid/features/contacts_sync/presentation/contact_rows.dart';

/// Message / call / video of one contact. A call needs the chat to be
/// open for calls (same rule as in the conversation); otherwise the chat
/// opens and says why.
class ContactActions extends ConsumerWidget {
  const ContactActions({required this.contact, super.key});

  final LawBidContact contact;

  Future<void> _call(
    BuildContext context,
    WidgetRef ref, {
    required bool video,
  }) async {
    final t = ref.read(translatorProvider);
    try {
      // An existing direct chat decides; none is created just to find out.
      final all = await ref.read(conversationsProvider.future);
      Conversation? conv;
      for (final c in all.items) {
        if (c.isDirect && c.counterpart.id == contact.userId) conv = c;
      }
      if (conv == null || !chatAudioCallAllowed(ref, conv)) {
        if (context.mounted) {
          showAppSnackBar(context, t.t('call.notAllowedRequest'));
          if (conv == null) {
            await openDirectChat(context, ref, contact.userId);
          }
        }
        return;
      }
      await ref
          .read(callControllerProvider.notifier)
          .call(
            conv.id,
            peer: CallPeer(
              id: contact.userId,
              isAttorney: contact.person.isAttorney,
              displayName: contact.title,
              username: contact.person.username,
              avatarUrl: contact.person.avatarUrl,
            ),
            video: video,
          );
    } on Object {
      if (context.mounted) {
        showAppSnackBar(context, t.t('error.default.message'));
      }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final video = ref.watch(videoCallsEnabledProvider);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        ContactActionButton(
          icon: AppIcons.chatBubbleOutlineRounded,
          label: t.t('phoneContacts.message'),
          onPressed: () => openDirectChat(context, ref, contact.userId),
        ),
        ContactActionButton(
          icon: AppIcons.callOutlined,
          label: t.t('call.button'),
          onPressed: () => _call(context, ref, video: false),
        ),
        if (video)
          ContactActionButton(
            icon: AppIcons.videoCameraOutlined,
            label: t.t('call.videoButton'),
            onPressed: () => _call(context, ref, video: true),
          ),
      ],
    );
  }
}
