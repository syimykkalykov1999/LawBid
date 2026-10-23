/// What the browser tells about the tab (the web build only).
enum PageSignal { visible, hidden, online }

/// Outside the browser there is no tab: the app lifecycle and the
/// connectivity plugin say the same things.
Stream<PageSignal> pageSignals() => const Stream<PageSignal>.empty();
