import 'package:flutter/material.dart';

/// Shared [RouteObserver], registered on `MaterialApp.router(observers: [...])`
/// in app.dart. Any widget that needs to know "is my screen still the
/// visible route" (e.g. `ScalesLogo` pausing its swing animation) subscribes
/// to this via [RouteAware] rather than each inventing its own visibility
/// tracking.
final routeObserver = RouteObserver<PageRoute<void>>();
