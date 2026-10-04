// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_bulk_skipped_dto.dart';

part 'admin_bulk_result_dto.g.dart';

@JsonSerializable()
class AdminBulkResultDto {
  const AdminBulkResultDto({required this.done, required this.skipped});

  factory AdminBulkResultDto.fromJson(Map<String, Object?> json) =>
      _$AdminBulkResultDtoFromJson(json);

  final List<String> done;

  /// Ids that were missing or not in a state to change.
  final List<AdminBulkSkippedDto> skipped;

  Map<String, Object?> toJson() => _$AdminBulkResultDtoToJson(this);
}
