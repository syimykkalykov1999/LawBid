// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_case_summary_dto.dart';
import 'admin_dispute_card_dto_opened_by_role.dart';
import 'admin_journal_entry_dto.dart';

part 'admin_dispute_card_dto.g.dart';

@JsonSerializable()
class AdminDisputeCardDto {
  const AdminDisputeCardDto({
    required this.id,
    required this.status,
    required this.reason,
    required this.openedBy,
    required this.openedByRole,
    required this.createdAt,
    required this.resolvedAt,
    required this.resolvedBy,
    required this.resolutionNote,
    required this.caseValue,
    required this.journal,
    required this.openerDisputes,
  });

  factory AdminDisputeCardDto.fromJson(Map<String, Object?> json) =>
      _$AdminDisputeCardDtoFromJson(json);

  final String id;
  final String status;
  final String reason;
  final String openedBy;
  final AdminDisputeCardDtoOpenedByRole? openedByRole;
  final DateTime createdAt;
  final DateTime? resolvedAt;
  final String? resolvedBy;
  final String? resolutionNote;

  /// The name has been replaced because it contains a keyword. Original name: `case`.
  @JsonKey(name: 'case')
  final AdminCaseSummaryDto caseValue;

  /// case_journal, oldest first (last 200).
  final List<AdminJournalEntryDto> journal;

  /// Other disputes opened by the same user.
  final int openerDisputes;

  Map<String, Object?> toJson() => _$AdminDisputeCardDtoToJson(this);
}
