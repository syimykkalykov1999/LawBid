// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'support_client_context_input_dto_platform.dart';

part 'support_client_context_input_dto.g.dart';

@JsonSerializable()
class SupportClientContextInputDto {
  const SupportClientContextInputDto({
    this.appVersion,
    this.buildNumber,
    this.platform,
    this.osVersion,
    this.deviceModel,
    this.language,
    this.theme,
    this.timezone,
    this.route,
  });
  
  factory SupportClientContextInputDto.fromJson(Map<String, Object?> json) => _$SupportClientContextInputDtoFromJson(json);
  
  final String? appVersion;
  final String? buildNumber;
  final SupportClientContextInputDtoPlatform? platform;
  final String? osVersion;
  final String? deviceModel;
  final String? language;
  final String? theme;
  final String? timezone;

  /// The screen the user came from.
  final String? route;

  Map<String, Object?> toJson() => _$SupportClientContextInputDtoToJson(this);
}
