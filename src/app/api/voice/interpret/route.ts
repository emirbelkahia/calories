import { NextResponse } from "next/server";
import {
  interpretVoiceTranscript,
  listsFromRequest,
} from "@/lib/voice-mistral";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  const apiKey = request.headers.get("x-mistral-api-key")?.trim() ?? "";
  if (!apiKey) {
    return NextResponse.json({ error: "missing_api_key" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const prepared = listsFromRequest(body);
  if (!prepared) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  try {
    const plan = await interpretVoiceTranscript({
      apiKey,
      transcript: prepared.transcript,
      lists: prepared.lists,
    });
    return NextResponse.json({ plan });
  } catch (err) {
    const code = err instanceof Error ? err.message : "interpret_failed";
    if (code === "INVALID_API_KEY") {
      return NextResponse.json({ error: "invalid_api_key" }, { status: 401 });
    }
    if (code === "BAD_JSON" || code === "NO_CONTENT") {
      return NextResponse.json({ error: "interpret_failed" }, { status: 422 });
    }
    return NextResponse.json({ error: "interpret_failed" }, { status: 502 });
  }
}
