// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'staff_create_appeal_dto_kind.dart';

part 'staff_create_appeal_dto.g.dart';

@JsonSerializable()
class StaffCreateAppealDto {
  const StaffCreateAppealDto({
    required this.text,
    this.kind = StaffCreateAppealDtoKind.other,
    this.anonymous = false,
  });

  factory StaffCreateAppealDto.fromJson(Map<String, Object?> json) =>
      _$StaffCreateAppealDtoFromJson(json);

  final StaffCreateAppealDtoKind kind;
  final String text;

  /// Anonymous: the owner reads «автор обжалования №N» instead of your name. The system still keeps who wrote it (retaliation guard).
  final bool anonymous;

  Map<String, Object?> toJson() => _$StaffCreateAppealDtoToJson(this);
}
