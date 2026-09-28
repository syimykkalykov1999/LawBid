// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'suspend_attorney_dto.g.dart';

@JsonSerializable()
class SuspendAttorneyDto {
  const SuspendAttorneyDto({required this.reason});

  factory SuspendAttorneyDto.fromJson(Map<String, Object?> json) =>
      _$SuspendAttorneyDtoFromJson(json);

  final String reason;

  Map<String, Object?> toJson() => _$SuspendAttorneyDtoToJson(this);
}
