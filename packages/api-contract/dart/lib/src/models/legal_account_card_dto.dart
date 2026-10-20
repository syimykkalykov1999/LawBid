// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'legal_account_card_dto.g.dart';

@JsonSerializable()
class LegalAccountCardDto {
  const LegalAccountCardDto({
    required this.profile,
    required this.usernames,
    required this.counts,
    required this.conversations,
    required this.groups,
    required this.channels,
    required this.sessions,
    required this.holds,
  });

  factory LegalAccountCardDto.fromJson(Map<String, Object?> json) =>
      _$LegalAccountCardDtoFromJson(json);

  final dynamic profile;
  final List<dynamic> usernames;
  final Map<String, num> counts;
  final List<dynamic> conversations;
  final List<dynamic> groups;
  final List<dynamic> channels;
  final List<dynamic> sessions;
  final List<dynamic> holds;

  Map<String, Object?> toJson() => _$LegalAccountCardDtoToJson(this);
}
