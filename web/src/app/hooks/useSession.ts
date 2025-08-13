"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";
import type { Session, User as SupabaseUser, AuthChangeEvent } from "@supabase/supabase-js";
import type { User } from "../types";

function asUser(u: SupabaseUser | null): User | null {
    return u as unknown as User | null;
}

export function useSession() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
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
            (_e: AuthChangeEvent, s: Session | null) => handleSession(s)
        );

        return () => {
            active = false;
            sub.subscription.unsubscribe();
        };
    }, [router]);

    return { user, loading };
}
