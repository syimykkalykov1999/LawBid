// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'support_next_ticket_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SupportNextTicketDto _$SupportNextTicketDtoFromJson(
  Map<String, dynamic> json,
) => SupportNextTicketDto(
  ticket: json['ticket'] == null
      ? null
      : AdminSupportTicketDetailDto.fromJson(
          json['ticket'] as Map<String, dynamic>,
        ),
);

Map<String, dynamic> _$SupportNextTicketDtoToJson(
  SupportNextTicketDto instance,
) => <String, dynamic>{'ticket': ?instance.ticket?.toJson()};
