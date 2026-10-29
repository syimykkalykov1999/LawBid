// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'sfu_layer_dto_rid.dart';

part 'sfu_layer_dto.g.dart';

@JsonSerializable()
class SfuLayerDto {
  const SfuLayerDto({
    required this.userId,
    required this.rid,
  });
  
  factory SfuLayerDto.fromJson(Map<String, Object?> json) => _$SfuLayerDtoFromJson(json);
  
  final String userId;
  final SfuLayerDtoRid rid;

  Map<String, Object?> toJson() => _$SfuLayerDtoToJson(this);
}
