import { randomUUID } from "node:crypto";
import { AccessToken, RoomAgentDispatch, RoomConfiguration } from "livekit-server-sdk";

import type { CaptionLanguage, TranslationLanguage } from "./protocol";

/**
 * LiveKit session minting for the interpreter.
 *
 * Signing is local (no network call to LiveKit), so this takes its config as
 * an argument instead of reading the environment, which keeps it unit-testable.
 * The browser receives only a short-lived, single-room token, never the API
 * secret.
 */

export interface LiveKitConfig {
  /** Public ws(s):// URL the browser connects to. */
  url: string;
  apiKey: string;
  apiSecret: string;
  /** Must match the agent's `agent_name`; the token dispatches it into the room. */
  agentName: string;
}

export interface InterpreterSession {
  url: string;
  token: string;
  room: string;
  identity: string;
}

/** A token only needs to be valid long enough to join; the connection then
 *  outlives it. */
const TOKEN_TTL = "10m";

/** Close the room soon after the learner leaves, so the agent job ends too. */
const EMPTY_TIMEOUT_SEC = 30;
const DEPARTURE_TIMEOUT_SEC = 10;

export function liveKitConfig(env: {
  LIVEKIT_URL: string;
  LIVEKIT_API_KEY: string;
  LIVEKIT_API_SECRET: string;
  INTERPRETER_AGENT_NAME: string;
}): LiveKitConfig | null {
  const url = env.LIVEKIT_URL.trim();
  const apiKey = env.LIVEKIT_API_KEY.trim();
  const apiSecret = env.LIVEKIT_API_SECRET.trim();
  if (!url || !apiKey || !apiSecret) return null;
  return { url, apiKey, apiSecret, agentName: env.INTERPRETER_AGENT_NAME };
}

export interface SessionOptions {
  sourceLanguage: CaptionLanguage;
  targetLanguage: TranslationLanguage;
}

export async function createInterpreterSession(
  config: LiveKitConfig,
  user: { id: string; name: string },
  options: SessionOptions,
): Promise<InterpreterSession> {
  // One fresh room per session: a stale agent or ghost participant from an
  // earlier tab can never end up in the new call.
  const room = `interp_${user.id}_${randomUUID().slice(0, 8)}`;
  const identity = `user_${user.id}`;

  const token = new AccessToken(config.apiKey, config.apiSecret, {
    identity,
    name: user.name,
    ttl: TOKEN_TTL,
    // Session settings travel in the learner's participant metadata, which
    // the agent reads when it subscribes to their microphone. Signed into the
    // token, so the client can't change them after the server validated them.
    metadata: JSON.stringify(options),
  });
  token.addGrant({
    room,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    canUpdateOwnMetadata: false,
  });
  token.roomConfig = new RoomConfiguration({
    emptyTimeout: EMPTY_TIMEOUT_SEC,
    departureTimeout: DEPARTURE_TIMEOUT_SEC,
    agents: [new RoomAgentDispatch({ agentName: config.agentName })],
  });

  return { url: config.url, token: await token.toJwt(), room, identity };
}
