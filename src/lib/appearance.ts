export const PAGE_STYLE_COOKIE = "rt_page_style";

export const PAGE_STYLE_IDS = [
  "forest",
  "midnight",
  "daylight",
  "ocean",
  "dusk",
] as const;

export type PageStyle = (typeof PAGE_STYLE_IDS)[number];

export const DEFAULT_PAGE_STYLE: PageStyle = "forest";

export type PageStyleOption = {
  id: PageStyle;
  name: string;
  hint: string;
  paper: string;
  surface: string;
  accent: string;
};

export const PAGE_STYLES: PageStyleOption[] = [
  {
    id: "forest",
    name: "Forest",
    hint: "Dark moss — the original look",
    paper: "#0d1210",
    surface: "#151b18",
    accent: "#3ecf8e",
  },
  {
    id: "midnight",
    name: "Midnight",
    hint: "Cool navy and ice blue",
    paper: "#0b1020",
    surface: "#141a2e",
    accent: "#6ea8ff",
  },
  {
    id: "daylight",
    name: "Daylight",
    hint: "Light paper and ink",
    paper: "#f3f1ea",
    surface: "#ffffff",
    accent: "#1f8a5b",
  },
  {
    id: "ocean",
    name: "Ocean",
    hint: "Deep teal and aqua",
    paper: "#071614",
    surface: "#102422",
    accent: "#3fd0c9",
  },
  {
    id: "dusk",
    name: "Dusk",
    hint: "Warm plum and amber",
    paper: "#160e14",
    surface: "#241820",
    accent: "#e0a45c",
  },
];

export function parsePageStyle(value: unknown): PageStyle {
  return PAGE_STYLE_IDS.includes(value as PageStyle)
    ? (value as PageStyle)
    : DEFAULT_PAGE_STYLE;
}

export function pageStyleCookieOptions() {
  return {
    httpOnly: false,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
  };
}
