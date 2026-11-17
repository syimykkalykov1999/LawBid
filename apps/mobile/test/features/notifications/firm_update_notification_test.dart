import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/notifications/data/notifications_repository.dart';
import 'package:lawbid/features/notifications/presentation/notifications_view.dart';

/// Firms audit 16.11: a firm's news says what happened (`notif.firm.<kind>`)
/// and opens the bid sent in my name, or «Моя фирма».
void main() {
  AppNotification n(Map<String, Object?> payload) => AppNotification(
        id: 'n1',
        type: 'firm_update',
        category: NotifCategory.system,
        payload: payload,
        actor: const NotifActor(displayName: 'Ann Lee'),
        aggregateCount: 1,
        createdAt: DateTime(2026, 11, 16),
      );

  test('a bid sent in my name says so', () {
    expect(
      notificationText(
        const StaticTranslatorRu(),
        n({'kind': 'bid_sent_for_you', 'bidId': 'b1'}),
      ),
      'Владелец фирмы отправил бид от вашего имени',
    );
    expect(
      notificationText(
        const StaticTranslatorEn(),
        n({'kind': 'bid_sent_for_you', 'bidId': 'b1'}),
      ),
      'The firm owner sent a bid in your name',
    );
  });

  test('it opens the bid, else «Моя фирма»', () {
    expect(
      notificationRoute(
        type: 'firm_update',
        payload: {'kind': 'bid_sent_for_you', 'bidId': 'b1'},
        attorney: true,
      ),
      AppRoutes.bid('b1'),
    );
    expect(
      notificationRoute(
        type: 'firm_update',
        payload: {'kind': 'invite'},
        attorney: true,
      ),
      AppRoutes.myFirm,
    );
  });
}
