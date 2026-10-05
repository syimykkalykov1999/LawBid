// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'update_integration_slot_dto.g.dart';

@JsonSerializable()
class UpdateIntegrationSlotDto {
  const UpdateIntegrationSlotDto({this.label, this.enabled});

  factory UpdateIntegrationSlotDto.fromJson(Map<String, Object?> json) =>
      _$UpdateIntegrationSlotDtoFromJson(json);

  final String? label;

  /// Off: the API skips this key set.
  final bool? enabled;

  Map<String, Object?> toJson() => _$UpdateIntegrationSlotDtoToJson(this);
}
