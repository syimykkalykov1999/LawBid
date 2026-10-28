import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/addresses/open_in_maps.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/chat/presentation/open_direct_chat.dart';
import 'package:lawbid/features/team/domain/team_models.dart';
import 'package:url_launcher/url_launcher.dart';

/// Owner 2026-10-05: contacts turn into a call or an email by plain links
/// (addresses: core/addresses/open_in_maps.dart).
abstract final class TaskLinks {
  static Uri call(String phone) =>
      Uri(scheme: 'tel', path: phone.replaceAll(RegExp(r'[\s()\-]'), ''));

  static Uri mail(String email, {String? subject}) => Uri(
        scheme: 'mailto',
        path: email,
        query:
            subject == null ? null : 'subject=${Uri.encodeComponent(subject)}',
      );

  static Future<void> open(Uri uri) =>
      launchUrl(uri, mode: LaunchMode.externalApplication);
}

/// A place tapped: the maps chooser (owner 2026-10-28; Android — the
/// system list of maps apps, iPhone — Apple Maps / Google Maps / Waze and
/// «Copy the address»), the address filled in for directions.
Future<void> showPlaceActions(
  BuildContext context,
  Translator t,
  TaskPlace place,
) =>
    openAddressInMaps(context, t, place.address);

typedef TaskPersonAction = ({
  IconData icon,
  String label,
  String key,
  Future<void> Function() run,
});

/// The quick actions of a person on a task: call, write, open the chat.
List<TaskPersonAction> taskPersonActions(
  BuildContext context,
  WidgetRef ref,
  Translator t,
  TaskPerson p, {
  String? subject,
}) =>
    [
      if (p.phone?.isNotEmpty ?? false)
        (
          icon: AppIcons.callOutlined,
          label: t.t('tasks.call'),
          key: 'call',
          run: () => TaskLinks.open(TaskLinks.call(p.phone!)),
        ),
      if (p.email?.isNotEmpty ?? false)
        (
          icon: AppIcons.mailOutlineRounded,
          label: t.t('tasks.write'),
          key: 'mail',
          run: () => TaskLinks.open(TaskLinks.mail(p.email!, subject: subject)),
        ),
      if (p.userId != null)
        (
          icon: AppIcons.chatBubbleOutlineRounded,
          label: t.t('tasks.person.chat'),
          key: 'chat',
          run: () => openDirectChat(context, ref, p.userId!),
        ),
    ];
