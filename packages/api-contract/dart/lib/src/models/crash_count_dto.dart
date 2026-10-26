// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'crash_count_dto.g.dart';

@JsonSerializable()
class CrashCountDto {
  const CrashCountDto({required this.value, required this.count});

  factory CrashCountDto.fromJson(Map<String, Object?> json) =>
      _$CrashCountDtoFromJson(json);

  final String value;
  final num count;

  Map<String, Object?> toJson() => _$CrashCountDtoToJson(this);
}
