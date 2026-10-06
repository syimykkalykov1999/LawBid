import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/client_plan/application/client_plan_providers.dart';
import 'package:lawbid/shared/domain/payment_page_launch_mode.dart';
import 'package:url_launcher/url_launcher.dart';

/// Owner 2026-10-06: «Обновить карту» for a client (plan and gold badge):
/// the Stripe Customer Portal in the in-app browser, like the attorney's
/// «Управление». Only an https URL from the server is opened.
Future<void> openClientPaymentPortal(
  BuildContext context,
  WidgetRef ref,
) async {
  final t = ref.read(translatorProvider);
  try {
    final url = await ref.read(clientPlanRepositoryProvider).portalUrl();
    if (!context.mounted) return;
    final opened = url.scheme == 'https' &&
        await launchUrl(url, mode: paymentPageLaunchMode());
    if (!opened && context.mounted) {
      showAppSnackBar(context, t.t('subscription.portal.cantOpen'));
    }
  } on Object catch (e) {
    if (context.mounted) showAppSnackBar(context, errorText(t, e));
  }
}
