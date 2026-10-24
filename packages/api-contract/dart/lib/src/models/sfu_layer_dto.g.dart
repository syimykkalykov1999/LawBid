// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'sfu_layer_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SfuLayerDto _$SfuLayerDtoFromJson(Map<String, dynamic> json) => SfuLayerDto(
  userId: json['userId'] as String,
  rid: SfuLayerDtoRid.fromJson(json['rid'] as String),
);

Map<String, dynamic> _$SfuLayerDtoToJson(SfuLayerDto instance) =>
    <String, dynamic>{'userId': instance.userId, 'rid': instance.rid.toJson()};
