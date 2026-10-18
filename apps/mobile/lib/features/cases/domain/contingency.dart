import 'package:lawbid/core/feature_flags/feature_flags_state.dart';

/// Owner 2026-10-17: percent (contingency) budgets and bids — a deal
/// between client and attorney, LawBid takes nothing from it. Percents
/// travel as basis points (3300 = 33 %, 3333 = 33.33 %). The admin sets
/// the cap (`fees.contingency_max_percent`) and the topics where the
/// percent option is hidden (`fees.contingency_blocked_practices`).
class ContingencyRules {
  const ContingencyRules({required this.maxBps, required this.blocked});

  factory ContingencyRules.of(FeatureFlagsState flags) {
    final max =
        num.tryParse(flags.appConfig['fees.contingency_max_percent'] ?? '') ??
            100;
    final blocked = flags.appConfig['fees.contingency_blocked_practices'] ??
        'criminal_defense,dui_and_dwi,traffic_tickets,family_law';
    return ContingencyRules(
      maxBps: (max.clamp(0.01, 100) * 100).round(),
      blocked: [
        for (final c in blocked.split(','))
          if (c.trim().isNotEmpty) c.trim(),
      ],
    );
  }

  final int maxBps;
  final List<String> blocked;

  /// True when a case naming [codes] may not use a percent.
  bool blockedFor(Iterable<String> codes) => codes.any(
        (code) => blocked.any((b) => code == b || code.startsWith('$b.')),
      );

  /// "33" or "33.5" (up to 2 decimals) → basis points; null when invalid
  /// or above the cap.
  int? parse(String text) {
    final v = double.tryParse(text.trim().replaceAll(',', '.'));
    if (v == null) return null;
    final bps = (v * 100).round();
    if (bps < 1 || bps > maxBps) return null;
    return bps;
  }

  /// 3300 → "33", 3350 → "33.5", 3333 → "33.33".
  static String plain(int bps) {
    final whole = bps ~/ 100;
    final rest = bps % 100;
    if (rest == 0) return '$whole';
    final dec = rest.toString().padLeft(2, '0');
    return '$whole.${dec.endsWith('0') ? dec[0] : dec}';
  }
}
