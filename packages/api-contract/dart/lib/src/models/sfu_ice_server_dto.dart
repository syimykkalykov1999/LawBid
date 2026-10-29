// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'sfu_ice_server_dto.g.dart';

@JsonSerializable()
class SfuIceServerDto {
  const SfuIceServerDto({
    required this.urls,
  });
  
  factory SfuIceServerDto.fromJson(Map<String, Object?> json) => _$SfuIceServerDtoFromJson(json);
  
  final List<String> urls;

  Map<String, Object?> toJson() => _$SfuIceServerDtoToJson(this);
}
