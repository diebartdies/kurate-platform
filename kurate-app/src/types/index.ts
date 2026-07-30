export interface ProResult {
  id: string;
  score: number;
  pct: number;
  alias: string;
  bio: string;
  location: string;
  services: string[];
  photo: string | null;
  phone: string | null;
  email: string;
  averageRating: number;
  brandMatched: boolean;
  brandGeneric: boolean;
  modelMatched: boolean;
  modelGeneric: boolean;
  mustMatch: boolean;
}

export interface SearchResult {
  success: boolean;
  data: ProResult[];
  suggestions?: Suggestion[];
}

export interface Suggestion {
  type: string;
  label: string;
  params: Record<string, string>;
}

export interface ServiceTree {
  [area: string]: {
    [category: string]: {
      device: string;
      brands: string[];
    }[];
  };
}

export interface ServicesResponse {
  success: boolean;
  data: ServiceTree;
}

export interface BrandsResponse {
  success: boolean;
  data: string[];
}
