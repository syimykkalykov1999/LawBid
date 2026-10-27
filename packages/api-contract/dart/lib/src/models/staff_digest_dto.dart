// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'staff_digest_numbers_dto.dart';

part 'staff_digest_dto.g.dart';

@JsonSerializable()
class StaffDigestDto {
  const StaffDigestDto({
    required this.weekStart,
    required this.numbers,
    required this.createdAt,
  });

  factory StaffDigestDto.fromJson(Map<String, Object?> json) =>
      _$StaffDigestDtoFromJson(json);

  /// Monday of the week.
  final String weekStart;
  final StaffDigestNumbersDto numbers;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$StaffDigestDtoToJson(this);
}
