"use client";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase";
import { User } from "./types";
import CategorySelect from "./components/CategorySelect";
import ItemCreate from "./components/ItemCreate";
import ItemList from "./components/ItemList";
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

type CSSVarStyle = React.CSSProperties & {
  ["--x"]?: string;
  ["--y"]?: string;
  ["--delay"]?: string;
};

type CollectibleProps = {
  delay: number;
  color: string;
  emoji: string;
  x: string;
  y: string;
};

function GoogleSignInButton({
  onClick,
}: {
  onClick: () => Promise<unknown> | void;
}) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      await onClick();
    } catch {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={handleClick}
        disabled={loading}
        aria-label="Mit Google anmelden"
        className="relative flex items-center justify-center rounded-md border border-[#747775] dark:border-neutral-500 bg-white hover:bg-[#f8f9fa] active:bg-[#f1f3f4] dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:active:bg-neutral-600 px-4 h-12 shadow-sm hover:shadow-md transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
        style={{ fontFamily: "Roboto, sans-serif", fontWeight: 500 }}
      >
        {!loading && (
          <>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 48 48"
              className="w-5 h-5 mr-3 flex-shrink-0"
            >
              <path
                fill="#EA4335"
                d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
              />
              <path
                fill="#4285F4"
                d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
              />
              <path
                fill="#FBBC05"
                d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
              />
              <path
                fill="#34A853"
                d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
              />
            </svg>
            <span className="text-[#3c4043] dark:text-neutral-100 text-sm">
              Mit Google anmelden
            </span>
          </>
        )}
      </button>

      {loading && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/60 backdrop-blur-sm">
          <div className="animate-spin h-8 w-8 rounded-full border-2 border-white/80 border-t-transparent" />
          <span className="text-white text-lg font-medium">
            Wird geladen...
          </span>
        </div>
      )}
    </>
  );
}

function Collectible({ delay, color, emoji, x, y }: CollectibleProps) {
  const style: CSSVarStyle = {
    width: "32px",
    height: "32px",
    backgroundColor: color,
    ["--delay"]: `${delay}s`,
    ["--x"]: x,
    ["--y"]: y,
  };
  return (
    <div
      className="absolute collectible flex items-center justify-center rounded-full text-lg text-white/95 shadow z-0 pointer-events-none"
      style={style}
    >
      {emoji}
    </div>
  );
}

function Coin({ text, cta }: { text: string; cta: React.ReactNode }) {
  return (
    <div className="relative w-[340px] h-[340px] sm:w-[380px] sm:h-[380px]">
      <svg viewBox="0 0 380 380" className="w-full h-full">
        <defs>
          <path
            id="rimTextPath"
            d="M190,190 m-160,0 a160,160 0 1,1 320,0 a160,160 0 1,1 -320,0"
          />
        </defs>

        <circle
          cx="190"
          cy="190"
          r="180"
          fill="none"
          className="stroke-neutral-300 dark:stroke-neutral-700"
          strokeWidth="3"
          strokeDasharray="6 4"
          opacity="0.85"
        />
        <circle
          cx="190"
          cy="190"
          r="153"
          fill="none"
          className="stroke-neutral-300 dark:stroke-neutral-700"
          strokeWidth="1.5"
          strokeDasharray="3 3"
          opacity="0.6"
        />

        <text
          fontSize="16"
          className="fill-neutral-400 dark:fill-neutral-500"
          style={{ letterSpacing: 4, fontFamily: "'Courier New', monospace" }}
          opacity="0.9"
        >
          <textPath href="#rimTextPath" startOffset="50%" textAnchor="middle">
            {text}
          </textPath>
        </text>

        <g
          transform="translate(190,135) scale(0.65,0.85)"
          fill="none"
          strokeLinejoin="round"
          strokeLinecap="round"
          opacity="0.9"
          className="stroke-neutral-300 dark:stroke-neutral-700"
        >
          <path d="M-128 0 L0 -64 L128 0 Z" />
          <line x1="-140" y1="0" x2="140" y2="0" />
          <line x1="-140" y1="10" x2="140" y2="10" />
          <rect x="-90" y="10" width="36" height="120" rx="4" />
          <rect x="-18" y="10" width="36" height="120" rx="4" />
          <rect x="54" y="10" width="36" height="120" rx="4" />
          <line x1="-82" y1="20" x2="-82" y2="122" opacity=".5" />
          <line x1="-72" y1="20" x2="-72" y2="122" opacity=".5" />
          <line x1="-62" y1="20" x2="-62" y2="122" opacity=".5" />
          <line x1="-10" y1="20" x2="-10" y2="122" opacity=".5" />
          <line x1="0" y1="20" x2="0" y2="122" opacity=".5" />
          <line x1="10" y1="20" x2="10" y2="122" opacity=".5" />
          <line x1="62" y1="20" x2="62" y2="122" opacity=".5" />
          <line x1="72" y1="20" x2="72" y2="122" opacity=".5" />
          <line x1="82" y1="20" x2="82" y2="122" opacity=".5" />
          <rect x="-150" y="132" width="300" height="22" />
          <rect x="-160" y="154" width="320" height="14" />
          <line x1="-170" y1="168" x2="170" y2="168" />
        </g>
      </svg>
      <div className="absolute inset-0 grid place-items-center z-30">{cta}</div>
    </div>
  );
}

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
