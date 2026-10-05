// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'registry_test_result_dto_result.dart';

part 'registry_test_result_dto.g.dart';

@JsonSerializable()
class RegistryTestResultDto {
  const RegistryTestResultDto({
    required this.result,
    required this.details,
    required this.error,
    required this.testedAt,
  });

  factory RegistryTestResultDto.fromJson(Map<String, Object?> json) =>
      _$RegistryTestResultDtoFromJson(json);

  final RegistryTestResultDtoResult result;
  final dynamic details;
  final String? error;
  final DateTime testedAt;

  Map<String, Object?> toJson() => _$RegistryTestResultDtoToJson(this);
}
