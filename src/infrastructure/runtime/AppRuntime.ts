import { getIdentifier, getName, getTauriVersion, getVersion } from "@tauri-apps/api/app";
import { isTauri } from "@tauri-apps/api/core";

export interface AppRuntimeInfo {
  native: boolean;
  name: string;
  version: string;
  identifier: string;
  tauriVersion: string;
}

export async function getAppRuntimeInfo(): Promise<AppRuntimeInfo> {
  if (!isTauri()) {
    return {
      native: false,
      name: "Lý Thuyết Lái Xe",
      version: "web-dev",
      identifier: "browser-preview",
      tauriVersion: "—",
    };
  }

  const [name, version, identifier, tauriVersion] = await Promise.all([
    getName(),
    getVersion(),
    getIdentifier(),
    getTauriVersion(),
  ]);

  return {
    native: true,
    name,
    version,
    identifier,
    tauriVersion,
  };
}
