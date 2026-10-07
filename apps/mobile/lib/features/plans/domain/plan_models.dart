import 'package:flutter/foundation.dart';

/// Owner 2026-10-05 (plan builder): the plans the admin builds in
/// Деньги → Планы, as `GET /plans`, `/subscriptions/me` (attorneys) and
/// `/client-plans/me` (clients) present them. Names, taglines and
/// highlights come localized from the server; the entitlement feature
/// lines are rendered by the app from the keys.

/// Owner 2026-10-07: «$99 / ~~$149~~ month −33%» — the old price struck
/// through and the percent off, both set in the admin (Деньги → Цены).
/// The server sends it only while it is a real discount, never a "plus".
@immutable
class PriceDiscount {
  const PriceDiscount({required this.compareAtCents, required this.percent});

  final int compareAtCents;
  final int percent;
}

/// `{en, ru}` text from the server; [resolve] picks the app language and
/// falls back to English, then to whatever is there.
@immutable
class LocalizedText {
  const LocalizedText({this.en, this.ru});

  static const empty = LocalizedText();

  final String? en;
  final String? ru;

  String resolve(String language) {
    final lang = language.split(RegExp('[-_]')).first.toLowerCase();
    final preferred = switch (lang) {
      'ru' => ru,
      _ => en,
    };
    final v = preferred?.trim();
    if (v != null && v.isNotEmpty) return v;
    final e = en?.trim();
    if (e != null && e.isNotEmpty) return e;
    return ru?.trim() ?? '';
  }

  bool get isEmpty =>
      (en == null || en!.trim().isEmpty) && (ru == null || ru!.trim().isEmpty);
}

/// `PlanEntitlementsDto` — a number is a limit (see the catalog in the
/// API: `max_active_bids` / `max_active_cases` 0 = unlimited), a price is
/// cents (null = the global price), a flag is on/off. Absent = the
/// baseline default.
@immutable
class PlanEntitlements {
  const PlanEntitlements({
    this.includedSeats,
    this.maxSeats,
    this.extraSeatPriceCents,
    this.bidsAnyState,
    this.maxActiveBids,
    this.prioritySearch,
    this.calls,
    this.videoCalls,
    this.documentTemplates,
    this.chatTranslate,
    this.translationsPerDay,
    this.videoPosts,
    this.postsPerDay,
    this.videosPerDay,
    this.casePromotion,
    this.trialDays,
    this.verifiedBadge,
    this.priorityFeed,
    this.maxActiveCases,
  });

  static const none = PlanEntitlements();

  final int? includedSeats;
  final int? maxSeats;
  final int? extraSeatPriceCents;
  final bool? bidsAnyState;
  final int? maxActiveBids;
  final bool? prioritySearch;
  final bool? calls;
  final bool? videoCalls;
  final bool? documentTemplates;
  final bool? chatTranslate;
  final int? translationsPerDay;
  final bool? videoPosts;
  final int? postsPerDay;
  final int? videosPerDay;
  final bool? casePromotion;
  final int? trialDays;
  final bool? verifiedBadge;
  final bool? priorityFeed;
  final int? maxActiveCases;

  /// How many assistant seats beyond the included ones may be bought:
  /// `max_seats` − `included_seats` (the server's `seatsOf`: a cap at or
  /// below the included seats means none; the form allows up to [cap]).
  int extraSeatsAllowed({int cap = 50}) {
    final included = includedSeats ?? 0;
    final max = maxSeats ?? 0;
    if (max <= included) return 0;
    return (max - included).clamp(0, cap);
  }
}

enum PlanAudience {
  attorney,
  client;

  static PlanAudience parse(String? raw) => raw == 'client' ? client : attorney;
}

/// Billing interval of a paid plan; [none] for a baseline (no price).
enum PlanInterval {
  month,
  year,
  none;

  static PlanInterval parse(String? raw) => switch (raw) {
        'month' => month,
        'year' => year,
        _ => none,
      };
}

/// One plan as the "choose a plan" screen shows it (`PublicPlanDto`).
@immutable
class PlanOffer {
  const PlanOffer({
    required this.id,
    required this.code,
    required this.audience,
    required this.name,
    this.isBaseline = false,
    this.tagline = LocalizedText.empty,
    this.description = LocalizedText.empty,
    this.interval = PlanInterval.month,
    this.currency = 'usd',
    this.amountCents,
    this.extraSeatCents,
    this.discount,
    this.entitlements = PlanEntitlements.none,
    this.highlights = const [],
    this.isDefault = false,
    this.trialDays = 0,
  });

  final String id;
  final String code;
  final PlanAudience audience;

  /// `kind == 'baseline'`: what a user without a subscription gets.
  final bool isBaseline;
  final LocalizedText name;
  final LocalizedText tagline;
  final LocalizedText description;
  final PlanInterval interval;
  final String currency;

  /// Price per interval; null for a baseline / no price yet.
  final int? amountCents;

  /// Price of one extra assistant seat per month (attorney plans).
  final int? extraSeatCents;

  /// The strikethrough old price next to [amountCents], or null.
  final PriceDiscount? discount;
  final PlanEntitlements entitlements;
  final List<LocalizedText> highlights;
  final bool isDefault;
  final int trialDays;

  /// A plan that can be bought right now.
  bool get purchasable => !isBaseline && amountCents != null;

  bool get yearly => interval == PlanInterval.year;

  /// Seats that come with the plan.
  int get includedSeats => entitlements.includedSeats ?? 0;

  /// Extra seats the attorney may add on top of [includedSeats].
  int get extraSeatsAllowed => entitlements.extraSeatsAllowed();

  /// Price of the plan with [extraSeats] added (per interval; seats are
  /// priced per month and multiplied for a yearly plan).
  int totalCents(int extraSeats, {int fallbackSeatCents = 0}) {
    final base = amountCents ?? 0;
    final seat = extraSeatCents ?? fallbackSeatCents;
    final months = yearly ? 12 : 1;
    return base + extraSeats * seat * months;
  }
}

/// `SeatSummaryDto`: the attorney's assistant seats right now.
@immutable
class SeatSummary {
  const SeatSummary({
    required this.included,
    required this.extra,
    required this.total,
    required this.max,
  });

  final int included;
  final int extra;
  final int total;

  /// The cap (never below [included]).
  final int max;
}
