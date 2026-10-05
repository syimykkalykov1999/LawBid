// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'reorder_integration_slots_dto.g.dart';

@JsonSerializable()
class ReorderIntegrationSlotsDto {
  const ReorderIntegrationSlotsDto({required this.slots});

  factory ReorderIntegrationSlotsDto.fromJson(Map<String, Object?> json) =>
      _$ReorderIntegrationSlotsDtoFromJson(json);

  /// Key sets in the order the API tries them.
  final List<String> slots;

  Map<String, Object?> toJson() => _$ReorderIntegrationSlotsDtoToJson(this);
}
