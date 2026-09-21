import { ImageResponse } from "next/og";

import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";

/**
 * Open Graph image for every page that does not define its own. Generated at
 * build time, so link previews on social networks, in chat apps and in AI
 * answers that show sources all carry the same card.
 */
export const alt = `${SITE_NAME} — ${SITE_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "linear-gradient(135deg, #1a1a22 0%, #2a2350 100%)",
          color: "#f4f3fb",
          fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 18,
              background: "#5b4bd6",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 34,
              fontWeight: 700,
            }}
          >
            Lx
          </div>
          <div style={{ fontSize: 40, fontWeight: 600 }}>{SITE_NAME}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 30, letterSpacing: 4, color: "#a79cf0", fontWeight: 600 }}>
            CEFR B2 · C1 · C2
          </div>
          <div style={{ fontSize: 72, fontWeight: 600, lineHeight: 1.05, letterSpacing: -2 }}>
            Your English is already good.
          </div>
          <div style={{ fontSize: 72, fontWeight: 600, lineHeight: 1.05, letterSpacing: -2, color: "#a79cf0" }}>
            This is the last mile.
          </div>
        </div>

        <div style={{ fontSize: 28, color: "#c9c5e6" }}>
          Adaptive placement · Spaced repetition · AI conversation · Exam preparation
        </div>
      </div>
    ),
    size,
  );
}
