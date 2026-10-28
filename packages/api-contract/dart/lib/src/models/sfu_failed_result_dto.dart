// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'sfu_failed_result_dto.g.dart';

@JsonSerializable()
class SfuFailedResultDto {
  const SfuFailedResultDto({required this.moved, required this.reports});

  factory SfuFailedResultDto.fromJson(Map<String, Object?> json) =>
      _$SfuFailedResultDtoFromJson(json);

  /// The call moved to our own path (now, or before this report came)
  final bool moved;

  /// Members of this call that reported in the last minute
  final num reports;

  Map<String, Object?> toJson() => _$SfuFailedResultDtoToJson(this);
}
