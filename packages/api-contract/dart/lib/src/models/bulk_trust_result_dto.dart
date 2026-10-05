// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'bulk_trust_result_dto.g.dart';

@JsonSerializable()
class BulkTrustResultDto {
  const BulkTrustResultDto({required this.done, required this.failed});

  factory BulkTrustResultDto.fromJson(Map<String, Object?> json) =>
      _$BulkTrustResultDtoFromJson(json);

  final int done;
  final List<String> failed;

  Map<String, Object?> toJson() => _$BulkTrustResultDtoToJson(this);
}
