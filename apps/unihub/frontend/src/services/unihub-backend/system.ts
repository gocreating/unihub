import { API_BASE_URL } from './index';

export interface SystemVersion {
  version: string;
}

export async function getSystemVersion(): Promise<SystemVersion> {
  const resp = await fetch(`${API_BASE_URL}/api/v1/system/version/`);
  return resp.json() as Promise<SystemVersion>;
}
