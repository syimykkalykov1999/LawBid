// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'private_calls_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PrivateCallsDto _$PrivateCallsDtoFromJson(Map<String, dynamic> json) =>
    PrivateCallsDto(
      items: (json['items'] as List<dynamic>)
          .map((e) => PrivateCallItemDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$PrivateCallsDtoToJson(PrivateCallsDto instance) =>
    <String, dynamic>{'items': instance.items.map((e) => e.toJson()).toList()};
