// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'license_decision_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

LicenseDecisionDto _$LicenseDecisionDtoFromJson(Map<String, dynamic> json) =>
    LicenseDecisionDto(
      decision: LicenseDecisionDtoDecision.fromJson(json['decision'] as String),
      rejectionCode: json['rejectionCode'] == null
          ? null
          : LicenseDecisionDtoRejectionCode.fromJson(
              json['rejectionCode'] as String,
            ),
      note: json['note'] as String?,
    );

Map<String, dynamic> _$LicenseDecisionDtoToJson(LicenseDecisionDto instance) =>
    <String, dynamic>{
      'decision': instance.decision.toJson(),
      'rejectionCode': ?instance.rejectionCode?.toJson(),
      'note': ?instance.note,
    };
