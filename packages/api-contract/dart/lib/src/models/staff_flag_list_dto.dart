// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'staff_retaliation_flag_dto.dart';

part 'staff_flag_list_dto.g.dart';

@JsonSerializable()
class StaffFlagListDto {
  const StaffFlagListDto({required this.items});

  factory StaffFlagListDto.fromJson(Map<String, Object?> json) =>
      _$StaffFlagListDtoFromJson(json);

  final List<StaffRetaliationFlagDto> items;

  Map<String, Object?> toJson() => _$StaffFlagListDtoToJson(this);
}
