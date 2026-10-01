// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_overview_dto.g.dart';

@JsonSerializable()
class AdminOverviewDto {
  const AdminOverviewDto({
    required this.clients,
    required this.attorneys,
    required this.attorneysVerified,
    required this.assistants,
    required this.subscriptionsMonthly,
    required this.subscriptionsYearly,
    required this.assistantSeats,
    required this.revenue30dCents,
    required this.cases7d,
    required this.bids7d,
    required this.posts7d,
    required this.messages7d,
    required this.calls7d,
    required this.callsMissed7d,
    required this.tasksOpen,
    required this.tasksDone30d,
    required this.requestsPending,
  });

  factory AdminOverviewDto.fromJson(Map<String, Object?> json) =>
      _$AdminOverviewDtoFromJson(json);

  final int clients;
  final int attorneys;
  final int attorneysVerified;
  final int assistants;
  final int subscriptionsMonthly;
  final int subscriptionsYearly;
  final int assistantSeats;
  final int revenue30dCents;
  final int cases7d;
  final int bids7d;
  final int posts7d;
  final int messages7d;
  final int calls7d;
  final int callsMissed7d;
  final int tasksOpen;
  final int tasksDone30d;
  final int requestsPending;

  Map<String, Object?> toJson() => _$AdminOverviewDtoToJson(this);
}
