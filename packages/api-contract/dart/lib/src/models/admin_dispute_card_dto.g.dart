// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_dispute_card_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminDisputeCardDto _$AdminDisputeCardDtoFromJson(Map<String, dynamic> json) =>
    AdminDisputeCardDto(
      id: json['id'] as String,
      status: json['status'] as String,
      reason: json['reason'] as String,
      openedBy: json['openedBy'] as String,
      openedByRole: json['openedByRole'] == null
          ? null
          : AdminDisputeCardDtoOpenedByRole.fromJson(
              json['openedByRole'] as String,
            ),
      createdAt: DateTime.parse(json['createdAt'] as String),
      resolvedAt: json['resolvedAt'] == null
          ? null
          : DateTime.parse(json['resolvedAt'] as String),
      resolvedBy: json['resolvedBy'] as String?,
      resolutionNote: json['resolutionNote'] as String?,
      caseValue: AdminCaseSummaryDto.fromJson(
        json['case'] as Map<String, dynamic>,
      ),
      journal: (json['journal'] as List<dynamic>)
          .map((e) => AdminJournalEntryDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      openerDisputes: (json['openerDisputes'] as num).toInt(),
    );

Map<String, dynamic> _$AdminDisputeCardDtoToJson(
  AdminDisputeCardDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'status': instance.status,
  'reason': instance.reason,
  'openedBy': instance.openedBy,
  'openedByRole': ?instance.openedByRole?.toJson(),
  'createdAt': instance.createdAt.toIso8601String(),
  'resolvedAt': ?instance.resolvedAt?.toIso8601String(),
  'resolvedBy': ?instance.resolvedBy,
  'resolutionNote': ?instance.resolutionNote,
  'case': instance.caseValue.toJson(),
  'journal': instance.journal.map((e) => e.toJson()).toList(),
  'openerDisputes': instance.openerDisputes,
};
