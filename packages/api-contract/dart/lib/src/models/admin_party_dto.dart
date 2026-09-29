// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_party_dto.g.dart';

@JsonSerializable()
class AdminPartyDto {
  const AdminPartyDto({
    required this.id,
    required this.role,
    required this.status,
    required this.firstName,
    required this.lastName,
    required this.username,
  });

  factory AdminPartyDto.fromJson(Map<String, Object?> json) =>
      _$AdminPartyDtoFromJson(json);

  final String id;
  final String? role;
  final String status;
  final String? firstName;
  final String? lastName;
  final String? username;

  Map<String, Object?> toJson() => _$AdminPartyDtoToJson(this);
}
