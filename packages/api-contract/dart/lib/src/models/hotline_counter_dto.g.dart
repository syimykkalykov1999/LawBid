// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'hotline_counter_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

HotlineCounterDto _$HotlineCounterDtoFromJson(Map<String, dynamic> json) =>
    HotlineCounterDto(
      key: json['key'] as String,
      lawyers: json['lawyers'] as String,
      clients: json['clients'] as String,
    );

Map<String, dynamic> _$HotlineCounterDtoToJson(HotlineCounterDto instance) =>
    <String, dynamic>{
      'key': instance.key,
      'lawyers': instance.lawyers,
      'clients': instance.clients,
    };
