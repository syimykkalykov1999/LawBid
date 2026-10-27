// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_rate_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffRateDto _$StaffRateDtoFromJson(Map<String, dynamic> json) => StaffRateDto(
  id: json['id'] as String,
  kind: StaffRateDtoKind.fromJson(json['kind'] as String),
  workspace: StaffRateDtoWorkspace.fromJson(json['workspace'] as String),
  amountCents: (json['amountCents'] as num).toInt(),
  currency: json['currency'] as String,
  validFrom: DateTime.parse(json['validFrom'] as String),
  active: json['active'] as bool,
  validTo: json['validTo'] == null
      ? null
      : DateTime.parse(json['validTo'] as String),
  boostMult: json['boostMult'] as num?,
);

Map<String, dynamic> _$StaffRateDtoToJson(StaffRateDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'kind': instance.kind.toJson(),
      'workspace': instance.workspace.toJson(),
      'amountCents': instance.amountCents,
      'currency': instance.currency,
      'validFrom': instance.validFrom.toIso8601String(),
      'validTo': ?instance.validTo?.toIso8601String(),
      'boostMult': ?instance.boostMult,
      'active': instance.active,
    };
