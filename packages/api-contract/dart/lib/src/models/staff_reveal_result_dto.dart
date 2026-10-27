// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'staff_reveal_result_dto.g.dart';

@JsonSerializable()
class StaffRevealResultDto {
  const StaffRevealResultDto({
    required this.adminId,
    required this.name,
    required this.revealsLeftToday,
    this.email,
  });

  factory StaffRevealResultDto.fromJson(Map<String, Object?> json) =>
      _$StaffRevealResultDtoFromJson(json);

  final String adminId;
  final String name;
  final String? email;

  /// Reveals left today (UTC day).
  final num revealsLeftToday;

  Map<String, Object?> toJson() => _$StaffRevealResultDtoToJson(this);
}
