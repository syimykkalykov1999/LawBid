// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'pins_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PinsDto _$PinsDtoFromJson(Map<String, dynamic> json) => PinsDto(
  items: (json['items'] as List<dynamic>)
      .map((e) => MessageDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  editWindowMin: json['editWindowMin'] as num,
  deleteForAllHours: json['deleteForAllHours'] as num,
  maxPins: json['maxPins'] as num,
);

Map<String, dynamic> _$PinsDtoToJson(PinsDto instance) => <String, dynamic>{
  'items': instance.items.map((e) => e.toJson()).toList(),
  'editWindowMin': instance.editWindowMin,
  'deleteForAllHours': instance.deleteForAllHours,
  'maxPins': instance.maxPins,
};
