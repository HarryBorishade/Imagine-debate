"use client";

import { useEffect } from "react";
import { useRouter, useParams } from "next/navigation";

export default function DebatePage() {
  const router = useRouter();
  const params = useParams();
  const debateId = params.debateId as string;

  useEffect(() => {
    // Redirect to lobby on initial load
    if (debateId) {
      router.push(`/debate/${debateId}/lobby`);
    }
  }, [debateId, router]);

  return null;
}
