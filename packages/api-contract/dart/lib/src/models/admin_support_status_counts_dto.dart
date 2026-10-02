// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_support_status_counts_dto.g.dart';

@JsonSerializable()
class AdminSupportStatusCountsDto {
  const AdminSupportStatusCountsDto({
    required this.open,
    required this.waitingUser,
    required this.resolved,
    required this.closed,
  });

  factory AdminSupportStatusCountsDto.fromJson(Map<String, Object?> json) =>
      _$AdminSupportStatusCountsDtoFromJson(json);

  final num open;
  @JsonKey(name: 'waiting_user')
  final num waitingUser;
  final num resolved;
  final num closed;

  Map<String, Object?> toJson() => _$AdminSupportStatusCountsDtoToJson(this);
}
