// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'stars_kind_total_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StarsKindTotalDto _$StarsKindTotalDtoFromJson(Map<String, dynamic> json) =>
    StarsKindTotalDto(
      kind: json['kind'] as String,
      stars: (json['stars'] as num).toInt(),
      count: (json['count'] as num).toInt(),
    );

Map<String, dynamic> _$StarsKindTotalDtoToJson(StarsKindTotalDto instance) =>
    <String, dynamic>{
      'kind': instance.kind,
      'stars': instance.stars,
      'count': instance.count,
    };
