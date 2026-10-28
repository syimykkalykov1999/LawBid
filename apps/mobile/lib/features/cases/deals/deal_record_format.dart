import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_format.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_status.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Deal record 2026-10-27: texts of the record screen and card, all from the
/// DTO (no legal wording of our own beyond the admin-editable consent lines).
abstract final class DealRecordFormat {
  /// The label of a payment-terms type (bid form dropdown, record screen).
  static String typeLabel(Translator t, api.PaymentTermsDtoType type) =>
      t.t('deal.terms.type.${type.json ?? 'to_be_clarified'}');

  static String periodLabel(
    Translator t,
    api.PaymentTermsDtoInstallmentPeriod p,
  ) =>
      t.t('deal.terms.period.${p.json ?? 'monthly'}');

  /// One short line per term, in the user's language; amounts in USD.
  static List<String> describe(
    Translator t,
    L10nFormats f,
    api.PaymentTermsDto p,
  ) {
    final lines = <String>[typeLabel(t, p.type)];
    final flat = p.flatCents;
    if (flat != null) lines.add(CaseFormat.money(f, flat));
    final rate = p.hourlyRateCents;
    if (rate != null) {
      var s = t.t('cases.fee.perHour', {'amount': CaseFormat.money(f, rate)});
      final a = p.estimatedHoursMin ?? p.estimatedHoursMax;
      final b = p.estimatedHoursMax ?? p.estimatedHoursMin;
      if (a != null && b != null) {
        s += ' · ${a == b ? '$a' : '$a–$b'} h';
      }
      lines.add(s);
    }
    final bps = p.contingencyBps;
    if (bps != null) lines.add(CaseFormat.percent(t, f, bps));
    final retainer = p.retainerCents;
    if (retainer != null) {
      lines.add(
        '${t.t('deal.terms.retainer')} ${CaseFormat.money(f, retainer)}',
      );
    }
    final each = p.installmentCents;
    final count = p.installmentCount;
    final period = p.installmentPeriod;
    if (each != null && count != null && period != null) {
      lines.add(
        '$count × ${CaseFormat.money(f, each)} · ${periodLabel(t, period)}',
      );
    }
    final notes = p.notes;
    if (notes != null && notes.trim().isNotEmpty) lines.add(notes.trim());
    return lines;
  }

  /// The headline of the accepted terms plus the rich lines, if any.
  static List<String> termsLines(
    Translator t,
    L10nFormats f,
    api.DealTermsDto terms,
  ) {
    final head = CaseFormat.terms(
      t,
      f,
      terms.feeType,
      terms.amountCents,
      percentBps: terms.percentBps,
    );
    final rich = terms.paymentTerms;
    return [head, if (rich != null) ...describe(t, f, rich)];
  }

  /// "Awaiting your signature" / "Awaiting the other party" / "Sealed" ...
  static String statusLabel(Translator t, api.DealRecordDto r) =>
      switch (r.status) {
        api.DealRecordStatus.preparing => t.t('deal.status.preparing'),
        api.DealRecordStatus.awaitingSignatures => r.myTurnToSign
            ? t.t('deal.status.yourTurn')
            : t.t('deal.status.otherTurn'),
        api.DealRecordStatus.sealing => t.t('deal.status.preparing'),
        api.DealRecordStatus.valueSealed => t.t('deal.status.sealed'),
        api.DealRecordStatus.declined => t.t('deal.status.declined'),
        api.DealRecordStatus.failed => t.t('deal.status.failed'),
        _ => t.t('deal.status.preparing'),
      };

  static StatusTone statusTone(api.DealRecordDto r) => switch (r.status) {
        api.DealRecordStatus.valueSealed => StatusTone.success,
        api.DealRecordStatus.declined => StatusTone.neutral,
        api.DealRecordStatus.failed => StatusTone.danger,
        api.DealRecordStatus.awaitingSignatures =>
          r.myTurnToSign ? StatusTone.gold : StatusTone.info,
        _ => StatusTone.info,
      };

  /// "Attorney · counter-offer · $2,400".
  static String offerHeadline(
    Translator t,
    L10nFormats f,
    api.DealOfferDto o,
  ) {
    final who = t.t(
      o.fromRole == api.PartyRole.client
          ? 'deal.row.client'
          : 'deal.row.attorney',
    );
    final kind = o.status == 'accepted'
        ? t.t('deal.row.accepted')
        : t.t(o.roundNo == 0 ? 'deal.offer.offer' : 'deal.offer.counter');
    final terms = CaseFormat.terms(
      t,
      f,
      o.feeType,
      o.amountCents,
      percentBps: o.percentBps,
    );
    return '$who · $kind · $terms';
  }

  /// Offers grouped by local day, oldest first.
  static List<(DateTime, List<api.DealOfferDto>)> byDay(
    List<api.DealOfferDto> history,
  ) {
    final sorted = [...history]..sort((a, b) => a.roundNo.compareTo(b.roundNo));
    final out = <(DateTime, List<api.DealOfferDto>)>[];
    for (final o in sorted) {
      final d = o.createdAt.toLocal();
      final day = DateTime(d.year, d.month, d.day);
      if (out.isNotEmpty && out.last.$1 == day) {
        out.last.$2.add(o);
      } else {
        out.add((day, [o]));
      }
    }
    return out;
  }
}
