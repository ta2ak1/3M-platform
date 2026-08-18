import type { CommunityPost } from "../types";

export const mockPosts: CommunityPost[] = [
  {
    id: "post-1",
    title: "朝の隅田川サイクリング",
    summary: "静かな水辺と朝の風が気持ちいいです。周辺のカフェもおすすめ。",
    lat: 35.6855,
    lng: 139.771,
    photoUrl:
      "https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&w=900&q=80",
    createdAt: "2026-08-10T09:00:00.000Z",
  },
  {
    id: "post-2",
    title: "深川の屋台街ランチ",
    summary: "落ち着いた路地にたくさんの味が詰まっています。",
    lat: 35.6802,
    lng: 139.793,
    photoUrl:
      "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=900&q=80",
    createdAt: "2026-08-11T12:30:00.000Z",
  },
  {
    id: "post-3",
    title: "夜の東京タワー周辺",
    summary: "ライトアップが幻想的で、夜の散歩にぴったりでした。",
    lat: 35.6586,
    lng: 139.7454,
    photoUrl:
      "https://images.unsplash.com/photo-1536098561742-ca998e48cbcc?auto=format&fit=crop&w=900&q=80",
    createdAt: "2026-08-12T20:15:00.000Z",
  },
];
