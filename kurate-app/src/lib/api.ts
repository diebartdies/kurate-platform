import type { SearchResult, ServicesResponse, BrandsResponse } from '../types';

const API_BASE = '/api/v1';

export async function searchProfessionals(params: {
  service?: string;
  brand?: string;
  model?: string;
  provincia?: string;
  ciudad?: string;
  accion?: string;
  urgencia?: string;
  relaxBrand?: boolean;
  relaxModel?: boolean;
}): Promise<SearchResult> {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '' && value !== null) {
      query.set(key, String(value));
    }
  });
  const res = await fetch(`${API_BASE}/professionals/search?${query}`);
  return res.json();
}

export async function getServices(area?: string): Promise<ServicesResponse> {
  const query = area ? `?area=${encodeURIComponent(area)}` : '';
  const res = await fetch(`${API_BASE}/services${query}`);
  return res.json();
}

export async function getBrands(path: string): Promise<BrandsResponse> {
  const res = await fetch(`${API_BASE}/services/brands?path=${encodeURIComponent(path)}`);
  return res.json();
}
