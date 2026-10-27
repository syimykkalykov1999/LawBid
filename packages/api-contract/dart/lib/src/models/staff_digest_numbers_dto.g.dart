// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_digest_numbers_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffDigestNumbersDto _$StaffDigestNumbersDtoFromJson(
  Map<String, dynamic> json,
) => StaffDigestNumbersDto(
  decisions: (json['decisions'] as num).toInt(),
  returnedPct: json['returnedPct'] as num?,
  appeals: (json['appeals'] as num).toInt(),
  worstCount: (json['worstCount'] as num).toInt(),
  bestCount: (json['bestCount'] as num).toInt(),
  worstName: json['worstName'] as String?,
  bestName: json['bestName'] as String?,
  pieceworkCents: (json['pieceworkCents'] as num).toInt(),
  currency: json['currency'] as String,
);

Map<String, dynamic> _$StaffDigestNumbersDtoToJson(
  StaffDigestNumbersDto instance,
) => <String, dynamic>{
  'decisions': instance.decisions,
  'returnedPct': ?instance.returnedPct,
  'appeals': instance.appeals,
  'worstCount': instance.worstCount,
  'bestCount': instance.bestCount,
  'worstName': ?instance.worstName,
  'bestName': ?instance.bestName,
  'pieceworkCents': instance.pieceworkCents,
  'currency': instance.currency,
};
