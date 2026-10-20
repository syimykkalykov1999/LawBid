import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/contacts_sync/application/phone_contacts.dart';
import 'package:permission_handler/permission_handler.dart';

/// "Find people from your contacts?" — shown before anything is read or
/// sent (also again after the person turned the sync off and deleted it).
class ContactsConsentView extends ConsumerWidget {
  const ContactsConsentView({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(AppSpacing.screenSide * 2),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            AppIcon(
              AppIcons.contactPhoneOutlined,
              size: 48,
              color: colors.textSecondary,
            ),
            const SizedBox(height: AppSpacing.lg),
            Text(
              t.t('phoneContacts.consentTitle'),
              textAlign: TextAlign.center,
              style: type.titleMedium.copyWith(color: colors.text),
            ),
            const SizedBox(height: AppSpacing.sm),
            Text(
              t.t('phoneContacts.consentBody'),
              textAlign: TextAlign.center,
              style: type.body.copyWith(color: colors.textSecondary),
            ),
            const SizedBox(height: AppSpacing.xl),
            AppButton(
              label: t.t('phoneContacts.consentYes'),
              onPressed: () {
                ref.read(contactsConsentProvider.notifier).grant();
                ref.invalidate(phoneContactsProvider);
              },
            ),
          ],
        ),
      ),
    );
  }
}

/// The phone book was refused: the system will not ask again, so the way
/// back is the app's page in the phone's settings.
class ContactsDeniedView extends ConsumerWidget {
  const ContactsDeniedView({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    return AppEmptyState(
      icon: AppIcons.contactPhoneOutlined,
      message: t.t('phoneContacts.denied'),
      action: AppButton(
        label: t.t('phoneContacts.openSettings'),
        onPressed: () async {
          await openAppSettings();
          ref.invalidate(phoneContactsProvider);
        },
      ),
    );
  }
}
