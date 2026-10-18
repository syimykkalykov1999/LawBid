import Flutter
import PushKit
import UIKit
import flutter_callkit_incoming

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate, PKPushRegistryDelegate {
  /// Owner 2026-10-17: incoming calls arrive as VoIP (PushKit) pushes so
  /// iOS shows the call screen and rings even when the app is closed.
  private var voipRegistry: PKPushRegistry?

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    let registry = PKPushRegistry(queue: DispatchQueue.main)
    registry.delegate = self
    registry.desiredPushTypes = [.voIP]
    voipRegistry = registry
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
  }

  // MARK: - PushKit

  func pushRegistry(
    _ registry: PKPushRegistry,
    didUpdate credentials: PKPushCredentials,
    for type: PKPushType
  ) {
    guard type == .voIP else { return }
    let token = credentials.token.map { String(format: "%02x", $0) }.joined()
    // Dart reads it (getDevicePushTokenVoIP) and sends it to the server.
    SwiftFlutterCallkitIncomingPlugin.sharedInstance?.setDevicePushTokenVoIP(token)
  }

  func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {
    guard type == .voIP else { return }
    SwiftFlutterCallkitIncomingPlugin.sharedInstance?.setDevicePushTokenVoIP("")
  }

  /// iOS requires every VoIP push to report a call to CallKit at once —
  /// the same fields as the Dart side (callkit_bridge.dart), so a call the
  /// open app also shows is one call (same id).
  func pushRegistry(
    _ registry: PKPushRegistry,
    didReceiveIncomingPushWith payload: PKPushPayload,
    for type: PKPushType,
    completion: @escaping () -> Void
  ) {
    guard type == .voIP else {
      completion()
      return
    }
    let p = payload.dictionaryPayload
    let callId = (p["callId"] as? String) ?? UUID().uuidString
    let name = (p["callerName"] as? String) ?? "LawBid"
    let video = (p["video"] as? String) == "1"
    let data = flutter_callkit_incoming.Data(
      id: callId,
      nameCaller: name,
      handle: "LawBid",
      type: video ? 1 : 0
    )
    data.appName = "LawBid"
    data.duration = 45000
    data.extra = [
      "callId": callId,
      "conversationId": (p["conversationId"] as? String) ?? "",
    ]
    data.handleType = "generic"
    data.supportsVideo = false
    data.maximumCallGroups = 1
    data.maximumCallsPerCallGroup = 1
    data.supportsDTMF = false
    data.supportsHolding = false
    data.isShowMissedCallNotification = false
    // "Calls" switched off in Settings: the call shows without a ringtone.
    if (p["silent"] as? String) == "1" {
      data.ringtonePath = "silence"
    }
    SwiftFlutterCallkitIncomingPlugin.sharedInstance?.showCallkitIncoming(
      data,
      fromPushKit: true
    ) {
      completion()
    }
  }
}
