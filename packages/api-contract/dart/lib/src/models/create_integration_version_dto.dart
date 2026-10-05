// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'create_integration_version_dto.g.dart';

@JsonSerializable()
class CreateIntegrationVersionDto {
  const CreateIntegrationVersionDto({
    required this.values,
    this.slot,
    this.label,
  });

  factory CreateIntegrationVersionDto.fromJson(Map<String, Object?> json) =>
      _$CreateIntegrationVersionDtoFromJson(json);

  /// Field → value. A blank secret keeps the value of the newest version.
  final Map<String, String> values;

  /// Owner 2026-10-05: key set ("main" by default). A new name adds another set (backup key, second account).
  final String? slot;
  final String? label;

  Map<String, Object?> toJson() => _$CreateIntegrationVersionDtoToJson(this);
}
