import AVFoundation
import Foundation

#if canImport(Flutter)
  import Flutter
  import UIKit
#endif

/// Owner rows 101/102 (13.11, «качество фото упало от старого сжатия —
/// проверить всё»): the iPhone's video re-encode. Before, iOS used the
/// `video_compress` plugin's `AVAssetExportSession` presets (1280×720 /
/// 1920×1080), which choose their own bitrate — no admin control, no
/// High profile, and the moov box at the end of the file. Now the encode
/// goes through `NextLevelSessionExporter` 1.0.1 (MIT, copied unmodified
/// into `NextLevelSessionExporter.swift`, see THIRD_PARTY_NOTICES.md), the
/// AVAssetReader → AVAssetWriter exporter its README shows, with:
/// - the admin's bitrate ladder (`media.video_bitrate_*_kbps`, the same
///   number Android's Media3 encoder gets), never above the source's own;
/// - H.264 High profile (`AVVideoProfileLevelH264HighAutoLevel`), CABAC;
/// - fast start (`shouldOptimizeForNetworkUse`: moov first, a chat video
///   starts playing before it is fully downloaded);
/// - HDR (Dolby Vision / HLG from the iPhone camera) → normal SDR colours:
///   the video composition and the writer are both set to ITU-R BT.709
///   and the frames are read as 8-bit 4:2:0, so AVFoundation tone-maps
///   (WWDC20 «Edit and play back HDR video with AVFoundation»);
/// - never upscaled, never more frames per second than the source;
/// - a source that is already H.264, SDR, no taller and no heavier than the
///   target is not re-encoded at all (a second encode only loses quality).
///
/// Channel `lawbid/video_encoder` (the same contract as Android's
/// VideoEncoder.kt, Dart: lib/core/media/video_compression.dart):
/// - `compress` {id, path, maxShortSide, frameRate, bitrateKbps} → the
///   output path, or nil = keep the original (already small, cancelled);
///   an error = Dart falls back to the old plugin. Videos asked for while
///   one encodes wait in a queue (one hardware encoder at a time);
/// - `progress` (to Dart) {id, progress 0…1};
/// - `cancel` {id?} — that video, or all when no id.
final class VideoEncodeJob {
  struct Options {
    var maxShortSide: Int
    var frameRate: Int
    var bitrateKbps: Int
  }

  /// What the source is and what the encode will write.
  struct Plan {
    var keepOriginal: Bool
    var width: Int
    var height: Int
    var frameRate: Float
    var videoBitrate: Int
    var hdr: Bool
    var audio: [String: Any]?
  }

  enum Failure: Error {
    case noVideo
    case unsupported(String)
    case failed(String)
  }

  let id: String
  let source: URL
  let options: Options
  private var exporter: NextLevelSessionExporter?
  private(set) var output: URL?
  private(set) var cancelled = false
  /// The exporter can call back twice on a setup failure (main thread).
  private var answered = false

  init(id: String, source: URL, options: Options) {
    self.id = id
    self.source = source
    self.options = options
  }

  /// Reads the source and decides the output (any thread).
  static func plan(_ asset: AVAsset, _ o: Options) throws -> Plan {
    guard let track = asset.tracks(withMediaType: .video).first else { throw Failure.noVideo }
    let box = CGRect(origin: .zero, size: track.naturalSize).applying(track.preferredTransform)
    let w = Int(abs(box.width).rounded())
    let h = Int(abs(box.height).rounded())
    guard w > 0, h > 0 else { throw Failure.noVideo }
    let short = min(w, h)
    // Never upscale: shrink only a video taller than the admin's limit.
    let target = o.maxShortSide > 0 && short > o.maxShortSide ? o.maxShortSide : short
    let scale = Double(target) / Double(short)
    let even = { (v: Int) -> Int in max(2, Int((Double(v) * scale / 2).rounded()) * 2) }
    let srcFps = track.nominalFrameRate
    let fps = srcFps > 0 ? min(srcFps, Float(o.frameRate)) : Float(o.frameRate)
    let srcBitrate = Int(track.estimatedDataRate)
    var bitrate = o.bitrateKbps * 1000
    if srcBitrate > 0 && srcBitrate < bitrate { bitrate = srcBitrate }
    let hdr = track.hasMediaCharacteristic(.containsHDRVideo)
    let h264 = track.formatDescriptions.contains {
      CMFormatDescriptionGetMediaSubType($0 as! CMFormatDescription) == kCMVideoCodecType_H264
    }
    let keep = h264 && !hdr && target == short && srcFps <= fps + 0.5 && srcBitrate > 0
      && srcBitrate <= o.bitrateKbps * 1000
    return Plan(
      keepOriginal: keep, width: even(w), height: even(h), frameRate: fps,
      videoBitrate: bitrate, hdr: hdr, audio: audioSettings(asset))
  }

  /// AAC at the source's own channel count, sample rate and bitrate (the
  /// audio is not made worse; Android copies it as it is).
  static func audioSettings(_ asset: AVAsset) -> [String: Any]? {
    guard let track = asset.tracks(withMediaType: .audio).first else { return nil }
    var channels = 2
    var rate = 44_100.0
    if let fd = track.formatDescriptions.first,
      let asbd = CMAudioFormatDescriptionGetStreamBasicDescription(fd as! CMAudioFormatDescription)
    {
      channels = min(2, max(1, Int(asbd.pointee.mChannelsPerFrame)))
      if asbd.pointee.mSampleRate > 0 { rate = asbd.pointee.mSampleRate }
    }
    var s: [String: Any] = [
      AVFormatIDKey: kAudioFormatMPEG4AAC,
      AVNumberOfChannelsKey: channels,
      AVSampleRateKey: rate,
    ]
    let src = Int(track.estimatedDataRate)
    if src > 0 { s[AVEncoderBitRateKey] = src / 1000 * 1000 }
    return s
  }

  /// Settings the writer would refuse throw inside AVAssetWriterInput:
  /// check them on a throwaway writer first.
  static func accepted(_ settings: [String: Any], _ type: AVMediaType) -> Bool {
    let probe = FileManager.default.temporaryDirectory
      .appendingPathComponent("lawbid_probe_\(UUID().uuidString).mp4")
    guard let w = try? AVAssetWriter(outputURL: probe, fileType: .mp4) else { return false }
    return w.canApply(outputSettings: settings, forMediaType: type)
  }

  /// Runs the encode; [done] on the main thread: the output, nil = keep
  /// the original, or a failure.
  func start(
    progress: @escaping (Float) -> Void,
    done: @escaping (Result<URL?, Error>) -> Void
  ) {
    let asset = AVURLAsset(url: source)
    let plan: Plan
    do {
      plan = try VideoEncodeJob.plan(asset, options)
    } catch {
      DispatchQueue.main.async { done(.failure(error)) }
      return
    }
    if plan.keepOriginal || cancelled {
      DispatchQueue.main.async { done(.success(nil)) }
      return
    }
    let video: [String: Any] = [
      AVVideoCodecKey: AVVideoCodecType.h264,
      AVVideoWidthKey: plan.width,
      AVVideoHeightKey: plan.height,
      AVVideoScalingModeKey: AVVideoScalingModeResizeAspectFill,
      AVVideoColorPropertiesKey: [
        AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2,
        AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
        AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2,
      ],
      AVVideoCompressionPropertiesKey: [
        AVVideoAverageBitRateKey: plan.videoBitrate,
        AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
        AVVideoH264EntropyModeKey: AVVideoH264EntropyModeCABAC,
        AVVideoExpectedSourceFrameRateKey: plan.frameRate,
        // NextLevelSessionExporter reads the composition's frame rate here.
        AVVideoAverageNonDroppableFrameRateKey: plan.frameRate,
      ] as [String: Any],
    ]
    guard VideoEncodeJob.accepted(video, .video) else {
      DispatchQueue.main.async { done(.failure(Failure.unsupported("video settings"))) }
      return
    }
    var audio = plan.audio
    if let a = audio, !VideoEncodeJob.accepted(a, .audio) {
      // The encoder's own bitrate for that rate and channel count.
      audio?.removeValue(forKey: AVEncoderBitRateKey)
      if let b = audio, !VideoEncodeJob.accepted(b, .audio) {
        DispatchQueue.main.async { done(.failure(Failure.unsupported("audio settings"))) }
        return
      }
    }

    let out = FileManager.default.temporaryDirectory
      .appendingPathComponent("lawbid_video_\(UUID().uuidString).mp4")
    output = out
    let e = NextLevelSessionExporter(withAsset: asset)
    e.outputURL = out
    e.outputFileType = .mp4
    e.optimizeForNetworkUse = true
    // 8-bit 4:2:0 frames out of the compositor: an HDR source is tone-mapped.
    e.videoInputConfiguration = [
      kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange
    ]
    e.videoOutputConfiguration = video
    e.audioOutputConfiguration = audio
    let composition = e.createVideoComposition()
    composition.colorPrimaries = AVVideoColorPrimaries_ITU_R_709_2
    composition.colorTransferFunction = AVVideoTransferFunction_ITU_R_709_2
    composition.colorYCbCrMatrix = AVVideoYCbCrMatrix_ITU_R_709_2
    e.videoComposition = composition
    exporter = e
    if cancelled {
      DispatchQueue.main.async { done(.success(nil)) }
      return
    }
    e.export(
      progressHandler: { p in progress(min(1, max(0, p))) },
      completionHandler: { [weak self] result in
        DispatchQueue.main.async {
          guard let self = self, !self.answered else { return }
          self.answered = true
          self.exporter = nil
          switch result {
          case .success(let status) where status == .completed && !self.cancelled:
            // A writer that could not take the video writes sound only.
            if AVURLAsset(url: out).tracks(withMediaType: .video).isEmpty {
              self.removeOutput()
              done(.failure(Failure.failed("no video in the output")))
            } else {
              done(.success(out))
            }
          case .success:
            self.removeOutput()
            done(self.cancelled ? .success(nil) : .failure(Failure.failed("export status")))
          case .failure(let error):
            self.removeOutput()
            done(self.cancelled ? .success(nil) : .failure(error))
          }
        }
      })
  }

  func cancel() {
    cancelled = true
    exporter?.cancelExport()
  }

  /// The exporter's own clean-up checks `absoluteString`, not the path,
  /// so a failed or cancelled output is deleted here.
  func removeOutput() {
    if let out = output { try? FileManager.default.removeItem(at: out) }
    output = nil
  }
}

#if canImport(Flutter)
  /// The method channel and the queue (main thread).
  final class VideoEncoderChannel: NSObject {
    static let shared = VideoEncoderChannel()

    private var channel: FlutterMethodChannel?
    private var queue: [(VideoEncodeJob, FlutterResult)] = []
    private var current: (VideoEncodeJob, FlutterResult)?
    private var background: UIBackgroundTaskIdentifier = .invalid
    private let work = DispatchQueue(label: "lawbid.video_encoder", qos: .userInitiated)

    func register(_ messenger: FlutterBinaryMessenger) {
      let channel = FlutterMethodChannel(name: "lawbid/video_encoder", binaryMessenger: messenger)
      self.channel = channel
      channel.setMethodCallHandler { [weak self] call, result in
        guard let self = self else {
          result(nil)
          return
        }
        self.handle(call, result: result)
      }
    }

    private func handle(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
      let args = call.arguments as? [String: Any]
      switch call.method {
      case "compress":
        guard let path = args?["path"] as? String else {
          result(FlutterError(code: "failed", message: "no path", details: nil))
          return
        }
        let job = VideoEncodeJob(
          id: args?["id"] as? String ?? path,
          source: URL(fileURLWithPath: path),
          options: .init(
            maxShortSide: args?["maxShortSide"] as? Int ?? 1080,
            frameRate: args?["frameRate"] as? Int ?? 30,
            bitrateKbps: args?["bitrateKbps"] as? Int ?? 4500))
        queue.append((job, result))
        next()
      case "cancel":
        cancel(args?["id"] as? String)
        result(nil)
      default:
        result(FlutterMethodNotImplemented)
      }
    }

    private func next() {
      if current != nil { return }
      guard !queue.isEmpty else {
        endBackground()
        return
      }
      let item = queue.removeFirst()
      current = item
      beginBackground()
      let (job, result) = item
      // The exporter reads the file synchronously: off the main thread.
      work.async {
        job.start(
          progress: { [weak self] p in
            DispatchQueue.main.async {
              self?.channel?.invokeMethod("progress", arguments: ["id": job.id, "progress": Double(p)])
            }
          },
          done: { [weak self] r in
            switch r {
            case .success(let url): result(url?.path)
            case .failure(let e):
              result(FlutterError(code: "failed", message: "\(e)", details: nil))
            }
            self?.current = nil
            self?.next()
          })
      }
    }

    private func cancel(_ id: String?) {
      let waiting = queue.filter { id == nil || $0.0.id == id }
      queue.removeAll { id == nil || $0.0.id == id }
      waiting.forEach { $0.1(nil) }
      if let job = current?.0, id == nil || job.id == id { job.cancel() }
    }

    /// iOS gives a backgrounded app a short while to finish; when it runs
    /// out, the encode stops and the original is sent.
    private func beginBackground() {
      guard background == .invalid else { return }
      background = UIApplication.shared.beginBackgroundTask(withName: "lawbid.video_encoder") {
        [weak self] in
        self?.cancel(nil)
        self?.endBackground()
      }
    }

    private func endBackground() {
      guard background != .invalid else { return }
      UIApplication.shared.endBackgroundTask(background)
      background = .invalid
    }
  }
#endif
