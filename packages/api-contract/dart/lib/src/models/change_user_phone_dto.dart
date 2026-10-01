// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'change_user_phone_dto.g.dart';

@JsonSerializable()
class ChangeUserPhoneDto {
  const ChangeUserPhoneDto({required this.phone, required this.reason});

  factory ChangeUserPhoneDto.fromJson(Map<String, Object?> json) =>
      _$ChangeUserPhoneDtoFromJson(json);

  final String phone;
  final String reason;

  Map<String, Object?> toJson() => _$ChangeUserPhoneDtoToJson(this);
}
