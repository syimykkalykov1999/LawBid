// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'sms_opt_out_import_dto.g.dart';

@JsonSerializable()
class SmsOptOutImportDto {
  const SmsOptOutImportDto({required this.phones});

  factory SmsOptOutImportDto.fromJson(Map<String, Object?> json) =>
      _$SmsOptOutImportDtoFromJson(json);

  /// E.164 numbers from the Twilio opt-out export (up to 1000).
  final List<String> phones;

  Map<String, Object?> toJson() => _$SmsOptOutImportDtoToJson(this);
}
