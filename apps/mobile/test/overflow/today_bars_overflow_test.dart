import 'package:flutter/material.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_translator.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/data/calls_repository.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';
import 'package:lawbid/features/calls/presentation/call_invite_bar.dart';
import 'package:lawbid/features/calls/presentation/call_rejoin.dart';
import 'package:lawbid/features/chat/application/voice_player.dart';
import 'package:lawbid/features/chat/presentation/voice_widgets.dart';

import '../helpers/long_locale.dart';
import '../helpers/ux_harness.dart';

/// Owner 2026-10-21: the thin bars added on the Samsung pass, «Group call ·
/// N · Return» under the status bar and the playing-voice mini player, on a
/// 360 dp phone at text scale 1 and 1.1, in the longest translation, German,
/// Nepali, Marathi, Russian and Arabic (right-to-left), in all four themes.
/// Nothing may overflow.
class _Calls implements CallsRepository {
  @override
  Future<AppCall?> groupCall(String groupId) async => AppCall(
        id: 'c',
        conversationId: null,
        status: CallStatus.active,
        outgoing: false,
        peer: const CallPeer(id: 'g', isAttorney: false),
        createdAt: DateTime(2026, 10, 21),
        group: true,
        participants: [
          for (var i = 0; i < 7; i++)
            CallMember(
              userId: 'p$i',
              status: CallMemberStatus.joined,
              displayName: 'Maximilian-Alexander Montgomery $i',
            ),
        ],
      );

  @override
  dynamic noSuchMethod(Invocation invocation) => Future<void>.value();
}

class _Playing extends VoicePlayer {
  @override
  VoicePlayback build() => const VoicePlayback(
        messageId: 'm1',
        playing: true,
        position: Duration(minutes: 12, seconds: 34),
        durationMs: 3599000,
        speed: 1.5,
        title: 'Maximilian-Alexander Montgomery-Wellington',
        threadId: 't1',
      );
}

void main() {
  final locales = <String, (Translator, TextDirection)>{
    'longest': (LongestTranslator(), TextDirection.ltr),
    'longest rtl': (LongestTranslator(), TextDirection.rtl),
    'de': (ShippedTranslator('de'), TextDirection.ltr),
    'ne': (ShippedTranslator('ne'), TextDirection.ltr),
    'mr': (ShippedTranslator('mr'), TextDirection.ltr),
    'ar': (ShippedTranslator('ar'), TextDirection.rtl),
    'ru': (
      L10nTranslator(language: AppLanguage.ru, cache: const {}),
      TextDirection.ltr,
    ),
  };
  for (final id in AppThemeId.values) {
    for (final scale in [1.0, 1.1]) {
      for (final e in locales.entries) {
        for (final bar in ['rejoin', 'voice mini player', 'invite']) {
          testWidgets('$bar: ${id.name} ${e.key} x$scale', (t) async {
            useNarrowPhone(t);
            final (tr, dir) = e.value;
            final overrides = <Override>[
              ...uxOverrides(translator: tr),
              callMyIdProvider.overrideWithValue('p0'),
              callsRepositoryProvider.overrideWithValue(_Calls()),
              voicePlayerProvider.overrideWith(_Playing.new),
            ];
            await t.pumpWidget(
              uxApp(
                Directionality(
                  textDirection: dir,
                  child: Scaffold(
                    body: Column(
                      children: [
                        if (bar == 'rejoin')
                          const CallRejoinBar(
                            rejoin: GroupRejoin(
                              groupId: 'g',
                              title: 'Maximilian-Alexander Montgomery',
                            ),
                          )
                        else if (bar == 'invite')
                          const CallInviteBar(
                            invite: CallInvite(
                              callId: 'c',
                              who: 'Maximilian-Alexander Montgomery',
                              title: 'Maximilian-Alexander Montgomery',
                              groupId: 'g',
                              video: true,
                            ),
                          )
                        else
                          VoiceMiniPlayer(onOpen: (_) {}),
                      ],
                    ),
                  ),
                ),
                theme: AppTheme.of(id),
                size: narrowPhone,
                textScale: scale,
                disableAnimations: true,
                overrides: overrides,
              ),
            );
            await t.pump(const Duration(milliseconds: 500));
            expect(t.takeException(), isNull);
            // The bar is really on screen (not an empty box).
            expect(find.byType(Text), findsWidgets);
            await t.pumpWidget(const SizedBox());
            await t.pump(const Duration(seconds: 30));
          });
        }
      }
    }
  }
}
