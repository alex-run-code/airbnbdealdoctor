const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") || "gpt-5.5";
const STATUS_VALUES = ["blue", "green", "yellow", "red"] as const;
const CONFIDENCE_VALUES = ["low", "medium", "high"] as const;

type StatusValue = (typeof STATUS_VALUES)[number];
type ConfidenceValue = (typeof CONFIDENCE_VALUES)[number];

type CommuneInput = {
  name: string;
  code: string;
  departmentCode?: string;
  departmentName?: string;
  regionCode?: string;
  regionName?: string;
  population?: number;
  postalCodes?: string[];
  latitude?: number;
  longitude?: number;
  distanceKm?: number;
};

type SourceItem = {
  title: string;
  url: string;
};

type RawResponse = {
  target: {
    communeCode: string;
    cityName: string;
    departmentName: string;
    regionName: string;
    status: StatusValue;
    confidence: ConfidenceValue;
    summary: string;
    keyPoints: string[];
    caution: string;
    sources: SourceItem[];
  };
  nearbySuggestions: Array<{
    communeCode: string;
    cityName: string;
    status: StatusValue;
    reason: string;
  }>;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function sanitizeText(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function sanitizeStatus(value: unknown, fallback: StatusValue): StatusValue {
  return STATUS_VALUES.includes(value as StatusValue) ? (value as StatusValue) : fallback;
}

function sanitizeConfidence(value: unknown, fallback: ConfidenceValue): ConfidenceValue {
  return CONFIDENCE_VALUES.includes(value as ConfidenceValue)
    ? (value as ConfidenceValue)
    : fallback;
}

function sanitizeSources(value: unknown): SourceItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => ({
      title: sanitizeText(item?.title),
      url: sanitizeText(item?.url),
    }))
    .filter((item) => item.title && item.url)
    .slice(0, 5);
}

function sanitizeKeyPoints(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => sanitizeText(item))
    .filter(Boolean)
    .slice(0, 5);
}

function normalizeCommune(input: unknown): CommuneInput | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const source = input as Record<string, unknown>;
  const name = sanitizeText(source.name);
  const code = sanitizeText(source.code);

  if (!name || !code) {
    return null;
  }

  return {
    name,
    code,
    departmentCode: sanitizeText(source.departmentCode),
    departmentName: sanitizeText(source.departmentName),
    regionCode: sanitizeText(source.regionCode),
    regionName: sanitizeText(source.regionName),
    population: Number.isFinite(source.population) ? Number(source.population) : undefined,
    postalCodes: Array.isArray(source.postalCodes)
      ? source.postalCodes.map((value) => sanitizeText(value)).filter(Boolean)
      : undefined,
    latitude: Number.isFinite(source.latitude) ? Number(source.latitude) : undefined,
    longitude: Number.isFinite(source.longitude) ? Number(source.longitude) : undefined,
    distanceKm: Number.isFinite(source.distanceKm) ? Number(source.distanceKm) : undefined,
  };
}

function buildPrompt(target: CommuneInput, nearbyCommunes: CommuneInput[]) {
  const targetLine = JSON.stringify(target, null, 2);
  const nearbyBlock = JSON.stringify(nearbyCommunes.slice(0, 12), null, 2);

  return `Tu es un analyste France-only de la réglementation des meublés de tourisme.

Contexte produit:
- L'utilisateur veut savoir si sa ville est favorable ou non pour une stratégie de location courte durée / meublé de tourisme.
- Le ton doit être clair, concis, vendeur, mais jamais trompeur.
- Ne fais pas peur inutilement, mais ne mens jamais.
- Si la ville est difficile, montre une porte de sortie avec des communes voisines potentiellement plus favorables.

Règles de fond:
- Tu dois effectuer une recherche web avant de répondre.
- Privilégie les sources officielles: mairie, service-public.fr, legifrance.gouv.fr, ecologie.gouv.fr, entreprises.gouv.fr, data.gouv.fr.
- Si une règle locale est incertaine ou non trouvée de manière fiable, ne l'invente pas.
- Dans ce cas, reste prudent, dégrade plutôt vers jaune que vers vert/bleu, et indique que la confirmation mairie/service urbanisme est nécessaire.
- Pense au contexte 2026: enregistrement national en transition, mais procédures locales encore souvent applicables.
- Pour la couleur:
  - blue = cadre local très léger, friction faible, peu de signaux restrictifs.
  - green = faisable avec des démarches standard et sans barrière locale lourde connue.
  - yellow = possible mais encadré, conditionnel, ou juridiquement plus tendu.
  - red = très contraint, forte difficulté pour ce modèle, ou incompatibilité probable.
- "blue" doit rester rare.
- Si changement d'usage / compensation / régime très restrictif apparaît comme nécessaire ou très probable pour une exploitation dédiée, cela pousse vers red.
- Ne formule jamais cela comme un avis juridique définitif.

Consigne de sortie:
- Réponds uniquement avec un JSON valide conforme au schéma demandé.
- Résumé: 1 à 3 phrases courtes, actionnables.
- keyPoints: 3 à 5 puces courtes.
- nearbySuggestions: uniquement parmi les communes fournies ci-dessous, et seulement si elles semblent plus favorables ou utiles à explorer.
- Chaque "reason" de suggestion doit tenir en une phrase courte.

Commune cible:
${targetLine}

Communes voisines candidates:
${nearbyBlock}
`;
}

function buildSchema() {
  return {
    type: "object",
    properties: {
      target: {
        type: "object",
        properties: {
          communeCode: { type: "string", minLength: 1 },
          cityName: { type: "string", minLength: 1 },
          departmentName: { type: "string", minLength: 1 },
          regionName: { type: "string", minLength: 1 },
          status: { type: "string", enum: STATUS_VALUES },
          confidence: { type: "string", enum: CONFIDENCE_VALUES },
          summary: { type: "string", minLength: 1 },
          keyPoints: {
            type: "array",
            items: { type: "string", minLength: 1 },
            minItems: 3,
            maxItems: 5,
          },
          caution: { type: "string", minLength: 1 },
          sources: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string", minLength: 1 },
                url: { type: "string", minLength: 1 },
              },
              required: ["title", "url"],
              additionalProperties: false,
            },
            minItems: 2,
            maxItems: 5,
          },
        },
        required: [
          "communeCode",
          "cityName",
          "departmentName",
          "regionName",
          "status",
          "confidence",
          "summary",
          "keyPoints",
          "caution",
          "sources",
        ],
        additionalProperties: false,
      },
      nearbySuggestions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            communeCode: { type: "string", minLength: 1 },
            cityName: { type: "string", minLength: 1 },
            status: { type: "string", enum: STATUS_VALUES },
            reason: { type: "string", minLength: 1 },
          },
          required: ["communeCode", "cityName", "status", "reason"],
          additionalProperties: false,
        },
        maxItems: 6,
      },
    },
    required: ["target", "nearbySuggestions"],
    additionalProperties: false,
  };
}

function normalizeResult(
  raw: RawResponse,
  targetCommune: CommuneInput,
  nearbyCommunes: CommuneInput[],
): RawResponse {
  const nearbyCodes = new Set(nearbyCommunes.map((item) => item.code));

  const targetDepartmentName = targetCommune.departmentName || "Département à confirmer";
  const targetRegionName = targetCommune.regionName || "Région à confirmer";

  const normalizedTarget = {
    communeCode: sanitizeText(raw?.target?.communeCode, targetCommune.code),
    cityName: sanitizeText(raw?.target?.cityName, targetCommune.name),
    departmentName: sanitizeText(raw?.target?.departmentName, targetDepartmentName),
    regionName: sanitizeText(raw?.target?.regionName, targetRegionName),
    status: sanitizeStatus(raw?.target?.status, "yellow"),
    confidence: sanitizeConfidence(raw?.target?.confidence, "medium"),
    summary:
      sanitizeText(raw?.target?.summary) ||
      "La commune a été analysée, mais le résumé doit être confirmé avec la mairie ou le service urbanisme.",
    keyPoints:
      sanitizeKeyPoints(raw?.target?.keyPoints).length > 0
        ? sanitizeKeyPoints(raw?.target?.keyPoints)
        : [
            "Vérifier la procédure locale de déclaration ou d'enregistrement.",
            "Confirmer auprès de la mairie si un changement d'usage s'applique au cas visé.",
            "Valider les éventuelles limites ou conditions locales avant toute mise en location.",
          ],
    caution:
      sanitizeText(raw?.target?.caution) ||
      "Résumé informatif à confirmer auprès de la mairie ou du service urbanisme.",
    sources:
      sanitizeSources(raw?.target?.sources).length > 0
        ? sanitizeSources(raw?.target?.sources)
        : [],
  };

  const normalizedNearby = Array.isArray(raw?.nearbySuggestions)
    ? raw.nearbySuggestions
        .filter((item) => nearbyCodes.has(sanitizeText(item?.communeCode)))
        .map((item) => ({
          communeCode: sanitizeText(item?.communeCode),
          cityName: sanitizeText(item?.cityName),
          status: sanitizeStatus(item?.status, "green"),
          reason:
            sanitizeText(item?.reason) ||
            "Cadre à comparer avec la commune initiale.",
        }))
        .filter((item) => item.communeCode && item.cityName)
        .slice(0, 6)
    : [];

  if (normalizedNearby.length === 0 && ["yellow", "red"].includes(normalizedTarget.status)) {
    nearbyCommunes
      .slice(0, 3)
      .forEach((commune) => {
        normalizedNearby.push({
          communeCode: commune.code,
          cityName: commune.name,
          status: "yellow",
          reason: "Commune proche à comparer localement si tu veux une piste alternative.",
        });
      });
  }

  return {
    target: normalizedTarget,
    nearbySuggestions: normalizedNearby,
  };
}

function extractStructuredText(rawResponse: Record<string, unknown>) {
  const directOutputText = sanitizeText(rawResponse.output_text);
  if (directOutputText) {
    return directOutputText;
  }

  if (!Array.isArray(rawResponse.output)) {
    return "";
  }

  for (const item of rawResponse.output) {
    if (item?.type !== "message" || !Array.isArray(item.content)) {
      continue;
    }

    for (const contentItem of item.content) {
      if (contentItem?.type === "output_text") {
        const text = sanitizeText(contentItem.text);
        if (text) {
          return text;
        }
      }
    }
  }

  return "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    return json(
      { error: "OPENAI_API_KEY is missing. Configure it in Supabase secrets before using this function." },
      500,
    );
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const targetCommune = normalizeCommune(payload.targetCommune);
  const nearbyCommunes = Array.isArray(payload.nearbyCommunes)
    ? payload.nearbyCommunes.map(normalizeCommune).filter(Boolean) as CommuneInput[]
    : [];

  if (!targetCommune) {
    return json({ error: "A valid targetCommune is required." }, 400);
  }

  const openAiResponse = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      reasoning: { effort: "low" },
      instructions: buildPrompt(targetCommune, nearbyCommunes),
      input:
        `Analyse la faisabilité réglementaire des meublés de tourisme pour la commune cible ` +
        `${targetCommune.name} (${targetCommune.code}) et propose, si pertinent, des communes voisines plus favorables.`,
      tools: [
        {
          type: "web_search",
          external_web_access: true,
        },
      ],
      tool_choice: "required",
      include: ["web_search_call.action.sources"],
      text: {
        format: {
          type: "json_schema",
          name: "city_legislation_analysis",
          strict: true,
          schema: buildSchema(),
        },
      },
    }),
  });

  if (!openAiResponse.ok) {
    const errorText = await openAiResponse.text();
    return json(
      {
        error: "OpenAI request failed.",
        details: errorText,
      },
      502,
    );
  }

  const rawResponse = await openAiResponse.json();
  const structuredText = extractStructuredText(rawResponse);

  if (!structuredText) {
    return json(
      {
        error: "The model did not return structured text output.",
        details: rawResponse,
      },
      502,
    );
  }

  let parsed: RawResponse;
  try {
    parsed = JSON.parse(structuredText);
  } catch {
    return json(
      {
        error: "The model returned invalid JSON.",
        details: structuredText,
      },
      502,
    );
  }

  const normalized = normalizeResult(parsed, targetCommune, nearbyCommunes);
  return json(normalized);
});
