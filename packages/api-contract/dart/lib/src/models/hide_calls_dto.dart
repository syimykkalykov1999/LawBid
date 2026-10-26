// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'hide_calls_dto.g.dart';

@JsonSerializable()
class HideCallsDto {
  const HideCallsDto({required this.ids});

  factory HideCallsDto.fromJson(Map<String, Object?> json) =>
      _$HideCallsDtoFromJson(json);

  final List<String> ids;

  Map<String, Object?> toJson() => _$HideCallsDtoToJson(this);
}
