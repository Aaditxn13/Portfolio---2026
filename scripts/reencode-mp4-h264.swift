#!/usr/bin/env swift
//
// reencode-mp4-h264.swift
//
// Re-encodes one or more .mp4 files to H.264 High profile + yuv420p so
// that every browser (Chrome / Arc / Safari / Firefox) can decode them.
//
// Some captures (Adobe Media Encoder, certain x264 presets, etc.) emit
// H.264 profile 244 (High 4:4:4 Predictive) which Chromium rejects with
// `DECODER_ERROR_NOT_SUPPORTED: video decoder initialization failed`.
//
// AVAssetExportSession won't downconvert the chroma sampling, so we
// build a custom AVAssetReader → AVAssetWriter pipeline that:
//   * decodes the source into 4:2:0 video-range pixel buffers
//   * encodes via H264_High @ Level 4.2 with the moov atom at the head
//     (`shouldOptimizeForNetworkUse = true`)
//
// Usage:
//   swift scripts/reencode-mp4-h264.swift <input.mp4> [<input2.mp4> ...]
//
// Writes the result back to the input path; the original is preserved
// as <name>.original.mp4 the first time the script runs on a file.

import AVFoundation
import CoreMedia
import Foundation
import VideoToolbox

let args = Array(CommandLine.arguments.dropFirst())
if args.isEmpty {
    print("usage: swift scripts/reencode-mp4-h264.swift <file.mp4> [...]")
    exit(2)
}

func reencode(_ inputURL: URL) async -> Bool {
    let name = inputURL.lastPathComponent
    print("→ \(name)")

    let asset = AVURLAsset(url: inputURL)

    let videoTracks: [AVAssetTrack]
    let audioTracks: [AVAssetTrack]
    do {
        videoTracks = try await asset.loadTracks(withMediaType: .video)
        audioTracks = try await asset.loadTracks(withMediaType: .audio)
    } catch {
        print("  ✗ track load failed: \(error.localizedDescription)")
        return false
    }
    guard let videoTrack = videoTracks.first else {
        print("  ✗ no video track")
        return false
    }

    let naturalSize: CGSize
    let preferredTransform: CGAffineTransform
    let nominalFrameRate: Float
    let formatDescriptions: [CMFormatDescription]
    do {
        naturalSize = try await videoTrack.load(.naturalSize)
        preferredTransform = try await videoTrack.load(.preferredTransform)
        nominalFrameRate = try await videoTrack.load(.nominalFrameRate)
        formatDescriptions = try await videoTrack.load(.formatDescriptions)
    } catch {
        print("  ✗ track metadata load failed: \(error.localizedDescription)")
        return false
    }

    // Output dimensions = natural size with the transform applied so portrait
    // videos don't end up mirrored or sideways.
    let transformed = naturalSize.applying(preferredTransform)
    let renderSize = CGSize(width: abs(transformed.width), height: abs(transformed.height))

    let tmpOut = inputURL.deletingPathExtension().appendingPathExtension("h264.mp4")
    try? FileManager.default.removeItem(at: tmpOut)

    let reader: AVAssetReader
    let writer: AVAssetWriter
    do {
        reader = try AVAssetReader(asset: asset)
        writer = try AVAssetWriter(outputURL: tmpOut, fileType: .mp4)
    } catch {
        print("  ✗ reader/writer init failed: \(error.localizedDescription)")
        return false
    }
    writer.shouldOptimizeForNetworkUse = true

    // ---- VIDEO ------------------------------------------------------------
    // Decode into 4:2:0 video-range so the writer doesn't have to subsample
    // from 4:4:4 itself.
    let videoReaderSettings: [String: Any] = [
        kCVPixelBufferPixelFormatTypeKey as String: Int(kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange),
        kCVPixelBufferIOSurfacePropertiesKey as String: [:]
    ]
    let videoReaderOutput = AVAssetReaderTrackOutput(track: videoTrack, outputSettings: videoReaderSettings)
    videoReaderOutput.alwaysCopiesSampleData = false
    if reader.canAdd(videoReaderOutput) { reader.add(videoReaderOutput) } else {
        print("  ✗ cannot add video reader output"); return false
    }

    let bitRate: Int = {
        // Aim for visually-transparent: ~8 Mbps cap for HD, scales with area.
        let pixels = Int(renderSize.width * renderSize.height)
        let target = max(800_000, min(8_000_000, pixels * 4))
        return target
    }()

    let videoCompression: [String: Any] = [
        AVVideoAverageBitRateKey: bitRate,
        AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
        AVVideoMaxKeyFrameIntervalKey: max(1, Int(nominalFrameRate.rounded()) * 2)
    ]
    let videoWriterSettings: [String: Any] = [
        AVVideoCodecKey: AVVideoCodecType.h264,
        AVVideoWidthKey: Int(renderSize.width),
        AVVideoHeightKey: Int(renderSize.height),
        AVVideoCompressionPropertiesKey: videoCompression
    ]
    let videoWriterInput = AVAssetWriterInput(mediaType: .video, outputSettings: videoWriterSettings)
    videoWriterInput.expectsMediaDataInRealTime = false
    videoWriterInput.transform = preferredTransform
    if writer.canAdd(videoWriterInput) { writer.add(videoWriterInput) } else {
        print("  ✗ cannot add video writer input"); return false
    }

    // ---- AUDIO (optional) -------------------------------------------------
    var audioReaderOutput: AVAssetReaderTrackOutput?
    var audioWriterInput: AVAssetWriterInput?
    if let audioTrack = audioTracks.first {
        let audioReader = AVAssetReaderTrackOutput(track: audioTrack, outputSettings: [
            AVFormatIDKey: Int(kAudioFormatLinearPCM),
            AVLinearPCMBitDepthKey: 16,
            AVLinearPCMIsFloatKey: false,
            AVLinearPCMIsBigEndianKey: false,
            AVLinearPCMIsNonInterleaved: false
        ])
        audioReader.alwaysCopiesSampleData = false
        if reader.canAdd(audioReader) {
            reader.add(audioReader)
            audioReaderOutput = audioReader
        }

        let audioWriter = AVAssetWriterInput(mediaType: .audio, outputSettings: [
            AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
            AVNumberOfChannelsKey: 2,
            AVSampleRateKey: 44100,
            AVEncoderBitRateKey: 128_000
        ])
        audioWriter.expectsMediaDataInRealTime = false
        if writer.canAdd(audioWriter) {
            writer.add(audioWriter)
            audioWriterInput = audioWriter
        }
    }

    // ---- RUN --------------------------------------------------------------
    guard writer.startWriting() else {
        print("  ✗ writer.startWriting failed: \(writer.error?.localizedDescription ?? "?")")
        return false
    }
    writer.startSession(atSourceTime: .zero)
    guard reader.startReading() else {
        print("  ✗ reader.startReading failed: \(reader.error?.localizedDescription ?? "?")")
        return false
    }

    let group = DispatchGroup()
    let queueV = DispatchQueue(label: "reencode.video")
    let queueA = DispatchQueue(label: "reencode.audio")

    group.enter()
    videoWriterInput.requestMediaDataWhenReady(on: queueV) {
        while videoWriterInput.isReadyForMoreMediaData {
            if let buf = videoReaderOutput.copyNextSampleBuffer() {
                if !videoWriterInput.append(buf) { break }
            } else {
                videoWriterInput.markAsFinished()
                group.leave()
                return
            }
        }
    }

    if let audioReader = audioReaderOutput, let audioWriter = audioWriterInput {
        group.enter()
        audioWriter.requestMediaDataWhenReady(on: queueA) {
            while audioWriter.isReadyForMoreMediaData {
                if let buf = audioReader.copyNextSampleBuffer() {
                    if !audioWriter.append(buf) { break }
                } else {
                    audioWriter.markAsFinished()
                    group.leave()
                    return
                }
            }
        }
    }

    group.wait()

    await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
        writer.finishWriting { continuation.resume() }
    }

    guard writer.status == .completed else {
        print("  ✗ writer status \(writer.status.rawValue): \(writer.error?.localizedDescription ?? "?")")
        return false
    }

    let backupURL = inputURL.deletingPathExtension().appendingPathExtension("original.mp4")
    do {
        if !FileManager.default.fileExists(atPath: backupURL.path) {
            try FileManager.default.copyItem(at: inputURL, to: backupURL)
        }
        _ = try FileManager.default.replaceItemAt(inputURL, withItemAt: tmpOut)
    } catch {
        print("  ✗ swap failed: \(error.localizedDescription)")
        return false
    }

    let origSize = (try? FileManager.default.attributesOfItem(atPath: backupURL.path)[.size] as? Int) ?? 0
    let newSize  = (try? FileManager.default.attributesOfItem(atPath: inputURL.path)[.size] as? Int) ?? 0
    print(String(format: "  ✓ %.0f KB → %.0f KB (kept original as %@)",
                 Double(origSize) / 1024.0, Double(newSize) / 1024.0, backupURL.lastPathComponent))
    return true
}

let cwd = FileManager.default.currentDirectoryPath
var ok = 0
var fail = 0

for arg in args {
    let url = URL(fileURLWithPath: arg, relativeTo: URL(fileURLWithPath: cwd)).standardizedFileURL
    if !FileManager.default.fileExists(atPath: url.path) {
        print("✗ missing: \(arg)")
        fail += 1
        continue
    }
    let success = await reencode(url)
    if success { ok += 1 } else { fail += 1 }
}

print("")
print("\(ok) succeeded, \(fail) failed")
exit(fail == 0 ? 0 : 1)
