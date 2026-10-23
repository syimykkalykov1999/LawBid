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
/// [id] names the library: once it has loaded, later opens build the
/// screen on the very first frame (no spinner flash).
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

  /// Libraries that finished loading in this session.
  static final Set<String> _loaded = <String>{};

  /// Starts loading a library ahead of time (idle prefetch); safe to call
  /// again and to ignore the result.
  static Future<void> prefetch(String id, Future<void> Function() load) async {
    if (_loaded.contains(id)) return;
    await load();
    _loaded.add(id);
  }

  @override
  ConsumerState<DeferredScreen> createState() => _DeferredScreenState();
}

class _DeferredScreenState extends ConsumerState<DeferredScreen> {
  bool _failed = false;
  bool _showSpinner = false;
  Timer? _spinnerTimer;

  bool get _ready => DeferredScreen._loaded.contains(widget.id);

  @override
  void initState() {
    super.initState();
    if (!_ready) _start();
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
      DeferredScreen.prefetch(widget.id, widget.load).then((_) {
        if (mounted) setState(() {});
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
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    // A fast load shows only the page colour (no flash of bars).
    if (!_failed && !_showSpinner) return ColoredBox(color: colors.bg);
    final t = ref.watch(translatorProvider);
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppBar(
        backgroundColor: colors.bg,
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
