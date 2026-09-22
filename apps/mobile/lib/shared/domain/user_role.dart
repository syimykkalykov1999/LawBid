/// The two roles LawBid users can have (file 01 §4.14, onboarding §6.4 of
/// file 07). Role affects bottom-nav *content* only, never route *topology*
/// — see core/navigation/shell/bottom_nav_config.dart and the stage 1.5
/// architecture note in docs/CHANGELOG.md.
///
/// This is a minimal stand-in: the real, full user/session model lands in
/// stage 1.7 with `AuthRepository`/`SessionState`. Nothing here should be
/// extended before then — if a screen needs more than "which role", that's
/// a stage 1.7 concern.
enum UserRole { client, attorney }
