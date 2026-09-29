// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'dashboard_new_users_dto.g.dart';

@JsonSerializable()
class DashboardNewUsersDto {
  const DashboardNewUsersDto({
    required this.clients24h,
    required this.attorneys24h,
    required this.clients7d,
    required this.attorneys7d,
  });

  factory DashboardNewUsersDto.fromJson(Map<String, Object?> json) =>
      _$DashboardNewUsersDtoFromJson(json);

  final int clients24h;
  final int attorneys24h;
  final int clients7d;
  final int attorneys7d;

  Map<String, Object?> toJson() => _$DashboardNewUsersDtoToJson(this);
}
