import { api } from "./client";

export function submitRating(slug: string, score: number): Promise<{ id: string; average: number; count: number }> {
  return api("/v1/agents/" + encodeURIComponent(slug) + "/ratings", {
    method: "POST",
    body: JSON.stringify({ score }),
  });
}
