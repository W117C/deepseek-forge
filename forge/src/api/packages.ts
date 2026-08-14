import { api } from "./client";
import type { ApiPackage } from "./types";

export function listPackages(): Promise<ApiPackage[]> {
  return api<ApiPackage[]>("/v1/packages");
}

export function getPackage(slug: string): Promise<ApiPackage> {
  return api<ApiPackage>("/v1/packages/" + encodeURIComponent(slug));
}
