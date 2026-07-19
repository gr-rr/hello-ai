"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

function ConfirmInner() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const code = params.get("code");
    const next = params.get("next") ?? "/";
    if (code && supabase) {
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
        router.replace(error ? "/?error=auth_callback_failed" : next);
      });
    } else {
      router.replace("/?error=auth_callback_failed");
    }
  }, [params, router]);

  return (
    <div className="page" style={{ alignItems: "center", justifyContent: "center" }}>
      <div className="spinner" />
    </div>
  );
}

export default function AuthConfirm() {
  return (
    <Suspense
      fallback={
        <div className="page" style={{ alignItems: "center", justifyContent: "center" }}>
          <div className="spinner" />
        </div>
      }
    >
      <ConfirmInner />
    </Suspense>
  );
}
