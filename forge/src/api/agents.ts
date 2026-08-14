import { listPackages } from "./packages";
import type { ApiPackage } from "./types";

export async function listAgents(): Promise<ApiPackage[]> {
  return (await listPackages()).filter((p) => p.type === "agent");
}
