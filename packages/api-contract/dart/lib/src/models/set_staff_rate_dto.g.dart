// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'set_staff_rate_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SetStaffRateDto _$SetStaffRateDtoFromJson(Map<String, dynamic> json) =>
    SetStaffRateDto(
      kind: SetStaffRateDtoKind.fromJson(json['kind'] as String),
      workspace: SetStaffRateDtoWorkspace.fromJson(json['workspace'] as String),
      amountCents: (json['amountCents'] as num).toInt(),
      validFrom: json['validFrom'] == null
          ? null
          : DateTime.parse(json['validFrom'] as String),
      boostMult: json['boostMult'] as num?,
    );

Map<String, dynamic> _$SetStaffRateDtoToJson(SetStaffRateDto instance) =>
    <String, dynamic>{
      'kind': instance.kind.toJson(),
      'workspace': instance.workspace.toJson(),
      'amountCents': instance.amountCents,
      'validFrom': ?instance.validFrom?.toIso8601String(),
      'boostMult': ?instance.boostMult,
    };
