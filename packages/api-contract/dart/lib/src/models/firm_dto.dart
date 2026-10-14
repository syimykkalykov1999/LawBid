// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'firm_member_dto.dart';

part 'firm_dto.g.dart';

@JsonSerializable()
class FirmDto {
  const FirmDto({
    required this.id,
    required this.name,
    required this.ownerId,
    required this.states,
    required this.members,
  });

  factory FirmDto.fromJson(Map<String, Object?> json) =>
      _$FirmDtoFromJson(json);

  final String id;
  final String name;
  final String ownerId;
  final List<String> states;
  final List<FirmMemberDto> members;

  Map<String, Object?> toJson() => _$FirmDtoToJson(this);
}
