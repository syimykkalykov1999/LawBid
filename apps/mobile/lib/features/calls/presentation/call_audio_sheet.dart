import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/calls/application/call_audio_route.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/presentation/call_controls.dart';

/// Owner 2026-11-04 («как в вацапе»): the speaker button with a headset
/// connected opens where the call's sound can go — Phone · Speaker · the
/// headset by its name — the current one checked. The app's own sheet and
/// rows (the storage screen's picker), nothing new in the design.
Future<void> showCallAudioSheet(BuildContext context) =>
    showAppBottomSheet<void>(
      context: context,
      builder: (_) => const CallAudioSheet(),
    );

class CallAudioSheet extends ConsumerWidget {
  const CallAudioSheet({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final audio = ref.watch(callAudioRouterProvider);
    final c = ref.read(callControllerProvider.notifier);
    return SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (final o in audio.outputs)
            AppListRow(
              key: ValueKey('call-audio-${o.kind.name}-${o.id}'),
              icon: callAudioIcon(o.kind),
              label: callAudioLabel(t, o, web: audio.web),
              selected: o == audio.current,
              showChevron: false,
              onTap: () {
                unawaited(c.selectAudioOutput(o));
                Navigator.of(context).pop();
              },
            ),
        ],
      ),
    );
  }
}

/// A browser names its outputs itself; a phone's are named by kind, a
/// headset by its own name when it has one.
String callAudioLabel(Translator t, CallAudioOutput o, {bool web = false}) {
  if (web && o.label.isNotEmpty) return o.label;
  return switch (o.kind) {
    CallAudioKind.phone => t.t('call.audio.phone'),
    CallAudioKind.speaker => t.t('call.speaker'),
    CallAudioKind.wired ||
    CallAudioKind.bluetooth =>
      o.label.isNotEmpty ? o.label : t.t('call.audio.headphones'),
  };
}
