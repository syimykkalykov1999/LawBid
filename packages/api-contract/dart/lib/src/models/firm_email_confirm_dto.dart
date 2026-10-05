// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'firm_email_confirm_dto.g.dart';

@JsonSerializable()
class FirmEmailConfirmDto {
  const FirmEmailConfirmDto({required this.code});

  factory FirmEmailConfirmDto.fromJson(Map<String, Object?> json) =>
      _$FirmEmailConfirmDtoFromJson(json);

  final String code;

  Map<String, Object?> toJson() => _$FirmEmailConfirmDtoToJson(this);
}
