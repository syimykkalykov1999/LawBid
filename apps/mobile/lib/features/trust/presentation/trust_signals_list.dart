import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/trust/domain/trust_models.dart';
import 'package:lawbid/features/trust/presentation/trust_level_chip.dart';

/// One line per check: a green tick for what LawBid confirmed, a grey
/// circle for what it did not (never says "verified" for a level the facts
/// do not support).
class TrustSignalsList extends StatelessWidget {
  const TrustSignalsList({
    required this.trust,
    required this.t,
    super.key,
    this.self = false,
  });

  final PublicTrust trust;
  final Translator t;

  /// The attorney is looking at their own list: the payments line speaks
  /// to them («Клиенты пока не могут платить вам…»).
  final bool self;

  @override
  Widget build(BuildContext context) {
    final s = trust.signals;
    final rows = <(bool, String)>[
      (s.selfAttested, t.t('trust.signal.selfAttested')),
      (
        s.licenseConfirmed,
        t.t(
          !s.licenseConfirmed
              ? 'trust.signal.license.no'
              : s.licenseConfirmedBy == LicenseConfirmedBy.staff
                  ? 'trust.signal.license.staff'
                  : 'trust.signal.license.registry',
        ),
      ),
      (s.identityConfirmed, t.t(identityKey(s))),
      if (s.stripeKyc || s.nameCheck != NameCheck.unknown)
        (
          s.nameCheck == NameCheck.match,
          t.t('trust.signal.name.${s.nameCheck.name}'),
        ),
      (
        trust.acceptsPayments,
        t.t(paymentsKey(ok: trust.acceptsPayments, self: self)),
      ),
      (
        trust.canBid,
        t.t(trust.canBid ? 'trust.signal.bids.ok' : 'trust.signal.bids.no'),
      ),
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final (ok, text) in rows)
          _SignalRow(ok: ok, text: text, danger: _isDanger(s, text)),
      ],
    );
  }

  /// The name mismatch is the one "not confirmed" line that is a warning
  /// rather than simply "not yet".
  bool _isDanger(TrustSignals s, String text) =>
      s.nameCheck == NameCheck.mismatch &&
      text == t.t('trust.signal.name.mismatch');

  /// Payments inside LawBid (the client paying this attorney in the app),
  /// worded for the client or for the attorney themselves.
  static String paymentsKey({required bool ok, required bool self}) =>
      'trust.signal.payments.${ok ? 'ok' : 'no'}${self ? '.self' : ''}';

  /// How identity was confirmed (the pre-payment sentence uses the same
  /// split: Stripe name match → documents → firm link).
  static String identityKey(TrustSignals s) {
    if (!s.identityConfirmed) return 'trust.signal.identity.no';
    if (s.documentsVerified) return 'trust.signal.identity.documents';
    if (s.stripeIdentity) return 'trust.signal.identity.stripe';
    if (s.firmLinkConfirmed) return 'trust.signal.identity.firm';
    return 'trust.signal.identity.stripe';
  }
}

class _SignalRow extends StatelessWidget {
  const _SignalRow({
    required this.ok,
    required this.text,
    required this.danger,
  });

  final bool ok;
  final String text;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final fg = ok
        ? colors.success
        : danger
            ? colors.dangerText
            : colors.textSecondary;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs + 2),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AppIcon(
            ok
                ? AppIcons.checkCircleRounded
                : danger
                    ? AppIcons.errorOutlineRounded
                    : AppIcons.radioButtonUncheckedRounded,
            size: AppSizes.iconSm,
            color: fg,
          ),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Text(
              text,
              style: typography.bodySmall.copyWith(
                color: ok || danger ? colors.text : colors.textSecondary,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// The four levels, the reached ones filled in the level's colour.
class TrustLevelLadder extends StatelessWidget {
  const TrustLevelLadder({required this.level, required this.t, super.key});

  final int level;
  final Translator t;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (var lv = TrustLevels.min; lv <= TrustLevels.max; lv++)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs + 2),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _LevelDot(level: lv, reached: lv <= level),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        t.t(TrustLevels.nameKey(lv)),
                        style: typography.bodySmall.copyWith(
                          color:
                              lv <= level ? colors.text : colors.textSecondary,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      Text(
                        t.t(TrustLevels.descriptionKey(lv)),
                        style: typography.caption.copyWith(
                          color: colors.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

class _LevelDot extends StatelessWidget {
  const _LevelDot({required this.level, required this.reached});

  final int level;
  final bool reached;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final c = trustLevelColors(colors, level);
    return Container(
      width: 22,
      height: 22,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: reached ? c.fill : Colors.transparent,
        border: Border.all(color: reached ? c.border : colors.border),
      ),
      child: Text(
        '$level',
        style: typography.caption.copyWith(
          color: reached ? c.fg : colors.textSecondary,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}
