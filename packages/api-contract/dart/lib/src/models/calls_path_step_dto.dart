// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'calls_path_step_dto.g.dart';

@JsonSerializable()
class CallsPathStepDto {
  const CallsPathStepDto({required this.ok, required this.ms, this.error});

  factory CallsPathStepDto.fromJson(Map<String, Object?> json) =>
      _$CallsPathStepDtoFromJson(json);

  final bool ok;

  /// Milliseconds.
  final int ms;
  final String? error;

  Map<String, Object?> toJson() => _$CallsPathStepDtoToJson(this);
}
