// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'data_package_dto_sections.dart';

part 'data_package_dto.g.dart';

@JsonSerializable()
class DataPackageDto {
  const DataPackageDto({
    required this.requestId,
    required this.referenceNumber,
    required this.preparedAt,
    required this.sections,
    required this.data,
    required this.loggedEntities,
  });

  factory DataPackageDto.fromJson(Map<String, Object?> json) =>
      _$DataPackageDtoFromJson(json);

  final String requestId;
  final String referenceNumber;
  final DateTime preparedAt;
  final List<DataPackageDtoSections> sections;

  /// One key per section.
  final dynamic data;

  /// data_access_log rows written.
  final int loggedEntities;

  Map<String, Object?> toJson() => _$DataPackageDtoToJson(this);
}
