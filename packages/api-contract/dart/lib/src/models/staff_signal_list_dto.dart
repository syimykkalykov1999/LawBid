// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'staff_signal_dto.dart';

part 'staff_signal_list_dto.g.dart';

@JsonSerializable()
class StaffSignalListDto {
  const StaffSignalListDto({required this.items});

  factory StaffSignalListDto.fromJson(Map<String, Object?> json) =>
      _$StaffSignalListDtoFromJson(json);

  final List<StaffSignalDto> items;

  Map<String, Object?> toJson() => _$StaffSignalListDtoToJson(this);
}
