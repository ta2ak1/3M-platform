export type CommunityPost = {
  id: string;
  title: string;
  summary: string;
  lat: number;
  lng: number;
  photoUrl: string;
  createdAt: string;
  capturedAt?: string;
  locationSource?: "exif" | "device" | "manual" | "fallback";
  contentLicense?: "all-rights-reserved" | "cc-by-4.0";
  tags?: string[];
  aiTags?: string[];
  humanTags?: string[];
};

export type AdminPlace = {
  id: string;
  name: string;
  category: string;
  city: string;
  prefecture: string;
  lat: number;
  lng: number;
};

export type RegionalInsight = {
  lens: "policy" | "tourism" | "community";
  overview: string;
  civicSignals: string;
  adminGap: string;
  actionHint: string;
  collectionTheme: string;
  dataQualityNote: string;
  caveat: string;
  generatedAt: string;
  source: "ai" | "fallback";
};
