// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_client_badge_reason_dto.g.dart';

@JsonSerializable()
class AdminClientBadgeReasonDto {
  const AdminClientBadgeReasonDto({required this.reason});

  factory AdminClientBadgeReasonDto.fromJson(Map<String, Object?> json) =>
      _$AdminClientBadgeReasonDtoFromJson(json);

  final String reason;

  Map<String, Object?> toJson() => _$AdminClientBadgeReasonDtoToJson(this);
}
