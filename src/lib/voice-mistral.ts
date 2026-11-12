import {
  parseVoiceModel,
  type VoiceModelPlan,
  type VoicePromptLists,
} from "@/lib/voice-plan";

export const VOICE_TEXT_MODEL = "mistral-small-latest";

export const VOICE_MEAL_SCHEMA = {
  name: "voice_meal",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      date: {
        type: "string",
        description:
          "Empty if no date was said, yesterday for hier, or YYYY-MM-DD",
      },
      meal: {
        type: "string",
        description: "breakfast, lunch, dinner, snack, or empty",
      },
      items: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            spoken: { type: "string" },
            quantity: { type: "number" },
            unit: { type: "string", enum: ["g", "ml"] },
            aliasId: {
              type: "string",
              description: "Copied alias id, or empty",
            },
            stapleId: {
              type: "string",
              description: "Copied staple id, or empty",
            },
            unresolved: { type: "boolean" },
            question: { type: "string" },
            candidates: {
              type: "array",
              items: { type: "string" },
            },
          },
          required: [
            "spoken",
            "quantity",
            "unit",
            "aliasId",
            "stapleId",
            "unresolved",
            "question",
            "candidates",
          ],
        },
      },
    },
    required: ["date", "meal", "items"],
  },
} as const;

export const VOICE_SYSTEM_PROMPT = `Tu lis une phrase qui décrit un repas, souvent en français.
Tu renvoies uniquement le JSON du schéma. Tu ne calcules aucune calorie. Tu n’appelles aucun outil.

date : chaîne vide si la phrase ne donne pas de date, yesterday si elle dit hier, YYYY-MM-DD si elle donne un jour précis.
meal : breakfast, lunch, dinner ou snack si le repas est nommé. Chaîne vide si le repas n’est pas dit. Ne le devine pas à partir de l’heure ou des aliments.
Un item par aliment.
spoken reprend le bout de phrase. quantity est le nombre dit. unit vaut g ou ml.
Si un sens personnel colle clairement, copie son aliasId, laisse stapleId vide, unresolved false, question vide, candidates vide.
Sinon, si un aliment de base colle clairement, copie son stapleId, aliasId vide, unresolved false, question vide, candidates vide.
Un sens personnel l’emporte sur un aliment de base quand les deux collent.
Une forme courte d’un sens personnel garde son aliasId : « prots habituelles » copie la ligne « protéines habituelles ».
Si rien ne colle, ou si deux lignes collent autant, unresolved true, aliasId vide, stapleId vide, une question courte dans la langue de la phrase, et au plus 3 ids pris dans les listes.
Une candidate n’entre que si son nom reprend les mots dits. « lait de soja » ne reçoit pas « lait entier ». Si aucun nom ne reprend les mots, candidates est un tableau vide.
N’invente aucun id.`;

const ALIAS_ID = /^\d{1,12}$/;
const STAPLE_ID = /^[a-z0-9-]{1,64}$/i;

function oneLine(value: string, max: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function asRow(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

export function listsFromRequest(body: unknown): {
  transcript: string;
  lists: VoicePromptLists;
} | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  if (typeof record.transcript !== "string") return null;
  const transcript = record.transcript.trim();
  if (!transcript || transcript.length > 2000) return null;

  const aliases: VoicePromptLists["aliases"] = [];
  const seenAliases = new Set<string>();
  const aliasRows = Array.isArray(record.aliases) ? record.aliases : [];
  for (const row of aliasRows) {
    if (aliases.length >= 200) break;
    const item = asRow(row);
    if (!item || typeof item.id !== "string" || !ALIAS_ID.test(item.id)) continue;
    if (seenAliases.has(item.id)) continue;
    const phrase = typeof item.phrase === "string" ? oneLine(item.phrase, 120) : "";
    const food = typeof item.food === "string" ? oneLine(item.food, 120) : "";
    if (!phrase || !food) continue;
    seenAliases.add(item.id);
    aliases.push({ id: item.id, phrase, food });
  }

  const staples: VoicePromptLists["staples"] = [];
  const seenStaples = new Set<string>();
  const stapleRows = Array.isArray(record.staples) ? record.staples : [];
  for (const row of stapleRows) {
    if (staples.length >= 120) break;
    const item = asRow(row);
    if (!item || typeof item.id !== "string" || !STAPLE_ID.test(item.id)) continue;
    if (seenStaples.has(item.id)) continue;
    const name = typeof item.name === "string" ? oneLine(item.name, 120) : "";
    if (!name) continue;
    const hints = typeof item.hints === "string" ? oneLine(item.hints, 200) : "";
    seenStaples.add(item.id);
    staples.push({ id: item.id, name, hints });
  }

  return { transcript, lists: { aliases, staples } };
}

export function buildVoiceUserPrompt(
  transcript: string,
  lists: VoicePromptLists,
): string {
  const aliasLines = lists.aliases.length
    ? lists.aliases
        .map((row) => `${row.id} | ${row.phrase} | ${row.food}`)
        .join("\n")
    : "aucun";
  const stapleLines = lists.staples.length
    ? lists.staples
        .map((row) =>
          row.hints ? `${row.id} | ${row.name} | ${row.hints}` : `${row.id} | ${row.name}`,
        )
        .join("\n")
    : "aucun";
  return `Sens personnels, aliasId à copier :
${aliasLines}

Aliments de base, stapleId à copier :
${stapleLines}

Phrase :
${transcript}`;
}

interface MistralChatResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
}

function parseContentJson(content: string): unknown {
  const trimmed = content.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("BAD_JSON");
  }
}

/** Text model only. The returned plan has no calories. */
export async function interpretVoiceTranscript(params: {
  apiKey: string;
  transcript: string;
  lists: VoicePromptLists;
}): Promise<VoiceModelPlan> {
  const { apiKey, transcript, lists } = params;
  if (!apiKey.trim()) throw new Error("MISSING_API_KEY");

  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: VOICE_TEXT_MODEL,
      temperature: 0,
      messages: [
        { role: "system", content: VOICE_SYSTEM_PROMPT },
        { role: "user", content: buildVoiceUserPrompt(transcript, lists) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: VOICE_MEAL_SCHEMA,
      },
      max_tokens: 1500,
    }),
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error("INVALID_API_KEY");
  }
  if (!res.ok) throw new Error(`MISTRAL_HTTP_${res.status}`);

  const data = (await res.json()) as MistralChatResponse;
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("NO_CONTENT");
  }
  return parseVoiceModel(parseContentJson(content));
}
