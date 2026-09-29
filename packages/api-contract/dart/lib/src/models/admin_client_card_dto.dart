// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_client_card_dto.g.dart';

@JsonSerializable()
class AdminClientCardDto {
  const AdminClientCardDto({
    required this.stateCode,
    required this.preferredContactMethod,
    required this.preferredLanguages,
  });

  factory AdminClientCardDto.fromJson(Map<String, Object?> json) =>
      _$AdminClientCardDtoFromJson(json);

  final String stateCode;
  final String? preferredContactMethod;
  final List<String> preferredLanguages;

  Map<String, Object?> toJson() => _$AdminClientCardDtoToJson(this);
}
