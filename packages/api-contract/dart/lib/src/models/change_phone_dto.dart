// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'change_phone_dto.g.dart';

@JsonSerializable()
class ChangePhoneDto {
  const ChangePhoneDto({required this.phone});

  factory ChangePhoneDto.fromJson(Map<String, Object?> json) =>
      _$ChangePhoneDtoFromJson(json);

  final String phone;

  Map<String, Object?> toJson() => _$ChangePhoneDtoToJson(this);
}
