import { listPackages } from "./packages";
import type { ApiPackage } from "./types";

export async function listBundles(): Promise<ApiPackage[]> {
  return (await listPackages()).filter((p) => p.type === "bundle");
}
