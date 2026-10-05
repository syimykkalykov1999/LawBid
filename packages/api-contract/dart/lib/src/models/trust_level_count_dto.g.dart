// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'trust_level_count_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TrustLevelCountDto _$TrustLevelCountDtoFromJson(Map<String, dynamic> json) =>
    TrustLevelCountDto(
      level: (json['level'] as num).toInt(),
      attorneys: (json['attorneys'] as num).toInt(),
    );

Map<String, dynamic> _$TrustLevelCountDtoToJson(TrustLevelCountDto instance) =>
    <String, dynamic>{'level': instance.level, 'attorneys': instance.attorneys};
