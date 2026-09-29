// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'contact_method.dart';

part 'client_contacts_dto.g.dart';

@JsonSerializable()
class ClientContactsDto {
  const ClientContactsDto({
    required this.caseId,
    required this.bidId,
    required this.firstName,
    required this.lastName,
    required this.phone,
    required this.email,
    required this.contactMethod,
    required this.contactNote,
    required this.disclosedAt,
  });

  factory ClientContactsDto.fromJson(Map<String, Object?> json) =>
      _$ClientContactsDtoFromJson(json);

  final String caseId;
  final String bidId;
  final String? firstName;
  final String? lastName;

  /// E.164.
  final String? phone;
  final String? email;
  final ContactMethod? contactMethod;

  /// The client’s note on when to be contacted.
  final String? contactNote;

  /// When the contacts were first disclosed (the accept transaction, §8.2).
  final DateTime disclosedAt;

  Map<String, Object?> toJson() => _$ClientContactsDtoToJson(this);
}
