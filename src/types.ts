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
