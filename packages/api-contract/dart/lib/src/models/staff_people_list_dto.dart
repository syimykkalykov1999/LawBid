// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'staff_person_dto.dart';

part 'staff_people_list_dto.g.dart';

@JsonSerializable()
class StaffPeopleListDto {
  const StaffPeopleListDto({required this.snapshotDate, required this.items});

  factory StaffPeopleListDto.fromJson(Map<String, Object?> json) =>
      _$StaffPeopleListDtoFromJson(json);

  /// Date of the nightly snapshot shown (null = none yet).
  final String? snapshotDate;
  final List<StaffPersonDto> items;

  Map<String, Object?> toJson() => _$StaffPeopleListDtoToJson(this);
}
