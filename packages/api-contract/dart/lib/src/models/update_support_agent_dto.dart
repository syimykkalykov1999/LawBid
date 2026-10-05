// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'update_support_agent_dto.g.dart';

@JsonSerializable()
class UpdateSupportAgentDto {
  const UpdateSupportAgentDto({this.onShift, this.maxOpen});

  factory UpdateSupportAgentDto.fromJson(Map<String, Object?> json) =>
      _$UpdateSupportAgentDtoFromJson(json);

  final bool? onShift;
  final num? maxOpen;

  Map<String, Object?> toJson() => _$UpdateSupportAgentDtoToJson(this);
}
