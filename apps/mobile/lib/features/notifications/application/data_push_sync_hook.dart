import 'package:flutter_riverpod/flutter_riverpod.dart';

/// S15-8: the trigger of a "push = go and fetch" sync. A foreground chat push
/// (and, on Android, a data push) calls this with the push's data so the
/// messages are already in place when the chat opens.
///
/// A stub on purpose: the "changes since" endpoint it needs (work package D)
/// is not in this build, so nothing is fetched yet. When that endpoint
/// lands, override this provider with a function that calls it - the call
/// sites need no change. Must never throw.
typedef DataPushSyncHook = Future<void> Function(Map<String, dynamic> data);

final dataPushSyncHookProvider = Provider<DataPushSyncHook>(
  (ref) => (data) async {},
);
