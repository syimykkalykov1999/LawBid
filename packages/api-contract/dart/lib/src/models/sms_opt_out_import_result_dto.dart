// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'sms_opt_out_import_result_dto.g.dart';

@JsonSerializable()
class SmsOptOutImportResultDto {
  const SmsOptOutImportResultDto({required this.added, required this.skipped});

  factory SmsOptOutImportResultDto.fromJson(Map<String, Object?> json) =>
      _$SmsOptOutImportResultDtoFromJson(json);

  final num added;
  final num skipped;

  Map<String, Object?> toJson() => _$SmsOptOutImportResultDtoToJson(this);
}
