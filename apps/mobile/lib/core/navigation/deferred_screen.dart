import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';

/// Owner 2026-10-23 (web speed pass): a screen whose code is a *deferred
/// library* (`import '...' deferred as x`). On the web the first download is
/// then only the shell and the first screens; a rarely used screen (calls,
/// stories, verification, settings...) arrives the first time it is opened
/// — one small file from the CDN, cached for good afterwards. On the
/// phones `loadLibrary` completes at once (everything is in the app), so
/// nothing changes there.
///
/// Owner bug 2026-10-28 (Archive opened a grey screen): Dart loads a
/// deferred library *per importing prefix*. The same screen file imported
/// `deferred as x` in two places has two prefixes, and each must have its
/// own `loadLibrary()` completed before its classes are touched. An earlier
/// version cached "loaded" by [id], so after one prefix loaded the other
/// route built at once and crashed in `_checkLoaded`.
///
/// Now the cache is keyed by the [load] function itself (`x.loadLibrary`
/// of ONE prefix), the pattern of the official Flutter Gallery
/// (flutter/gallery `lib/deferred_widget.dart`, BSD-3, commit d030f1e):
/// a prefix that already loaded builds on the very first frame, any other
/// prefix (or an unknown loader) is always awaited first. [id] is only a
/// readable name (keys, tests), never a cache key.
class DeferredScreen extends ConsumerStatefulWidget {
  const DeferredScreen({
    required this.id,
    required this.load,
    required this.builder,
    super.key,
  });

  final String id;
  final Future<void> Function() load;
  final WidgetBuilder builder;

  /// One in-flight / finished load per loader (= per deferred prefix).
  static final Map<Future<void> Function(), Future<void>> _loaders = {};

  /// Loaders (prefixes) that finished loading in this session.
  static final Set<Future<void> Function()> _loaded = {};

  /// Whether this exact loader (prefix) has finished loading.
  @visibleForTesting
  static bool isLoaded(Future<void> Function() load) => _loaded.contains(load);

  /// Starts loading a library ahead of time (idle prefetch); safe to call
  /// again and to ignore the result. Only the SAME loader counts as loaded.
  static Future<void> prefetch(String id, Future<void> Function() load) =>
      _preload(load);

  static Future<void> _preload(Future<void> Function() load) =>
      _loaders.putIfAbsent(
        load,
        () => Future<void>.sync(load).then((_) {
          _loaded.add(load);
        }).catchError((Object e, StackTrace s) {
          // A failed download may be retried later.
          _loaders.remove(load);
          Error.throwWithStackTrace(e, s);
        }),
      );

  @override
  ConsumerState<DeferredScreen> createState() => _DeferredScreenState();
}

class _DeferredScreenState extends ConsumerState<DeferredScreen> {
  bool _failed = false;
  bool _showSpinner = false;
  Timer? _spinnerTimer;

  late bool _ready = DeferredScreen.isLoaded(widget.load);

  @override
  void initState() {
    super.initState();
    if (!_ready) _start();
  }

  @override
  void didUpdateWidget(DeferredScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    // A different loader (another prefix) must be loaded on its own.
    if (oldWidget.load != widget.load &&
        !DeferredScreen.isLoaded(widget.load)) {
      _ready = false;
      _start();
    }
  }

  void _start() {
    _failed = false;
    _showSpinner = false;
    // A fast load shows nothing in between; a slow one a spinner.
    _spinnerTimer?.cancel();
    _spinnerTimer = Timer(const Duration(milliseconds: 250), () {
      if (mounted) setState(() => _showSpinner = true);
    });
    unawaited(
      DeferredScreen._preload(widget.load).then((_) {
        if (mounted) setState(() => _ready = true);
      }).catchError((Object _) {
        if (mounted) setState(() => _failed = true);
      }),
    );
  }

  @override
  void dispose() {
    _spinnerTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_ready) {
      _spinnerTimer?.cancel();
      return widget.builder(context);
    }
    // A fast load shows only the theme's page colour (no flash of bars,
    // never white in a dark theme — owner 2026-10-28).
    final pageColor = Theme.of(context).scaffoldBackgroundColor;
    if (!_failed && !_showSpinner) {
      return ColoredBox(
        key: const ValueKey('deferred-placeholder'),
        color: pageColor,
      );
    }
    final t = ref.watch(translatorProvider);
    return Scaffold(
      backgroundColor: pageColor,
      appBar: AppBar(
        backgroundColor: pageColor,
        elevation: 0,
        scrolledUnderElevation: 0,
        leading: const BackButton(),
      ),
      body: _failed
          ? AppErrorState(
              message: t.t('error.default.message'),
              retryLabel: t.t('error.retry'),
              onRetry: () => setState(_start),
            )
          : const Center(child: CircularProgressIndicator.adaptive()),
    );
  }
}
