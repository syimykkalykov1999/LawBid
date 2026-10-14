import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/translator.dart';

/// Owner 2026-10-01: one phone + one website per account. Before signing
/// in on top of another device, say which one and that it will be signed
/// out; true = continue.
Future<bool> showOtherDeviceDialog(
  BuildContext context,
  Translator t,
  L10nFormats formats,
  Map<String, dynamic> details,
) async {
  final name = details['deviceName'];
  final web = details['platform'] == 'web';
  final device = name is String && name.trim().isNotEmpty
      ? name
      : t.t(web ? 'otherDevice.web' : 'otherDevice.phone');
  final last = DateTime.tryParse('${details['lastUsedAt'] ?? ''}');
  final when = last == null
      ? ''
      : t.t('otherDevice.when', {'date': formats.dateTime(last.toLocal())});
  final colors = Theme.of(context).extension<AppColorTokens>()!;
  final ok = await showDialog<bool>(
    context: context,
    barrierDismissible: false,
    builder: (ctx) => AppAlertDialog(
      backgroundColor: colors.surface,
      icon: AppIcon(
        web ? AppIcons.computerRounded : AppIcons.phoneIphoneRounded,
        color: colors.gold,
      ),
      title: Text(t.t('otherDevice.title')),
      content: Text(t.t('otherDevice.body', {'device': device, 'when': when})),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(ctx).pop(false),
          child: Text(t.t('common.cancel'), maxLines: 1),
        ),
        // One line on every language: the label shrinks, never wraps.
        FilledButton(
          key: const ValueKey('other-device-continue'),
          onPressed: () => Navigator.of(ctx).pop(true),
          child: FittedBox(
            fit: BoxFit.scaleDown,
            child: Text(t.t('otherDevice.continue'), maxLines: 1),
          ),
        ),
      ],
    ),
  );
  return ok ?? false;
}
