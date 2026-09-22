/// The 2 languages the stopgap [Translator] layer supports (owner request,
/// 2026-09-22) — a real, backend-driven language list is stage 1.6 (file 01
/// §15), which can add more than these 2 without touching call sites of
/// [AppLanguage].
enum AppLanguage { ru, en }
