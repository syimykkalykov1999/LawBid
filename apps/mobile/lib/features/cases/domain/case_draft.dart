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

/// Audit 2026-10-04: an uploaded wizard photo or document kept in the
/// local draft so a reopened draft still carries it. [name] is set for a
/// document (PDF / Word); null = a photo.
@immutable
class CaseDraftFile {
  const CaseDraftFile({required this.fileId, this.name});

  final String fileId;
  final String? name;

  Map<String, Object?> toJson() => {'fileId': fileId, 'name': name};

  @override
  bool operator ==(Object other) =>
      other is CaseDraftFile && other.fileId == fileId && other.name == name;

  @override
  int get hashCode => Object.hash(fileId, name);
}

/// Owner 2026-10-15: one more topic of the case (the first is the draft's
/// own `practice*` fields).
@immutable
class CaseDraftPractice {
  const CaseDraftPractice({
    required this.id,
    required this.i18nKey,
    required this.nameEn,
    this.code,
  });

  final String id;
  final String i18nKey;
  final String nameEn;
  final String? code;

  Map<String, Object?> toJson() =>
      {'id': id, 'i18nKey': i18nKey, 'nameEn': nameEn, 'code': code};

  @override
  bool operator ==(Object other) =>
      other is CaseDraftPractice && other.id == id;

  @override
  int get hashCode => id.hashCode;
}

/// Owner 2026-10-04: what the urgency control shows (and sends) until the
/// client picks.
const String kDefaultCaseUrgency = 'flexible';

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
    this.files = const [],
    this.practiceCode,
    this.coverKey,
    this.urgency,
    this.deadlineAt,
    this.deadlineKind,
    this.extraPractices = const [],
  });

  /// Owner 2026-10-15: topics 2..N (up to `case.max_practices` in all).
  final List<CaseDraftPractice> extraPractices;

  /// The leaf code (`family_law.divorce`) — previews the covers.
  final String? practiceCode;

  /// Owner 2026-10-04: `art:N` / `icon:<name>`; null = automatic.
  final String? coverKey;

  /// Owner 2026-10-04/05: flexible | within_month | soon | urgent |
  /// very_urgent | by_date (API values).
  final String? urgency;

  /// Owner 2026-10-05: with `by_date`, the day (`YYYY-MM-DD`) and what it
  /// is (court_hearing | filing_deadline | meeting | signing | other).
  final String? deadlineAt;
  final String? deadlineKind;

  /// `by_date` needs a date.
  bool get urgencyValid => urgency != 'by_date' || deadlineAt != null;

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

  /// Uploaded photos / documents (their file ids), in wizard order.
  final List<CaseDraftFile> files;

  bool get isEmpty =>
      practiceAreaId == null &&
      extraPractices.isEmpty &&
      title.trim().isEmpty &&
      description.trim().isEmpty &&
      city.trim().isEmpty &&
      additionalStateCodes.isEmpty &&
      budgetDollars == null &&
      files.isEmpty;

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
    List<CaseDraftFile>? files,
    String? practiceCode,
    String? coverKey,
    bool clearCoverKey = false,
    String? urgency,
    String? deadlineAt,
    String? deadlineKind,
    bool clearDeadline = false,
    List<CaseDraftPractice>? extraPractices,
    bool clearPractice = false,
  }) =>
      CaseDraft(
        practiceAreaId:
            clearPractice ? null : (practiceAreaId ?? this.practiceAreaId),
        practiceI18nKey:
            clearPractice ? null : (practiceI18nKey ?? this.practiceI18nKey),
        practiceNameEn:
            clearPractice ? null : (practiceNameEn ?? this.practiceNameEn),
        extraPractices: extraPractices ?? this.extraPractices,
        title: title ?? this.title,
        description: description ?? this.description,
        primaryStateCode: primaryStateCode ?? this.primaryStateCode,
        additionalStateCodes: additionalStateCodes ?? this.additionalStateCodes,
        city: city ?? this.city,
        budgetIsAmount: budgetIsAmount ?? this.budgetIsAmount,
        budgetDollars:
            clearBudgetDollars ? null : (budgetDollars ?? this.budgetDollars),
        step: step ?? this.step,
        files: files ?? this.files,
        practiceCode:
            clearPractice ? null : (practiceCode ?? this.practiceCode),
        coverKey: clearCoverKey ? null : (coverKey ?? this.coverKey),
        urgency: urgency ?? this.urgency,
        deadlineAt: clearDeadline ? null : (deadlineAt ?? this.deadlineAt),
        deadlineKind:
            clearDeadline ? null : (deadlineKind ?? this.deadlineKind),
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
        'files': [for (final f in files) f.toJson()],
        'practiceCode': practiceCode,
        'extraPractices': [for (final p in extraPractices) p.toJson()],
        'coverKey': coverKey,
        'urgency': urgency,
        'deadlineAt': deadlineAt,
        'deadlineKind': deadlineKind,
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
        files: [
          for (final f in (m['files'] as List<dynamic>? ?? []))
            if (f is Map && f['fileId'] is String)
              CaseDraftFile(
                fileId: f['fileId'] as String,
                name: f['name'] as String?,
              ),
        ],
        practiceCode: m['practiceCode'] as String?,
        extraPractices: [
          for (final p in (m['extraPractices'] as List<dynamic>? ?? []))
            if (p is Map && p['id'] is String && p['i18nKey'] is String)
              CaseDraftPractice(
                id: p['id'] as String,
                i18nKey: p['i18nKey'] as String,
                nameEn: (p['nameEn'] as String?) ?? '',
                code: p['code'] as String?,
              ),
        ],
        coverKey: m['coverKey'] as String?,
        urgency: m['urgency'] as String?,
        deadlineAt: m['deadlineAt'] as String?,
        deadlineKind: m['deadlineKind'] as String?,
      );
    } on Object {
      return null; // A corrupt draft is dropped, never crashes the wizard.
    }
  }
}
