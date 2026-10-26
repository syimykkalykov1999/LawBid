// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'copy_state_registry_result_dto.g.dart';

@JsonSerializable()
class CopyStateRegistryResultDto {
  const CopyStateRegistryResultDto({required this.copied});

  factory CopyStateRegistryResultDto.fromJson(Map<String, Object?> json) =>
      _$CopyStateRegistryResultDtoFromJson(json);

  final List<String> copied;

  Map<String, Object?> toJson() => _$CopyStateRegistryResultDtoToJson(this);
}
