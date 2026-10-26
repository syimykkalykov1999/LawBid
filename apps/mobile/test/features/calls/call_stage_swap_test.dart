import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart' show MediaStream;
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/application/call_video_layout.dart';
import 'package:lawbid/features/calls/presentation/call_screen.dart';
import 'package:lawbid/features/calls/presentation/call_widgets.dart';

import '../../helpers/ux_harness.dart';
import 'call_screen_fakes.dart';

/// Owner 2026-10-26 (UI-01): the SFU → mesh swap is invisible on screen —
/// every picture keeps its renderer and only the stream underneath changes;
/// no tile falls back to the avatar, no renderer is remounted (a black box).
class _Media extends FakeCallMedia {
  _Media()
      : local = ValueNotifier(FakeStream('me-sfu')),
        remotes = ValueNotifier({
          'u1': FakeStream('u1-sfu'),
          'u2': FakeStream('u2-sfu'),
        });

  final ValueNotifier<MediaStream?> local;
  final ValueNotifier<Map<String, MediaStream>> remotes;

  @override
  ValueListenable<MediaStream?> get localVideo => local;
  @override
  ValueListenable<Map<String, MediaStream>> get remoteStreams => remotes;
}

/// Counts renderer mounts and the stream each shows.
class _Surface extends StatefulWidget {
  const _Surface(this.stream);
  final MediaStream stream;
  static int mounted = 0;
  static int disposed = 0;

  @override
  State<_Surface> createState() => _SurfaceState();
}

class _SurfaceState extends State<_Surface> {
  @override
  void initState() {
    super.initState();
    _Surface.mounted++;
  }

  @override
  void dispose() {
    _Surface.disposed++;
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => ColoredBox(
        color: Colors.teal,
        child: Text(
          widget.stream.id,
          key: ValueKey('shown-${widget.stream.id}'),
        ),
      );
}

void main() {
  testWidgets(
      'a group video call: the streams change underneath (the swap) — the '
      'same renderers stay mounted, no avatar in between', (tester) async {
    tester.view
      ..physicalSize = const Size(390, 844) * 3
      ..devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    _Surface.mounted = 0;
    _Surface.disposed = 0;
    final media = _Media();
    final s = callSessionGroup(3, video: true);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ...uxOverrides(),
          callMyIdProvider.overrideWithValue('u0'),
          callControllerProvider
              .overrideWith(() => FixedCallController(s, media)),
          callVideoLayoutProvider
              .overrideWith(() => FixedLayout(const CallVideoLayout())),
          callVideoSurfaceProvider.overrideWithValue(
            (stream, {mirror = false}) => _Surface(stream),
          ),
        ],
        child: MaterialApp(
          theme: AppTheme.of(AppThemeId.values.first),
          home: const CallScreen(),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(_Surface.mounted, 3);
    expect(find.byKey(const ValueKey('shown-u1-sfu')), findsOneWidget);
    expect(find.byKey(const ValueKey('avatar')), findsNothing);

    // The swap: new streams for the same people.
    media.remotes.value = {
      'u1': FakeStream('u1-mesh'),
      'u2': FakeStream('u2-mesh'),
    };
    media.local.value = FakeStream('me-mesh');
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.byKey(const ValueKey('shown-u1-mesh')), findsOneWidget);
    expect(find.byKey(const ValueKey('shown-u2-mesh')), findsOneWidget);
    expect(find.byKey(const ValueKey('shown-me-mesh')), findsOneWidget);
    // Not one renderer thrown away or made anew; no avatar shown.
    expect(_Surface.mounted, 3);
    expect(_Surface.disposed, 0);
    expect(find.byKey(const ValueKey('avatar')), findsNothing);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(const Duration(seconds: 5));
  });
}
