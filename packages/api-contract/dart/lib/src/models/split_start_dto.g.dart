// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'split_start_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SplitStartDto _$SplitStartDtoFromJson(Map<String, dynamic> json) =>
    SplitStartDto(
      toDb: json['toDb'] as String,
      shards: (json['shards'] as List<dynamic>).map((e) => e as num).toList(),
    );

Map<String, dynamic> _$SplitStartDtoToJson(SplitStartDto instance) =>
    <String, dynamic>{'toDb': instance.toDb, 'shards': instance.shards};
