// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'client_list_item_dto.g.dart';

@JsonSerializable()
class ClientListItemDto {
  const ClientListItemDto({
    required this.id,
    required this.username,
    required this.firstName,
    required this.lastName,
    required this.avatarUrl,
    required this.stateCode,
  });

  factory ClientListItemDto.fromJson(Map<String, Object?> json) =>
      _$ClientListItemDtoFromJson(json);

  final String id;
  final String username;
  final String? firstName;
  final String? lastName;
  final String? avatarUrl;
  final String stateCode;

  Map<String, Object?> toJson() => _$ClientListItemDtoToJson(this);
}
