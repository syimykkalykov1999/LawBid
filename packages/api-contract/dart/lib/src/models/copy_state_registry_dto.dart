// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'copy_state_registry_dto.g.dart';

@JsonSerializable()
class CopyStateRegistryDto {
  const CopyStateRegistryDto({required this.states});

  factory CopyStateRegistryDto.fromJson(Map<String, Object?> json) =>
      _$CopyStateRegistryDtoFromJson(json);

  final List<String> states;

  Map<String, Object?> toJson() => _$CopyStateRegistryDtoToJson(this);
}
