// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'outreach_suppressions_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

OutreachSuppressionsDto _$OutreachSuppressionsDtoFromJson(
  Map<String, dynamic> json,
) => OutreachSuppressionsDto(
  count: json['count'] as num,
  latest: (json['latest'] as List<dynamic>)
      .map((e) => OutreachSuppressionDto.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$OutreachSuppressionsDtoToJson(
  OutreachSuppressionsDto instance,
) => <String, dynamic>{
  'count': instance.count,
  'latest': instance.latest.map((e) => e.toJson()).toList(),
};
