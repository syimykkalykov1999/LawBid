// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_step_up_dto.g.dart';

@JsonSerializable()
class AdminStepUpDto {
  const AdminStepUpDto({this.code, this.password});

  factory AdminStepUpDto.fromJson(Map<String, Object?> json) =>
      _$AdminStepUpDtoFromJson(json);

  /// The 6-digit authenticator code.
  final String? code;

  /// The admin’s own password (when two-factor is off).
  final String? password;

  Map<String, Object?> toJson() => _$AdminStepUpDtoToJson(this);
}
