import 'package:dio/dio.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/request_flags.dart';
import 'package:lawbid/features/client_badge/domain/client_badge_models.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Owner 2026-10-02 — `/verification/client/*`.
class ClientBadgeRepository {
  ClientBadgeRepository(Dio dio) : _api = api.ClientBadgeClient(dio);

  final api.ClientBadgeClient _api;

  Future<ClientBadgeState> me() async =>
      _state((await guardApiCall(_api.getMyClientBadge)).data);

  Future<ClientBadgeState> submit(List<String> fileIds, {String? note}) async =>
      _state(
        (await guardApiCall(
          () => _api.submitClientBadge(
            body: api.SubmitClientBadgeDto(fileIds: fileIds, note: note),
            extras: const {RequestFlags.noRetry: true},
          ),
        ))
            .data,
      );

  /// The Stripe page for the $10/month; open it in the browser.
  Future<Uri> checkout() async {
    final url = (await guardApiCall(
      () => _api.startClientBadgeCheckout(
        extras: const {RequestFlags.createsResource: true},
      ),
    ))
        .data
        .checkoutUrl;
    return Uri.parse(url);
  }

  Future<ClientBadgeState> setCancel({required bool cancel}) async => _state(
        (await guardApiCall(
          cancel ? _api.cancelClientBadge : _api.resumeClientBadge,
        ))
            .data,
      );

  static ClientBadgeState _state(api.ClientBadgeStateDto d) => ClientBadgeState(
        status: ClientBadgeStatus.parse(d.status.json),
        badgeActive: d.badgeActive,
        priceCents: d.priceCents,
        canSubmit: d.canSubmit,
        canSubscribe: d.canSubscribe,
        subscription: d.subscription == null
            ? null
            : ClientBadgeSubscription(
                status: d.subscription!.status.json ?? 'none',
                cancelAtPeriodEnd: d.subscription!.cancelAtPeriodEnd,
                currentPeriodEnd: d.subscription!.currentPeriodEnd == null
                    ? null
                    : DateTime.tryParse(d.subscription!.currentPeriodEnd!),
              ),
        rejectReason: d.rejectReason,
        revokeReason: d.revokeReason,
      );
}
