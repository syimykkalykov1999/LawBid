import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/chat/presentation/open_direct_chat.dart';
import 'package:lawbid/features/team/domain/team_models.dart';
import 'package:url_launcher/url_launcher.dart';

/// Owner 2026-10-05: addresses open in Google / Apple Maps and contacts
/// turn into a call or an email by plain links — no maps API, no keys,
/// nothing paid.
abstract final class TaskLinks {
  static Uri googleMaps(String address) => Uri.https(
        'www.google.com',
        '/maps/search/',
        {'api': '1', 'query': address},
      );

  static Uri appleMaps(String address) =>
      Uri.https('maps.apple.com', '/', {'q': address});

  /// Directions from where the phone is now.
  static Uri directions(String address) => Uri.https(
        'www.google.com',
        '/maps/dir/',
        {'api': '1', 'destination': address},
      );

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

/// A place tapped: Google Maps, Apple Maps (iPhone), directions, copy.
Future<void> showPlaceActions(
  BuildContext context,
  Translator t,
  TaskPlace place,
) async {
  final choice = await showAppBottomSheet<String>(
    context: context,
    builder: (ctx) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.screenSide,
              0,
              AppSpacing.screenSide,
              AppSpacing.sm,
            ),
            child: Text(
              place.label == null
                  ? place.address
                  : '${place.label} · ${place.address}',
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          AppListRow(
            key: const ValueKey('place-google'),
            icon: AppIcons.mapOutlined,
            label: t.t('tasks.place.google'),
            onTap: () => Navigator.of(ctx).pop('google'),
          ),
          if (defaultTargetPlatform == TargetPlatform.iOS)
            AppListRow(
              key: const ValueKey('place-apple'),
              icon: AppIcons.mapOutlined,
              label: t.t('tasks.place.apple'),
              onTap: () => Navigator.of(ctx).pop('apple'),
            ),
          AppListRow(
            key: const ValueKey('place-route'),
            icon: AppIcons.directionsCarOutlined,
            label: t.t('tasks.place.route'),
            onTap: () => Navigator.of(ctx).pop('route'),
          ),
          AppListRow(
            key: const ValueKey('place-copy'),
            icon: AppIcons.linkRounded,
            label: t.t('tasks.place.copy'),
            onTap: () => Navigator.of(ctx).pop('copy'),
          ),
        ],
      ),
    ),
  );
  if (choice == null || !context.mounted) return;
  switch (choice) {
    case 'google':
      await TaskLinks.open(TaskLinks.googleMaps(place.address));
    case 'apple':
      await TaskLinks.open(TaskLinks.appleMaps(place.address));
    case 'route':
      await TaskLinks.open(TaskLinks.directions(place.address));
    case 'copy':
      await Clipboard.setData(ClipboardData(text: place.address));
      if (context.mounted) showAppSnackBar(context, t.t('tasks.place.copied'));
  }
}

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
