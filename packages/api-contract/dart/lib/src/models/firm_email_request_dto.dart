// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'firm_email_request_dto.g.dart';

@JsonSerializable()
class FirmEmailRequestDto {
  const FirmEmailRequestDto({required this.email});

  factory FirmEmailRequestDto.fromJson(Map<String, Object?> json) =>
      _$FirmEmailRequestDtoFromJson(json);

  /// Your address at the firm (not a free mailbox).
  final String email;

  Map<String, Object?> toJson() => _$FirmEmailRequestDtoToJson(this);
}
