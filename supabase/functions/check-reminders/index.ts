// Edge Function déclenchée toutes les 15 min par pg_cron.
// Vérifie l'heure de Paris et envoie les rappels dus, en évitant les doublons via notification_log.
// Déploiement : supabase functions deploy check-reminders --no-verify-jwt

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;

webpush.setVapidDetails("mailto:foyer-app@example.com", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function parisParts(now: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    weekday: get("weekday"), // "Mon", "Tue", ...
    year: get("year"),
    month: get("month"),
    day: parseInt(get("day"), 10),
    hour: parseInt(get("hour"), 10),
    minute: parseInt(get("minute"), 10),
  };
}

function within(minute: number, hour: number, targetHour: number) {
  return hour === targetHour && minute < 15;
}

async function sendToProfile(profileId: string, title: string, body: string, url = "/") {
  const { data: subs } = await admin.from("push_subscriptions").select("*").eq("profile_id", profileId);
  for (const sub of subs ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ title, body, url })
      );
    } catch (err: unknown) {
      const statusCode = (err as { statusCode?: number })?.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        // Abonnement expiré ou désinstallé — on le retire
        await admin.from("push_subscriptions").delete().eq("id", sub.id);
      } else {
        console.error("push error", err);
      }
    }
  }
}

async function alreadySent(profileId: string, reminderKey: string) {
  const { data } = await admin
    .from("notification_log")
    .select("id")
    .eq("profile_id", profileId)
    .eq("reminder_key", reminderKey)
    .maybeSingle();
  return !!data;
}

async function markSent(profileId: string, reminderKey: string) {
  await admin.from("notification_log").upsert(
    { profile_id: profileId, reminder_key: reminderKey },
    { onConflict: "profile_id,reminder_key" }
  );
}

Deno.serve(async () => {
  const now = new Date();
  const p = parisParts(now);
  const isMonday = p.weekday === "Mon";
  const isSunday = p.weekday === "Sun";
  const dateKey = `${p.year}-${p.month}-${String(p.day).padStart(2, "0")}`;

  const dueWeight = isMonday && within(p.minute, p.hour, 7);
  const inFirstWeek = p.day >= 1 && p.day <= 7;
  const inThirdWeek = p.day >= 15 && p.day <= 21;
  const duePhoto = isMonday && (inFirstWeek || inThirdWeek) && within(p.minute, p.hour, 7);
  const dueFood14 = within(p.minute, p.hour, 14);
  const dueFood21 = within(p.minute, p.hour, 21);
  const dueMealPlan = isSunday && within(p.minute, p.hour, 19);
  const dueBudgetCheck = (p.hour === 8 || p.hour === 20) && p.minute < 15;

  if (!dueWeight && !duePhoto && !dueFood14 && !dueFood21 && !dueMealPlan && !dueBudgetCheck) {
    return new Response(JSON.stringify({ skipped: true, parisTime: p }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Profils ayant activé les notifications sur au moins un appareil
  const { data: subscribedProfiles } = await admin
    .from("push_subscriptions")
    .select("profile_id, profiles(id, household_id, display_name)");
  const profiles = Array.from(
    new Map((subscribedProfiles ?? []).map((s: any) => [s.profile_id, s.profiles])).values()
  ) as { id: string; household_id: string; display_name: string }[];

  let sentCount = 0;

  for (const profile of profiles) {
    if (dueWeight) {
      const key = `weight-${dateKey}`;
      if (!(await alreadySent(profile.id, key))) {
        await sendToProfile(profile.id, "⚖️ Pesée du lundi", "C'est le jour de ta pesée hebdomadaire !", "/sport/poids");
        await markSent(profile.id, key);
        sentCount++;
      }
    }
    if (duePhoto) {
      const key = `photo-${dateKey}`;
      if (!(await alreadySent(profile.id, key))) {
        await sendToProfile(profile.id, "📷 Photo de progression", "C'est le moment de prendre ta photo de la quinzaine.", "/sport/poids");
        await markSent(profile.id, key);
        sentCount++;
      }
    }
    if (dueFood14) {
      const key = `food14-${dateKey}`;
      if (!(await alreadySent(profile.id, key))) {
        await sendToProfile(profile.id, "🍽️ Journal alimentaire", "N'oublie pas de noter ce que tu as mangé.", "/nourriture/objectifs");
        await markSent(profile.id, key);
        sentCount++;
      }
    }
    if (dueFood21) {
      const key = `food21-${dateKey}`;
      if (!(await alreadySent(profile.id, key))) {
        await sendToProfile(profile.id, "🍽️ Journal alimentaire", "Un dernier point sur la journée avant de te coucher ?", "/nourriture/objectifs");
        await markSent(profile.id, key);
        sentCount++;
      }
    }
  }

  if (dueMealPlan) {
    const householdIds = Array.from(new Set(profiles.map((p2) => p2.household_id)));
    for (const householdId of householdIds) {
      const nextMonday = new Date(now);
      nextMonday.setUTCDate(nextMonday.getUTCDate() + ((8 - nextMonday.getUTCDay()) % 7 || 7));
      const weekStart = nextMonday.toISOString().slice(0, 10);
      const weekEndDate = new Date(nextMonday);
      weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 6);
      const weekEnd = weekEndDate.toISOString().slice(0, 10);

      const { count } = await admin
        .from("meal_plan_entries")
        .select("id", { count: "exact", head: true })
        .eq("household_id", householdId)
        .gte("plan_date", weekStart)
        .lte("plan_date", weekEnd);

      if (!count || count === 0) {
        const key = `mealplan-${dateKey}`;
        for (const profile of profiles.filter((p2) => p2.household_id === householdId)) {
          if (!(await alreadySent(profile.id, key))) {
            await sendToProfile(
              profile.id,
              "📅 Plan de repas vide",
              "Aucun repas planifié pour la semaine prochaine — un petit tour dans Nourriture ?",
              "/nourriture/plan"
            );
            await markSent(profile.id, key);
            sentCount++;
          }
        }
      }
    }
  }

  if (dueBudgetCheck) {
    const monthStart = `${p.year}-${p.month}-01`;
    for (const profile of profiles) {
      const { data: categories } = await admin
        .from("budget_categories")
        .select("id, name, monthly_limit_eur")
        .eq("profile_id", profile.id)
        .not("monthly_limit_eur", "is", null);

      for (const cat of categories ?? []) {
        const { data: transactions } = await admin
          .from("budget_transactions")
          .select("amount")
          .eq("profile_id", profile.id)
          .eq("category_id", cat.id)
          .gte("occurred_at", monthStart);
        const spent = (transactions ?? []).reduce((sum: number, t: { amount: number }) => sum + t.amount, 0);

        if (spent >= cat.monthly_limit_eur) {
          const key = `budget-${cat.id}-${p.year}-${p.month}`;
          if (!(await alreadySent(profile.id, key))) {
            await sendToProfile(
              profile.id,
              "💶 Budget dépassé",
              `"${cat.name}" : ${spent.toFixed(0)}€ dépensés sur ${cat.monthly_limit_eur}€ ce mois-ci.`,
              "/budget/depenses"
            );
            await markSent(profile.id, key);
            sentCount++;
          }
        }
      }
    }
  }

  return new Response(JSON.stringify({ sentCount, parisTime: p }), {
    headers: { "Content-Type": "application/json" },
  });
});
