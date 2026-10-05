import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Owner 2026-10-05: how many assistants the attorney may add, and their
/// latest request for more.
@immutable
class SeatLimitState {
  const SeatLimitState({
    required this.limit,
    required this.isPersonal,
    this.requestStatus,
    this.requestedSeats,
    this.decisionNote,
  });

  final int limit;
  final bool isPersonal;

  /// 'pending' | 'approved' | 'rejected' of the latest request.
  final String? requestStatus;
  final int? requestedSeats;
  final String? decisionNote;

  bool get hasPending => requestStatus == 'pending';
}

abstract interface class SeatLimitRepository {
  Future<SeatLimitState> state();
  Future<void> request({required int seats, String? note});
}

class ApiSeatLimitRepository implements SeatLimitRepository {
  ApiSeatLimitRepository(Dio dio) : _api = api.BillingClient(dio);

  final api.BillingClient _api;

  @override
  Future<SeatLimitState> state() async {
    final d = (await guardApiCall(_api.seatLimitState)).data;
    final r = d.request;
    return SeatLimitState(
      limit: d.limit,
      isPersonal: d.isPersonal,
      requestStatus: r?.status.json,
      requestedSeats: r?.requestedSeats,
      decisionNote: r?.decisionNote,
    );
  }

  @override
  Future<void> request({required int seats, String? note}) async {
    await guardApiCall(
      () => _api.createSeatLimitRequest(
        body: api.CreateSeatLimitRequestDto(seats: seats, note: note),
      ),
    );
  }
}
