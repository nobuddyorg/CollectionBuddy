"use client";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase";
import { User } from "./types";
import CategorySelect from "./components/CategorySelect";
import ItemCreate from "./components/ItemCreate";
import ItemList from "./components/ItemList";
import GoogleSignInButton from "./components/GoogleSignInButton";
import Collectible from "./components/Collectible";
import Coin from "./components/Coin";
import type {
  AuthChangeEvent,
  Session,
  User as SupabaseUser,
} from "@supabase/supabase-js";

const EMOJIS = [
  "🧸",
  "🪙",
  "📮",
  "🎟️",
  "💎",
  "🐚",
  "🎁",
  "🎖️",
  "🧩",
  "📀",
] as const;
const COLORS = ["#4285F4", "#EA4335", "#FBBC05", "#34A853"] as const;
const CIRCLE_TEXT =
  "CollectionBuddy • Sammeln • Ordnen • Behalten • Deine Schätze im Blick • ";

function rng(seed: number) {
  let s = seed >>> 0;
  return () => (s = (1664525 * s + 1013904223) >>> 0) / 2 ** 32;
}

function makePositions(n: number, seed = 1337) {
  const r = rng(seed);
  return Array.from({ length: n }, () => ({
    x: `${r() * 520 - 260}px`,
    y: `${r() * 520 - 260}px`,
  }));
}

export default function Page() {
  const [user, setUser] = useState<User | null>(null);
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    supabase.auth
      .getUser()
      .then((res: { data: { user: SupabaseUser | null } }) => {
        setUser((res.data.user as User) ?? null);
      });

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        setUser((session?.user as User) ?? null);
      }
    );
    return () => authListener.subscription.unsubscribe();
  }, []);

  const signIn = () =>
    supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}${window.location.pathname}`,
      },
    });

  const signOut = () => supabase.auth.signOut();

  const POS = useMemo(() => makePositions(16), []);

  if (!user) {
    return (
      <main className="relative min-h-[100dvh] flex flex-col items-center justify-center overflow-hidden px-4 bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] overscroll-y-contain">
        <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight mb-2 sm:mb-4 z-20 relative">
          <span className="text-neutral-900 dark:text-neutral-100">
            Collection
          </span>
          <span className="text-neutral-500 dark:text-neutral-400">Buddy</span>
        </h1>
        <div className="h-[3px] w-36 bg-gradient-to-r from-neutral-900 to-neutral-500 dark:from-neutral-100 dark:to-neutral-400 rounded-full mb-4 sm:mb-6 z-20 relative" />
        <Coin
          text={CIRCLE_TEXT.repeat(2)}
          cta={<GoogleSignInButton onClick={signIn} />}
        />
        {POS.map((p, i) => (
          <Collectible
            key={i}
            delay={i * 0.35}
            color={COLORS[i % COLORS.length]}
            emoji={EMOJIS[i % EMOJIS.length]}
            x={p.x}
            y={p.y}
          />
        ))}
        <p className="fade-up mt-4 sm:mt-6 text-base sm:text-lg text-neutral-600 dark:text-neutral-300 text-center max-w-xl z-20 relative">
          Dein digitales Sammelalbum für Münzen, Plüschtiere, Briefmarken und
          alles, was dir am Herzen liegt.
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] p-8 flex flex-col gap-8 max-w-2xl mx-auto bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] overscroll-y-contain">
      <div className="flex justify-between items-center">
        <span className="text-sm opacity-70">{user.email}</span>
        <button
          onClick={signOut}
          className="px-3 py-1 rounded border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-900"
        >
          Sign out
        </button>
      </div>
      <CategorySelect selectedCat={selectedCat} onSelect={setSelectedCat} />
      {selectedCat && (
        <>
          <ItemCreate
            categoryId={selectedCat}
            onCreated={() => setRefreshKey((k) => k + 1)}
          />
          <ItemList key={refreshKey} categoryId={selectedCat} />
        </>
      )}
    </main>
  );
}
