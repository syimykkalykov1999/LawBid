import 'package:intl/intl.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/plans/domain/plan_models.dart';

/// Owner 2026-10-05 (plan builder): the words a plan card shows for a
/// plan's entitlements. Keys live in `plan_strings.dart` (`plan.f.*`);
/// off flags and "no limit" numbers are hidden where a line would say
/// nothing useful.
abstract final class PlanFeatures {
  /// "$399" — whole dollars when there are no cents.
  static String price(
    L10nFormats formats,
    int cents, {
    String currency = 'usd',
  }) {
    final code = currency.toUpperCase();
    return cents % 100 == 0
        ? NumberFormat.simpleCurrency(
            locale: formats.locale,
            name: code,
            decimalDigits: 0,
          ).format(cents ~/ 100)
        : NumberFormat.simpleCurrency(locale: formats.locale, name: code)
            .format(cents / 100);
  }

  /// The big number of the card: the price, or "Free" for a baseline.
  static String amount(Translator t, L10nFormats formats, PlanOffer plan) {
    final cents = plan.amountCents;
    if (cents == null) return t.t('plan.free');
    return price(formats, cents, currency: plan.currency);
  }

  /// "per month" / "per year" next to the number; empty for a baseline.
  static String period(Translator t, PlanOffer plan) => switch (plan.interval) {
        PlanInterval.month => t.t('plans.perMonth'),
        PlanInterval.year => t.t('plans.perYear'),
        PlanInterval.none => '',
      };

  /// "{price} per month" / "{price} per year".
  static String total(
    Translator t,
    L10nFormats formats,
    PlanOffer plan,
    int cents,
  ) =>
      t.t(
        plan.yearly ? 'plans.total.year' : 'plans.total.month',
        {'price': price(formats, cents, currency: plan.currency)},
      );

  /// Highlights (localized by the admin) first, then the lines derived
  /// from the entitlements.
  static List<String> lines(
    Translator t,
    L10nFormats formats,
    PlanOffer plan, {
    required String language,
    int fallbackSeatCents = 0,
  }) {
    final out = <String>[];
    for (final h in plan.highlights) {
      final s = h.resolve(language);
      if (s.isNotEmpty) out.add(s);
    }
    out.addAll(
      entitlementLines(
        t,
        formats,
        plan.entitlements,
        audience: plan.audience,
        extraSeatCents: plan.extraSeatCents ?? fallbackSeatCents,
        trialDays: plan.trialDays,
        currency: plan.currency,
      ),
    );
    return out;
  }

  /// The entitlement lines alone (also the "Your plan" card on the
  /// subscription screen).
  static List<String> entitlementLines(
    Translator t,
    L10nFormats formats,
    PlanEntitlements e, {
    required PlanAudience audience,
    int extraSeatCents = 0,
    int? trialDays,
    String currency = 'usd',
  }) {
    final out = <String>[];
    String n(int v) => formats.number(v);
    if (audience == PlanAudience.attorney) {
      final included = e.includedSeats ?? 0;
      if (included > 0) {
        out.add(t.t('plan.f.seatsIncluded', {'n': n(included)}));
      }
      if (e.extraSeatsAllowed() > 0 && extraSeatCents > 0) {
        out.add(
          t.t('plan.f.extraSeat', {
            'price': price(formats, extraSeatCents, currency: currency),
          }),
        );
      }
      if (e.bidsAnyState ?? false) out.add(t.t('plan.f.bidsAnyState'));
      final bids = e.maxActiveBids;
      if (bids != null) {
        out.add(
          bids > 0
              ? t.t('plan.f.maxActiveBids', {'n': n(bids)})
              : t.t('plan.f.unlimitedBids'),
        );
      }
      if (e.prioritySearch ?? false) out.add(t.t('plan.f.prioritySearch'));
    } else {
      if (e.casePromotion ?? false) out.add(t.t('plan.f.casePromotion'));
      if (e.verifiedBadge ?? false) out.add(t.t('plan.f.verifiedBadge'));
      if (e.priorityFeed ?? false) out.add(t.t('plan.f.priorityFeed'));
      final cases = e.maxActiveCases;
      if (cases != null) {
        out.add(
          cases > 0
              ? t.t('plan.f.maxActiveCases', {'n': n(cases)})
              : t.t('plan.f.unlimitedCases'),
        );
      }
    }
    if (e.calls ?? false) out.add(t.t('plan.f.calls'));
    if (e.videoCalls ?? false) out.add(t.t('plan.f.videoCalls'));
    if (e.documentTemplates ?? false) {
      out.add(t.t('plan.f.documentTemplates'));
    }
    if (e.chatTranslate ?? false) {
      out.add(t.t('plan.f.chatTranslate'));
      final tr = e.translationsPerDay;
      if (tr != null) {
        out.add(
          tr > 0
              ? t.t('plan.f.translationsPerDay', {'n': n(tr)})
              : t.t('plan.f.unlimitedTranslations'),
        );
      }
    }
    if (e.videoPosts ?? false) out.add(t.t('plan.f.videoPosts'));
    final posts = e.postsPerDay;
    if (posts != null) {
      out.add(
        posts > 0
            ? t.t('plan.f.postsPerDay', {'n': n(posts)})
            : t.t('plan.f.unlimitedPosts'),
      );
    }
    final videos = e.videosPerDay;
    if (videos != null && (e.videoPosts ?? false)) {
      out.add(
        videos > 0
            ? t.t('plan.f.videosPerDay', {'n': n(videos)})
            : t.t('plan.f.unlimitedVideos'),
      );
    }
    final trial = trialDays ?? e.trialDays ?? 0;
    if (trial > 0) out.add(t.t('plan.f.trial', {'n': n(trial)}));
    return out;
  }
}
