// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'hotline_counters_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

HotlineCountersDto _$HotlineCountersDtoFromJson(Map<String, dynamic> json) =>
    HotlineCountersDto(
      items: (json['items'] as List<dynamic>)
          .map((e) => HotlineCounterDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$HotlineCountersDtoToJson(HotlineCountersDto instance) =>
    <String, dynamic>{'items': instance.items.map((e) => e.toJson()).toList()};
