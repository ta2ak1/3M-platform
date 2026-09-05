export const urbanExperienceTags = [
  "緑がある",
  "休憩しやすい",
  "日陰がある",
  "歩きやすい",
  "子どもと行きやすい",
  "高齢者が過ごしやすい",
  "ベンチがある",
  "静か",
  "にぎわい",
  "眺めがよい",
  "水辺を感じる",
  "季節を感じる",
  "バリアフリー",
  "案内がわかりやすい",
  "夜も安心",
  "清潔感がある",
  "混雑しにくい",
  "駅から近い",
  "地域らしさ",
  "改善余地あり",
  "日陰不足",
  "ベンチ不足",
  "案内不足",
  "段差が気になる",
  "混雑が気になる",
] as const;

export type UrbanExperienceTag = (typeof urbanExperienceTags)[number];

const urbanExperienceTagSet = new Set<string>(urbanExperienceTags);

export function isUrbanExperienceTag(tag: string): tag is UrbanExperienceTag {
  return urbanExperienceTagSet.has(tag);
}

export function splitUrbanExperienceTags(tags: string[]) {
  return {
    standardTags: tags.filter(isUrbanExperienceTag),
    otherTags: tags.filter((tag) => !isUrbanExperienceTag(tag)),
  };
}
