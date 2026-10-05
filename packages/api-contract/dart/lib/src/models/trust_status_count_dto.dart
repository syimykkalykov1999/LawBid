// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'trust_status_count_dto_status.dart';

part 'trust_status_count_dto.g.dart';

@JsonSerializable()
class TrustStatusCountDto {
  const TrustStatusCountDto({required this.status, required this.attorneys});

  factory TrustStatusCountDto.fromJson(Map<String, Object?> json) =>
      _$TrustStatusCountDtoFromJson(json);

  final TrustStatusCountDtoStatus status;
  final int attorneys;

  Map<String, Object?> toJson() => _$TrustStatusCountDtoToJson(this);
}
