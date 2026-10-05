// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_seat_limit_dto.g.dart';

@JsonSerializable()
class AdminSeatLimitDto {
  const AdminSeatLimitDto({required this.limit});

  factory AdminSeatLimitDto.fromJson(Map<String, Object?> json) =>
      _$AdminSeatLimitDtoFromJson(json);

  final int? limit;

  Map<String, Object?> toJson() => _$AdminSeatLimitDtoToJson(this);
}
