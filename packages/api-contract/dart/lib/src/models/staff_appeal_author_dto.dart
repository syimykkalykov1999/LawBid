// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'staff_appeal_author_dto.g.dart';

@JsonSerializable()
class StaffAppealAuthorDto {
  const StaffAppealAuthorDto({
    required this.adminId,
    required this.label,
    required this.anonymous,
  });

  factory StaffAppealAuthorDto.fromJson(Map<String, Object?> json) =>
      _$StaffAppealAuthorDtoFromJson(json);

  /// null while the author is anonymous (and for the list).
  final String? adminId;

  /// Name, or «автор обжалования №N».
  final String label;
  final bool anonymous;

  Map<String, Object?> toJson() => _$StaffAppealAuthorDtoToJson(this);
}
