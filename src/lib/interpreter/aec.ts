/**
 * Microphone capture for the interpreter, with echo cancellation verified
 * rather than assumed.
 *
 * Browsers treat these constraints as hints: a device or driver can silently
 * decline echo cancellation, and the only way to know is to read the track's
 * settings back. See docs/REALTIME-TRANSLATION.md §6.
 */

export const CAPTURE_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
  sampleRate: 48000,
};

/**
 * "webrtc": cancels audio from remote WebRTC tracks, which is the path the
 *   agent's voice arrives on, so this is sufficient for the interpreter.
 * "system": also cancels other audio the device plays (Media Capture
 *   Extensions `echoCancellation: "all"`; not yet widely supported).
 */
export type EchoMode = "system" | "webrtc" | "off";

export interface CaptureCheck {
  ok: boolean;
  echo: EchoMode;
  issues: string[];
}

/** `MediaTrackSettings.echoCancellation` is typed boolean in lib.dom, but the
 *  extension spec widens it to a string enum. */
type Settings = Omit<MediaTrackSettings, "echoCancellation"> & {
  echoCancellation?: boolean | string;
};

export function assessCapture(settings: Settings): CaptureCheck {
  const issues: string[] = [];
  const ec = settings.echoCancellation;
  const echo: EchoMode =
    ec === "all" ? "system" : ec === true || ec === "remote-only" ? "webrtc" : "off";

  if (echo === "off") {
    issues.push(
      "Echo cancellation is not active on this microphone. Use headphones, or the translation will be picked up and re-translated.",
    );
  }
  if (settings.noiseSuppression === false) {
    issues.push("Noise suppression is off; background noise will reach speech recognition.");
  }
  if (settings.channelCount !== undefined && settings.channelCount > 1) {
    issues.push("The microphone is capturing in stereo; echo cancellation is tuned for mono.");
  }

  return { ok: echo !== "off", echo, issues };
}

/**
 * Best-effort upgrade to system-wide cancellation. Unsupported values either
 * reject or are ignored, so success is judged by reading the settings back.
 */
export async function tryUpgradeToSystemWideAec(track: MediaStreamTrack): Promise<boolean> {
  try {
    await track.applyConstraints({
      ...CAPTURE_CONSTRAINTS,
      echoCancellation: "all" as unknown as boolean,
    });
  } catch {
    return false;
  }
  return (track.getSettings() as Settings).echoCancellation === "all";
}
