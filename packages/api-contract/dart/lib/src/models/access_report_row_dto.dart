// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'access_report_row_dto.g.dart';

@JsonSerializable()
class AccessReportRowDto {
  const AccessReportRowDto({
    required this.adminId,
    required this.adminEmail,
    required this.kind,
    required this.reasonCode,
    required this.count,
  });

  factory AccessReportRowDto.fromJson(Map<String, Object?> json) =>
      _$AccessReportRowDtoFromJson(json);

  final String adminId;
  final String? adminEmail;

  /// chat_messages, message_body, call_metadata, case_files, private_document
  final String kind;
  final String? reasonCode;
  final num count;

  Map<String, Object?> toJson() => _$AccessReportRowDtoToJson(this);
}
