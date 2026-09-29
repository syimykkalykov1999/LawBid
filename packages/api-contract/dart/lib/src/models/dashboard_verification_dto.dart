// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'dashboard_verification_dto.g.dart';

@JsonSerializable()
class DashboardVerificationDto {
  const DashboardVerificationDto({
    required this.queueSize,
    required this.oldestAgeSeconds,
  });

  factory DashboardVerificationDto.fromJson(Map<String, Object?> json) =>
      _$DashboardVerificationDtoFromJson(json);

  /// submitted + in_review
  final int queueSize;

  /// Age of the oldest waiting request, seconds.
  final int? oldestAgeSeconds;

  Map<String, Object?> toJson() => _$DashboardVerificationDtoToJson(this);
}
