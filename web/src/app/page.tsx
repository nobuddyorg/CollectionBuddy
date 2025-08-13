"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase";
import { User } from "./types";
import CategorySelect from "./components/CategorySelect";
import ItemCreate from "./components/ItemCreate";
import ItemList from "./components/ItemList";
import LoadingOverlay from "./components/LoadingOverlay";
import type {
  AuthChangeEvent,
  Session,
  User as SupabaseUser,
} from "@supabase/supabase-js";
import { useRouter } from "next/navigation";

function asUser(u: SupabaseUser | null): User | null {
  return u as unknown as User | null;
}

export default function Page() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null
  );
  const [refreshToken, setRefreshToken] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const handleSession = (session: Session | null) => {
      if (!active) return;
      const nextUser = asUser(session?.user ?? null);
      setUser(nextUser);
      setLoading(false);
      if (!nextUser) router.replace("/login");
    };

    supabase.auth.getSession().then(({ data }) => handleSession(data.session));

    const { data: sub } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) =>
        handleSession(session)
    );

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [router]);

  const signOut = useCallback(() => {
    void supabase.auth.signOut();
  }, []);

  const content = useMemo(() => {
    if (loading) return <LoadingOverlay />;
    if (!user) return null;

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

        <CategorySelect
          selectedCat={selectedCategoryId}
          onSelect={setSelectedCategoryId}
        />

        {selectedCategoryId && (
          <>
            <ItemCreate
              categoryId={selectedCategoryId}
              onCreated={() => setRefreshToken((k) => k + 1)}
            />
            <ItemList key={refreshToken} categoryId={selectedCategoryId} />
          </>
        )}
      </main>
    );
  }, [loading, user, signOut, selectedCategoryId, refreshToken]);

  return content;
}
