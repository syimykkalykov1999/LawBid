// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'deal_party_dto.g.dart';

@JsonSerializable()
class DealPartyDto {
  const DealPartyDto({
    required this.fullName,
    required this.email,
    required this.username,
  });

  factory DealPartyDto.fromJson(Map<String, Object?> json) =>
      _$DealPartyDtoFromJson(json);

  final String fullName;
  final String? email;
  final String? username;

  Map<String, Object?> toJson() => _$DealPartyDtoToJson(this);
}
