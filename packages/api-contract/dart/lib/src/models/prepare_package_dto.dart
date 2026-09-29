// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'prepare_package_dto_sections.dart';

part 'prepare_package_dto.g.dart';

@JsonSerializable()
class PreparePackageDto {
  const PreparePackageDto({required this.userId, required this.sections});

  factory PreparePackageDto.fromJson(Map<String, Object?> json) =>
      _$PreparePackageDtoFromJson(json);

  /// The user the request concerns.
  final String userId;

  /// Only what the request covers.
  final List<PreparePackageDtoSections> sections;

  Map<String, Object?> toJson() => _$PreparePackageDtoToJson(this);
}
