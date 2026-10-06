// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'dmca_agent_dto.g.dart';

@JsonSerializable()
class DmcaAgentDto {
  const DmcaAgentDto({
    required this.name,
    required this.email,
    required this.address,
  });

  factory DmcaAgentDto.fromJson(Map<String, Object?> json) =>
      _$DmcaAgentDtoFromJson(json);

  /// Empty until registered with the Copyright Office.
  final String name;
  final String email;
  final String address;

  Map<String, Object?> toJson() => _$DmcaAgentDtoToJson(this);
}
