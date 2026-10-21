import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/chat/application/voice_recorder.dart';
import 'package:lawbid/features/chat/presentation/voice_widgets.dart';

import '../../helpers/long_locale.dart';
import '../../helpers/ux_harness.dart';

/// Owner inbox 32: while a voice note records, the clock runs evenly and
/// never resets, the bars move smoothly (eased levels, every frame) and the
/// screen above the strip is not rebuilt on every frame.
class _FakeLevels implements VoiceLevelSource {
  final _ctrl = StreamController<double>.broadcast();
  final List<double> recorded = [];
  Duration now = Duration.zero;

  void emit(double v) {
    recorded.add(v);
    _ctrl.add(v);
  }

  @override
  Stream<double> get levels => _ctrl.stream;

  @override
  List<double> get samples => recorded;

  @override
  Duration get elapsed => now;
}

/// Counts its own builds; `rebuild` re-runs it like a parent setState.
class _Parent extends StatefulWidget {
  const _Parent({required this.child, super.key});

  final Widget Function() child;

  @override
  State<_Parent> createState() => _ParentState();
}

class _ParentState extends State<_Parent> {
  int builds = 0;

  void rebuild() => setState(() {});

  @override
  Widget build(BuildContext context) {
    builds++;
    return widget.child();
  }
}

const _frame = Duration(milliseconds: 16);

VoiceRecordingBar _bar(
  VoiceLevelSource source, {
  bool locked = true,
  bool paused = false,
}) =>
    VoiceRecordingBar(
      source: source,
      locked: locked,
      paused: paused,
      pausedAt: const Duration(seconds: 7),
      waveform: List.filled(kVoiceBars, 40),
      progress: 0.3,
      previewPlaying: paused,
      onCancel: () {},
      onTogglePreview: () {},
      onPause: () {},
      onSeek: paused ? (_) {} : null,
      onResume: paused ? () {} : null,
    );

Widget _app(
  Widget child, {
  AppThemeId theme = AppThemeId.day,
  Translator translator = const StaticTranslatorEn(),
  TextDirection dir = TextDirection.ltr,
  double scale = 1,
}) =>
    uxApp(
      Directionality(
        textDirection: dir,
        child: Scaffold(
          body: Align(
            alignment: Alignment.bottomCenter,
            // The composer around the strip: paddings, gap, send circle.
            child: Padding(
              padding: const EdgeInsets.all(AppSpacing.sm),
              child: Row(
                children: [
                  Expanded(child: child),
                  const SizedBox(width: AppSpacing.xs),
                  const SizedBox.square(dimension: AppSizes.touchTarget + 4),
                ],
              ),
            ),
          ),
        ),
      ),
      theme: AppTheme.of(theme),
      size: narrowPhone,
      textScale: scale,
      overrides: [translatorProvider.overrideWithValue(translator)],
    );

int _clockSeconds(WidgetTester t) {
  final text = t
      .widget<Text>(
        find.descendant(
          of: find.byType(VoiceRecordingClock),
          matching: find.byType(Text),
        ),
      )
      .data!;
  final parts = text.split(':');
  return int.parse(parts[0]) * 60 + int.parse(parts[1]);
}

LiveMeterModel _model(WidgetTester t) => (t
        .widget<CustomPaint>(
          find.descendant(
            of: find.byType(LiveRecordingMeter),
            matching: find.byType(CustomPaint),
          ),
        )
        .painter! as LiveMeterPainter)
    .model;

void main() {
  testWidgets(
      'the clock only grows, also across parent rebuilds, and the '
      'parent is not rebuilt per frame', (t) async {
    useNarrowPhone(t);
    final src = _FakeLevels();
    final parent = GlobalKey<_ParentState>();
    await t.pumpWidget(_app(_Parent(key: parent, child: () => _bar(src))));
    expect(parent.currentState!.builds, 1);

    var last = 0;
    final seen = <int>{};
    for (var i = 1; i <= 400; i++) {
      src.now += _frame;
      if (i.isEven) src.emit((i % 7) / 7);
      if (i % 100 == 0) parent.currentState!.rebuild();
      await t.pump(_frame);
      final s = _clockSeconds(t);
      expect(s, greaterThanOrEqualTo(last), reason: 'frame $i');
      last = s;
      seen.add(s);
    }
    // 400 frames × 16 ms = 6.4 s: every second shown, in order, no reset.
    expect(last, 6);
    expect(seen, {0, 1, 2, 3, 4, 5, 6});
    // Built once plus the four explicit rebuilds: never per frame or level.
    expect(parent.currentState!.builds, 5);
    expect(t.takeException(), isNull);
  });

  testWidgets(
      'the painter gets eased levels and a strip that slides '
      'continuously', (t) async {
    useNarrowPhone(t);
    final src = _FakeLevels();
    await t.pumpWidget(_app(LiveRecordingMeter(source: src)));
    final model = _model(t);
    // Silence first.
    for (var i = 0; i < 10; i++) {
      src.now += _frame;
      await t.pump(_frame);
    }
    expect(model.live, 0);

    // A loud sample: the bar eases up over a few frames, not in one jump.
    src
      ..emit(1)
      ..now += _frame;
    await t.pump(_frame);
    expect(model.live, greaterThan(0));
    expect(model.live, lessThan(0.5));
    final shifts = <double>{};
    var prev = model.live;
    for (var i = 0; i < 40; i++) {
      src.now += _frame;
      await t.pump(_frame);
      expect(model.live, greaterThanOrEqualTo(prev));
      prev = model.live;
      shifts.add((model.shift * 100).roundToDouble());
    }
    expect(model.live, greaterThan(0.95));
    // 50 frames × 16 ms = 800 ms = 10 slots of 80 ms, slid in small steps.
    expect(model.bars.length, 10);
    expect(shifts.length, greaterThan(4));
    for (final s in shifts) {
      expect(s, inInclusiveRange(0, 100));
    }
    // Settled bars keep their eased heights: rising, never a 0 → 1 jump.
    for (var i = 1; i < model.bars.length; i++) {
      expect(model.bars[i], greaterThanOrEqualTo(model.bars[i - 1]));
    }
  });

  testWidgets('the strip starts from what was recorded before the lock',
      (t) async {
    useNarrowPhone(t);
    final src = _FakeLevels()..now = const Duration(milliseconds: 800);
    for (var i = 0; i < 16; i++) {
      src.recorded.add(i / 16);
    }
    await t.pumpWidget(_app(LiveRecordingMeter(source: src)));
    expect(_model(t).bars.length, 10);
    expect(_model(t).live, closeTo(15 / 16, 1e-9));
  });

  final langs = <String, (Translator, TextDirection)>{
    'ru': (const StaticTranslatorRu(), TextDirection.ltr),
    'ne': (ShippedTranslator('ne'), TextDirection.ltr),
    'ar': (ShippedTranslator('ar'), TextDirection.rtl),
  };
  final states = <String, ({bool locked, bool paused})>{
    'hold': (locked: false, paused: false),
    'locked': (locked: true, paused: false),
    'paused': (locked: true, paused: true),
  };
  for (final theme in AppThemeId.values) {
    for (final MapEntry(key: lang, value: (tr, dir)) in langs.entries) {
      for (final scale in [1.0, 1.1]) {
        testWidgets(
            'recording strip fits at 360 dp '
            '(${theme.name}, $lang, x$scale)', (t) async {
          useNarrowPhone(t);
          for (final MapEntry(key: name, value: st) in states.entries) {
            final src = _FakeLevels()..now = const Duration(seconds: 12);
            await t.pumpWidget(
              _app(
                _bar(src, locked: st.locked, paused: st.paused),
                theme: theme,
                translator: tr,
                dir: dir,
                scale: scale,
              ),
            );
            await t.pump(_frame);
            expect(t.takeException(), isNull, reason: name);
            final bar = t.getRect(find.byType(VoiceRecordingBar));
            expect(bar.left, greaterThanOrEqualTo(0), reason: name);
            expect(
              bar.right,
              lessThanOrEqualTo(narrowPhone.width),
              reason: name,
            );
          }
          await t.pumpWidget(const SizedBox());
        });
      }
    }
  }
}
