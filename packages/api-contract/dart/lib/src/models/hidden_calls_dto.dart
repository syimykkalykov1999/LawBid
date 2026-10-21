// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'hidden_calls_dto.g.dart';

@JsonSerializable()
class HiddenCallsDto {
  const HiddenCallsDto({required this.count});

  factory HiddenCallsDto.fromJson(Map<String, Object?> json) =>
      _$HiddenCallsDtoFromJson(json);

  /// Calls taken off the list.
  final int count;

  Map<String, Object?> toJson() => _$HiddenCallsDtoToJson(this);
}
