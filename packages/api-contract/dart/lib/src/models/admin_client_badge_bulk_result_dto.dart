// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'skipped.dart';

part 'admin_client_badge_bulk_result_dto.g.dart';

@JsonSerializable()
class AdminClientBadgeBulkResultDto {
  const AdminClientBadgeBulkResultDto({
    required this.done,
    required this.skipped,
  });

  factory AdminClientBadgeBulkResultDto.fromJson(Map<String, Object?> json) =>
      _$AdminClientBadgeBulkResultDtoFromJson(json);

  final List<String> done;
  final List<Skipped> skipped;

  Map<String, Object?> toJson() => _$AdminClientBadgeBulkResultDtoToJson(this);
}
