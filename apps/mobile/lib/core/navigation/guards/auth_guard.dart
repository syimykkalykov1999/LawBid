import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

/// Route-level redirect guard (file 01 §5.1: "redirect-guards по роли/статусу").
///
/// STUB for stage 1.5: always allows navigation (`null` = no redirect). Real
/// auth/session/role checks land in stage 1.7 once `SessionState`/
/// `AuthRepository` exist. This function's signature is the seam stage 1.7
/// fills in — `app_router.dart`'s `redirect:` wiring already points at it,
/// so the router doesn't need restructuring when real logic arrives.
String? authGuardRedirect(BuildContext context, GoRouterState state) => null;
