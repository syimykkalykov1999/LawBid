// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'support_client_context_dto_platform.dart';

part 'support_client_context_dto.g.dart';

@JsonSerializable()
class SupportClientContextDto {
  const SupportClientContextDto({
    this.appVersion,
    this.buildNumber,
    this.platform,
    this.osVersion,
    this.deviceModel,
    this.language,
    this.theme,
    this.timezone,
    this.route,
    this.userId,
    this.role,
  });
  
  factory SupportClientContextDto.fromJson(Map<String, Object?> json) => _$SupportClientContextDtoFromJson(json);
  
  final String? appVersion;
  final String? buildNumber;
  final SupportClientContextDtoPlatform? platform;
  final String? osVersion;
  final String? deviceModel;
  final String? language;
  final String? theme;
  final String? timezone;

  /// The screen the user came from.
  final String? route;
  final String? userId;
  final String? role;

  Map<String, Object?> toJson() => _$SupportClientContextDtoToJson(this);
}
