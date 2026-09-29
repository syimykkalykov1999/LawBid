// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'update_config_dto.g.dart';

@JsonSerializable()
class UpdateConfigDto {
  const UpdateConfigDto({required this.value});

  factory UpdateConfigDto.fromJson(Map<String, Object?> json) =>
      _$UpdateConfigDtoFromJson(json);

  /// Validated against the key schema (type, min/max, items).
  final dynamic value;

  Map<String, Object?> toJson() => _$UpdateConfigDtoToJson(this);
}
