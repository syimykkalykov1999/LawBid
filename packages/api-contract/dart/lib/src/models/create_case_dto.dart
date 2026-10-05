// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'budget_mode.dart';
import 'case_urgency.dart';

part 'create_case_dto.g.dart';

@JsonSerializable()
class CreateCaseDto {
  const CreateCaseDto({
    required this.practiceAreaId,
    required this.title,
    required this.description,
    required this.primaryStateCode,
    required this.budgetMode,
    this.additionalStateCodes,
    this.city,
    this.photoFileIds,
    this.budgetAmountDollars,
    this.clientContactSharingConsent,
    this.coverKey,
    this.urgency,
  });

  factory CreateCaseDto.fromJson(Map<String, Object?> json) =>
      _$CreateCaseDtoFromJson(json);

  /// A leaf (specialization).
  final String practiceAreaId;
  final String title;
  final String description;
  final String primaryStateCode;

  /// 0-2 more states, distinct from the primary and each other.
  final List<String>? additionalStateCodes;
  final String? city;
  final BudgetMode budgetMode;

  /// Clean case_photo file ids (0-9), display order.
  final List<String>? photoFileIds;

  /// Required (and only meaningful) when budgetMode = amount.
  final int? budgetAmountDollars;

  /// Must be true unless the client already granted client_contact_sharing on an earlier case.
  final bool? clientContactSharingConsent;

  /// `art:0`-`art:3` (practice cover variant) or `icon:<name>`.
  final String? coverKey;

  /// Owner 2026-10-04: how soon the client needs an attorney.
  final CaseUrgency? urgency;

  Map<String, Object?> toJson() => _$CreateCaseDtoToJson(this);
}
