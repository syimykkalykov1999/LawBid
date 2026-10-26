// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'firm_email_result_dto.g.dart';

@JsonSerializable()
class FirmEmailResultDto {
  const FirmEmailResultDto({required this.domain});

  factory FirmEmailResultDto.fromJson(Map<String, Object?> json) =>
      _$FirmEmailResultDtoFromJson(json);

  final String domain;

  Map<String, Object?> toJson() => _$FirmEmailResultDtoToJson(this);
}
