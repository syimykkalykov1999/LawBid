// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_remove_member_dto.g.dart';

@JsonSerializable()
class AdminRemoveMemberDto {
  const AdminRemoveMemberDto({required this.reason});

  factory AdminRemoveMemberDto.fromJson(Map<String, Object?> json) =>
      _$AdminRemoveMemberDtoFromJson(json);

  final String reason;

  Map<String, Object?> toJson() => _$AdminRemoveMemberDtoToJson(this);
}
