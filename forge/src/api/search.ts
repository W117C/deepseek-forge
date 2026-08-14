import { api } from "./client";
import type { ApiSearchHit } from "./types";

export function search(query: string): Promise<ApiSearchHit[]> {
  return api<ApiSearchHit[]>("/v1/search?q=" + encodeURIComponent(query));
}
