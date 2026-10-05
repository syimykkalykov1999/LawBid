// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'device_info_dto.dart';

part 'assistant_code_login_dto.g.dart';

@JsonSerializable()
class AssistantCodeLoginDto {
  const AssistantCodeLoginDto({required this.code, this.deviceInfo});

  factory AssistantCodeLoginDto.fromJson(Map<String, Object?> json) =>
      _$AssistantCodeLoginDtoFromJson(json);

  /// The one-time code from the attorney (dashes optional).
  final String code;
  final DeviceInfoDto? deviceInfo;

  Map<String, Object?> toJson() => _$AssistantCodeLoginDtoToJson(this);
}
