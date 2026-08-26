// Supabase Edge Function — lit un ticket de caisse avec Claude (vision) et renvoie les articles + prix.
// La clé ANTHROPIC_API_KEY reste ici, côté serveur : jamais exposée au navigateur.
// Déploiement : supabase functions deploy scan-receipt

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const MODEL = "claude-haiku-4-5-20251001"; // rapide et peu coûteux, largement suffisant pour lire un ticket

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { imageBase64, mediaType } = await req.json();
    if (!imageBase64) {
      return new Response(JSON.stringify({ error: "imageBase64 manquant" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY non configurée sur le serveur" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mediaType || "image/jpeg", data: imageBase64 },
              },
              {
                type: "text",
                text:
                  "Voici un ticket de caisse. Extrait chaque article acheté avec son prix final (après remise éventuelle). " +
                  'Réponds UNIQUEMENT avec un tableau JSON brut, sans texte autour, sans balises markdown, au format exact : ' +
                  '[{"name": "nom de l\'article", "price": 12.34}]. ' +
                  "Ignore les lignes de total, sous-total, TVA, mode de paiement, monnaie rendue. " +
                  "Si un prix n'est pas lisible avec certitude, ignore la ligne plutôt que d'inventer un chiffre.",
              },
            ],
          },
        ],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      return new Response(JSON.stringify({ error: `Anthropic API: ${errText}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await anthropicRes.json();
    const textBlock = (data.content ?? []).find((b: { type: string }) => b.type === "text");
    const raw = textBlock?.text ?? "[]";
    const cleaned = raw.replace(/```json|```/g, "").trim();

    let items: unknown = [];
    try {
      items = JSON.parse(cleaned);
    } catch {
      items = [];
    }

    return new Response(JSON.stringify({ items }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
