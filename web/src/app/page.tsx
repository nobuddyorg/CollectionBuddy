"use client";
import { useEffect, useState } from "react";
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
import { useRouter } from "next/navigation";

export default function Page() {
  const [user, setUser] = useState<User | null>(null);
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        setUser((session?.user as User) ?? null);
        setLoading(false);
        if (!session) {
          router.push("/login");
        }
      }
    );

    supabase.auth
      .getUser()
      .then((res: { data: { user: SupabaseUser | null } }) => {
        if (!res.data.user) {
          router.push("/login");
        }
        setUser((res.data.user as User) ?? null);
        setLoading(false);
      });

    return () => authListener.subscription.unsubscribe();
  }, [router]);

  const signOut = () => supabase.auth.signOut();

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/60 backdrop-blur-sm">
        <div className="animate-spin h-8 w-8 rounded-full border-2 border-white/80 border-t-transparent" />
        <span className="text-white text-lg font-medium">Wird geladen...</span>
      </div>
    );
  }

  if (!user) {
    return null; // Should be redirected
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
