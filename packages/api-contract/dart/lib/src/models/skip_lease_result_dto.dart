// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'skip_lease_result_dto.g.dart';

@JsonSerializable()
class SkipLeaseResultDto {
  const SkipLeaseResultDto({required this.ok, required this.limited});

  factory SkipLeaseResultDto.fromJson(Map<String, Object?> json) =>
      _$SkipLeaseResultDtoFromJson(json);

  final bool ok;

  /// true = the per-hour limit of skips is used up.
  final bool limited;

  Map<String, Object?> toJson() => _$SkipLeaseResultDtoToJson(this);
}
