// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'firm_member_dto_role.dart';
import 'firm_member_dto_status.dart';

part 'firm_member_dto.g.dart';

@JsonSerializable()
class FirmMemberDto {
  const FirmMemberDto({
    required this.attorneyId,
    required this.firstName,
    required this.lastName,
    required this.role,
    required this.status,
    required this.states,
  });

  factory FirmMemberDto.fromJson(Map<String, Object?> json) =>
      _$FirmMemberDtoFromJson(json);

  final String attorneyId;
  final String? firstName;
  final String? lastName;
  final FirmMemberDtoRole role;
  final FirmMemberDtoStatus status;
  final List<String> states;

  Map<String, Object?> toJson() => _$FirmMemberDtoToJson(this);
}
