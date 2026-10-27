// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'sms_disclosure_dto.g.dart';

@JsonSerializable()
class SmsDisclosureDto {
  const SmsDisclosureDto({required this.version, required this.text});

  factory SmsDisclosureDto.fromJson(Map<String, Object?> json) =>
      _$SmsDisclosureDtoFromJson(json);

  final String version;
  final String text;

  Map<String, Object?> toJson() => _$SmsDisclosureDtoToJson(this);
}
