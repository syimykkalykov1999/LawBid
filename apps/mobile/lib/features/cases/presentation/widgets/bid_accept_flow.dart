import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/cases/application/cases_providers.dart';
import 'package:lawbid/features/cases/deals/deal_record_data.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/presentation/widgets/detail_widgets.dart';

/// The confirmation before a bid is accepted: the bid's screen and the bid's
/// card on the case ask the same.
Future<bool> confirmAcceptBid(
  BuildContext context,
  Translator t,
  CaseBid bid, {
  required bool client,
  required bool unverifiedAttorney,
}) =>
    showConfirmSheet(
      context,
      t: t,
      title: t.t(
        client ? 'cases.accept.clientTitle' : 'cases.accept.attorneyTitle',
      ),
      // Owner 2026-10-04: the client accepts knowingly — the bid's state /
      // practice mismatch is repeated right in the confirmation.
      message: [
        t.t(
          client
              ? 'cases.accept.clientMessage'
              : 'cases.accept.attorneyMessage',
        ),
        if (client && (bid.outsideLicensedStates || bid.outsidePractice)) ...[
          t.t('cases.accept.mismatchIntro'),
          if (bid.outsideLicensedStates)
            t.t('cases.outsideStates.clientNoList'),
          if (bid.outsidePractice) t.t('cases.outsidePractice.client'),
        ],
        // Owner 2026-10-05 (legal): a self-declared licence is repeated in
        // the confirmation so the client accepts knowingly.
        if (client && unverifiedAttorney) t.t('cases.accept.unverifiedLine'),
      ].join('\n\n'),
      confirmLabel: t.t('cases.accept.confirm'),
    );

/// Owner 2026-11-05: «Принять» on a bid's card in the case's Bids section,
/// the same steps as on the bid's screen.
Future<void> acceptBidFromCard(
  BuildContext context,
  WidgetRef ref,
  CaseBid bid,
) async {
  final t = ref.read(translatorProvider);
  final ok = await confirmAcceptBid(
    context,
    t,
    bid,
    client: true,
    unverifiedAttorney: bid.attorney?.trustLevel == 0,
  );
  if (!ok || !context.mounted) return;
  try {
    // Deal record 2026-10-27: with the admin switch on, accepting opens the
    // record both parties sign.
    if (ref.read(dealRecordEnabledProvider)) {
      final r = await ref.read(dealRecordActionsProvider).start(bid.id);
      if (context.mounted) await context.push(AppRoutes.dealRecord(r.id));
      return;
    }
    await ref.read(caseActionsProvider).accept(bid);
    if (context.mounted) showAppSnackBar(context, t.t('cases.accept.done'));
  } on Object catch (e) {
    if (context.mounted) showAppSnackBar(context, errorText(t, e));
  }
}
