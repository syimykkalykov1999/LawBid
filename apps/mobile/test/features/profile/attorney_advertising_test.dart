// ignore_for_file: lines_longer_than_80_chars
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/deeplinks/deep_link.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/network/contract_extras.dart';
import 'package:lawbid/features/profile/presentation/screens/attorney_profile_screen.dart';
import 'package:lawbid/features/profile/presentation/widgets/attorney_profile_view.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart';

import '../../helpers/ux_harness.dart';
import 'profile_fakes.dart';

class _NewDto {
  bool get advertisingLabel => true;
  String get publicUrl => 'https://lawbid.dev/attorneys/jane.doe/';
}

class _OldDto {}

/// Owner 2026-10-22 (audit #4 §5 NY Rule 7.1(f), §9): the «Attorney
/// Advertising» label on the profile and on posts when the server says so,
/// and «Share» sends the canonical SEO page with the app link as fallback.
void main() {
  setUpAll(initializeDateFormatting);

  group('contractField', () {
    test('reads a field the DTO has', () {
      expect(
        contractField<bool>(_NewDto(), ContractExtra.advertisingLabel),
        isTrue,
      );
      expect(
        contractField<String>(_NewDto(), ContractExtra.publicUrl),
        'https://lawbid.dev/attorneys/jane.doe/',
      );
    });

    test('null while the contract has no such field', () {
      expect(
        contractField<bool>(_OldDto(), ContractExtra.advertisingLabel),
        isNull,
      );
      expect(contractField<bool>(_NewDto(), ContractExtra.publicUrl), isNull);
    });
  });

  group('share link', () {
    test('canonical public URL from the profile', () {
      expect(
        attorneyShareLink(
          'lawbid.dev',
          'jane.doe',
          publicUrl: 'https://lawbid.dev/attorneys/jane.doe/',
        ),
        'https://lawbid.dev/attorneys/jane.doe/',
      );
    });

    test('falls back to the app path', () {
      expect(
        attorneyShareLink('lawbid.dev', 'jane.doe'),
        'https://lawbid.dev/lawyer/jane.doe',
      );
      expect(
        attorneyShareLink('lawbid.dev', 'jane.doe', publicUrl: ' '),
        'https://lawbid.dev/lawyer/jane.doe',
      );
      expect(
        attorneyShareLink(
          'lawbid.dev',
          'jane.doe',
          publicUrl: 'http://evil.test/x',
        ),
        'https://lawbid.dev/lawyer/jane.doe',
      );
    });

    test('the shared SEO page opens the profile in the app', () {
      expect(
        parseDeepLink(
          Uri.parse('https://lawbid.dev/attorneys/jane.doe/'),
          host: 'lawbid.dev',
        ),
        const ContentDeepLink(ContentKind.lawyer, 'jane.doe'),
      );
    });
  });

  group('label', () {
    Future<void> pumpProfile(WidgetTester tester, {required bool on}) async {
      tester.view.physicalSize = const Size(390, 844) * 3;
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      final wrap = await profileWrapper(
        AppTheme.light(),
        user: clientMe(),
        overrides: profileOverrides(
          attorneys: FakeAttorneyRepo(
            profile: attorneyProfile(advertisingLabel: on),
          ),
        ),
      );
      await tester.pumpWidget(
        wrap(const AttorneyProfileScreen(username: 'jane.doe')),
      );
      await tester.pumpAndSettle();
    }

    testWidgets('on the profile when the server says so', (tester) async {
      await pumpProfile(tester, on: true);
      expect(find.text('Attorney Advertising'), findsOneWidget);
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(Duration.zero);
    });

    testWidgets('not on the profile otherwise', (tester) async {
      await pumpProfile(tester, on: false);
      expect(find.text('Attorney Advertising'), findsNothing);
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(Duration.zero);
    });

    for (final on in [true, false]) {
      testWidgets('post author row: label ${on ? 'shown' : 'hidden'}',
          (t) async {
        await t.pumpWidget(
          uxApp(
            Scaffold(
              body: AuthorHeader(
                author: PostAuthor(
                  id: 'a1',
                  username: 'jane.doe',
                  firstName: 'Jane',
                  lastName: 'Doe',
                  verified: true,
                  advertisingLabel: on,
                ),
                subtitle: 'Licensed Attorney',
                showFollow: false,
              ),
            ),
            theme: AppTheme.light(),
            size: const Size(360, 740),
            overrides: uxOverrides(),
          ),
        );
        await t.pump();
        expect(
          find.text('Attorney Advertising · Licensed Attorney'),
          on ? findsOneWidget : findsNothing,
        );
        expect(
          find.text('Licensed Attorney'),
          on ? findsNothing : findsOneWidget,
        );
        await t.pumpWidget(const SizedBox());
        await t.pump(const Duration(seconds: 10));
      });
    }
  });
}
