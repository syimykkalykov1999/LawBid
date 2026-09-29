import 'dart:convert';

import 'package:flutter/foundation.dart';

/// docs/04 §3.2 limits, mirrored client-side for instant feedback (the
/// server re-validates everything).
abstract final class CaseLimits {
  static const titleMin = 10;
  static const titleMax = 120;
  static const descriptionMin = 30;
  static const descriptionMax = 5000;
  static const cityMax = 80;
  static const maxAdditionalStates = 2;
  static const budgetMinDollars = 1;
  static const budgetMaxDollars = 10000000;
}

/// The case wizard's working copy (docs/04 §3.1). Stored only locally
/// until published — there are no server drafts.
@immutable
class CaseDraft {
  const CaseDraft({
    this.practiceAreaId,
    this.practiceI18nKey,
    this.practiceNameEn,
    this.title = '',
    this.description = '',
    this.primaryStateCode,
    this.additionalStateCodes = const [],
    this.city = '',
    this.budgetIsAmount = false,
    this.budgetDollars,
    this.step = 0,
  });

  final String? practiceAreaId;
  final String? practiceI18nKey;
  final String? practiceNameEn;
  final String title;
  final String description;
  final String? primaryStateCode;
  final List<String> additionalStateCodes;
  final String city;
  final bool budgetIsAmount;
  final int? budgetDollars;
  final int step;

  bool get isEmpty =>
      practiceAreaId == null &&
      title.trim().isEmpty &&
      description.trim().isEmpty &&
      city.trim().isEmpty &&
      additionalStateCodes.isEmpty &&
      budgetDollars == null;

  bool get practiceValid => practiceAreaId != null;

  bool get titleValid {
    final n = title.trim().length;
    return n >= CaseLimits.titleMin && n <= CaseLimits.titleMax;
  }

  bool get descriptionValid {
    final n = description.trim().length;
    return n >= CaseLimits.descriptionMin && n <= CaseLimits.descriptionMax;
  }

  bool get placeValid =>
      primaryStateCode != null &&
      city.trim().length <= CaseLimits.cityMax &&
      additionalStateCodes.length <= CaseLimits.maxAdditionalStates &&
      !additionalStateCodes.contains(primaryStateCode);

  bool get budgetValid =>
      !budgetIsAmount ||
      (budgetDollars != null &&
          budgetDollars! >= CaseLimits.budgetMinDollars &&
          budgetDollars! <= CaseLimits.budgetMaxDollars);

  CaseDraft copyWith({
    String? practiceAreaId,
    String? practiceI18nKey,
    String? practiceNameEn,
    String? title,
    String? description,
    String? primaryStateCode,
    List<String>? additionalStateCodes,
    String? city,
    bool? budgetIsAmount,
    int? budgetDollars,
    bool clearBudgetDollars = false,
    int? step,
  }) =>
      CaseDraft(
        practiceAreaId: practiceAreaId ?? this.practiceAreaId,
        practiceI18nKey: practiceI18nKey ?? this.practiceI18nKey,
        practiceNameEn: practiceNameEn ?? this.practiceNameEn,
        title: title ?? this.title,
        description: description ?? this.description,
        primaryStateCode: primaryStateCode ?? this.primaryStateCode,
        additionalStateCodes: additionalStateCodes ?? this.additionalStateCodes,
        city: city ?? this.city,
        budgetIsAmount: budgetIsAmount ?? this.budgetIsAmount,
        budgetDollars:
            clearBudgetDollars ? null : (budgetDollars ?? this.budgetDollars),
        step: step ?? this.step,
      );

  Map<String, Object?> toJson() => {
        'practiceAreaId': practiceAreaId,
        'practiceI18nKey': practiceI18nKey,
        'practiceNameEn': practiceNameEn,
        'title': title,
        'description': description,
        'primaryStateCode': primaryStateCode,
        'additionalStateCodes': additionalStateCodes,
        'city': city,
        'budgetIsAmount': budgetIsAmount,
        'budgetDollars': budgetDollars,
        'step': step,
      };

  String encode() => jsonEncode(toJson());

  static CaseDraft? decode(String? raw) {
    if (raw == null || raw.isEmpty) return null;
    try {
      final m = jsonDecode(raw) as Map<String, dynamic>;
      return CaseDraft(
        practiceAreaId: m['practiceAreaId'] as String?,
        practiceI18nKey: m['practiceI18nKey'] as String?,
        practiceNameEn: m['practiceNameEn'] as String?,
        title: (m['title'] as String?) ?? '',
        description: (m['description'] as String?) ?? '',
        primaryStateCode: m['primaryStateCode'] as String?,
        additionalStateCodes: [
          for (final s in (m['additionalStateCodes'] as List<dynamic>? ?? []))
            if (s is String) s,
        ],
        city: (m['city'] as String?) ?? '',
        budgetIsAmount: (m['budgetIsAmount'] as bool?) ?? false,
        budgetDollars: m['budgetDollars'] as int?,
        step: (m['step'] as int?) ?? 0,
      );
    } on Object {
      return null; // A corrupt draft is dropped, never crashes the wizard.
    }
  }
}
