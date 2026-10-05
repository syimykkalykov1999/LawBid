// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_support_ticket_detail_dto.dart';

part 'support_next_ticket_dto.g.dart';

@JsonSerializable()
class SupportNextTicketDto {
  const SupportNextTicketDto({this.ticket});

  factory SupportNextTicketDto.fromJson(Map<String, Object?> json) =>
      _$SupportNextTicketDtoFromJson(json);

  /// null = the queue is empty.
  final AdminSupportTicketDetailDto? ticket;

  Map<String, Object?> toJson() => _$SupportNextTicketDtoToJson(this);
}
