import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_translator.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';
import 'package:lawbid/features/calls/presentation/call_vote.dart';

import '../helpers/long_locale.dart';
import '../helpers/ux_harness.dart';

/// Owner 2026-10-21: the compact vote strip in a call on a 360 dp phone at
/// text scale 1.1, in the worst case of all languages, right-to-left too.
void main() {
  final locales = <String, (Translator, TextDirection)>{
    'longest': (LongestTranslator(), TextDirection.ltr),
    'de': (ShippedTranslator('de'), TextDirection.ltr),
    'ar': (ShippedTranslator('ar'), TextDirection.rtl),
    'ru': (
      L10nTranslator(language: AppLanguage.ru, cache: const {}),
      TextDirection.ltr,
    ),
  };
  for (final e in locales.entries) {
    for (final candidate in [false, true]) {
      testWidgets('vote strip: ${e.key} target=$candidate', (t) async {
        useNarrowPhone(t);
        final (tr, dir) = e.value;
        final vote = CallVote(
          id: 'v',
          targetId: 'p2',
          startedById: 'p1',
          forCount: 12,
          againstCount: 34,
          voters: 99,
          expiresAt: DateTime.now().add(const Duration(seconds: 30)),
        );
        final call = AppCall(
          id: 'c',
          conversationId: null,
          status: CallStatus.active,
          outgoing: false,
          peer: const CallPeer(id: 'g', isAttorney: false),
          createdAt: DateTime(2026, 10, 21),
          group: true,
          participants: const [
            CallMember(
              userId: 'p2',
              status: CallMemberStatus.joined,
              displayName: 'Maximilian-Alexander Montgomery',
            ),
          ],
        );
        await t.pumpWidget(
          uxApp(
            Directionality(
              textDirection: dir,
              child: Scaffold(
                body: Padding(
                  padding: const EdgeInsets.all(16),
                  child: CallVoteStrip(vote: vote, call: call),
                ),
              ),
            ),
            theme: AppTheme.light(),
            size: narrowPhone,
            textScale: 1.1,
            disableAnimations: true,
            overrides: [
              ...uxOverrides(translator: tr),
              callMyIdProvider.overrideWithValue(candidate ? 'p2' : 'p1'),
            ],
          ),
        );
        await t.pump(const Duration(seconds: 1));
        await t.pumpWidget(const SizedBox());
        await t.pump(const Duration(seconds: 30));
      });
    }
  }
}
