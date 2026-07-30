// Buffer GraphQL client (server-only). Uses user's API token & endpoint.
export interface BufferPostMetrics {
  id: string;
  text: string | null;
  sentAt: string | null;
  metricsUpdatedAt: string | null;
  metrics: Record<string, number>;
  raw: unknown;
}
export type PublishMode = "addToQueue" | "shareNow" | "customScheduled";
export interface BufferClient {
  gql<T = unknown>(query: string, variables?: Record<string, unknown>): Promise<T>;
  testConnection(): Promise<{ ok: boolean; message: string }>;
  verifySchema(): Promise<{ ok: boolean; hasCreatePost: boolean; mutationName: string | null; inputFields: string[]; message: string }>;
  createPost(input: { channelId: string; text: string; mediaUrl: string; mode?: PublishMode; dueAt?: string | null }): Promise<{ postId: string; raw: unknown }>;
  getPost(id: string): Promise<{ analytics: Record<string, number>; raw: unknown } | null>;
  getChannelPostsMetrics(channelId: string, limit?: number): Promise<BufferPostMetrics[]>;
}

// Normalize Buffer metric names/types to our canonical keys.
export function normalizeBufferMetrics(metrics: Array<{ type?: string | null; name?: string | null; value?: number | string | null }>): Record<string, number> {
  const out: Record<string, number> = {};
  const keyMap: Record<string, string> = {
    views: "views", view: "views", videoviews: "views", plays: "views",
    impressions: "impressions", impression: "impressions",
    likes: "likes", like: "likes", reactions: "likes", favorites: "likes",
    comments: "comments", comment: "comments", replies: "comments",
    shares: "shares", share: "shares", reposts: "shares", retweets: "shares",
    saves: "saves", save: "saves", bookmarks: "saves",
    reach: "reach",
  };
  for (const m of metrics ?? []) {
    const raw = String(m.name ?? m.type ?? "").toLowerCase().replace(/[\s_-]/g, "");
    const key = keyMap[raw];
    if (!key) continue;
    const val = Number(m.value ?? 0);
    if (!Number.isFinite(val)) continue;
    out[key] = (out[key] ?? 0) + val;
  }
  // Fallback: use impressions as views if views missing.
  if (out.views == null && out.impressions != null) out.views = out.impressions;
  return out;
}

interface SchemaInfo {
  shareModes: string[];
  schedulingTypes: string[];
  mediaField: string | null;
  mediaIsList: boolean;
  mediaObjectFields: string[];
  payloadSelection: string;
}

type Gql = <T>(query: string, variables?: Record<string, unknown>) => Promise<T>;

const schemaCache = new Map<string, SchemaInfo>();

function unwrap(t: any): any {
  let cur = t;
  let isList = false;
  while (cur?.ofType) {
    if (cur.kind === "LIST") isList = true;
    cur = cur.ofType;
  }
  return { name: cur?.name ?? null, kind: cur?.kind ?? null, isList };
}

async function introspect(gql: Gql, cacheKey = "default"): Promise<SchemaInfo> {
  const cached = schemaCache.get(cacheKey);
  if (cached) return cached;

  const fallback: SchemaInfo = {
    shareModes: ["addToQueue", "shareNow", "customScheduled"],
    schedulingTypes: ["automatic"],
    mediaField: "media",
    mediaIsList: true,
    mediaObjectFields: ["url", "type"],
    payloadSelection: "__typename",
  };

  try {
    const data = await gql<any>(`query BufferSchema {
      input: __type(name: "CreatePostInput") {
        inputFields { name type { kind name ofType { kind name ofType { kind name ofType { kind name } } } } }
      }
      shareMode: __type(name: "ShareMode") { enumValues { name } }
      scheduling: __type(name: "SchedulingType") { enumValues { name } }
      payload: __type(name: "PostActionPayload") { fields { name type { kind name ofType { kind name } } } }
    }`);

    const inputFields: any[] = data?.input?.inputFields ?? [];
    const mediaCandidates = ["media", "assets", "attachments", "videos", "asset", "attachment", "mediaItems"];
    const mediaField = inputFields.find((f) => mediaCandidates.includes(f.name));
    let mediaObjectFields: string[] = ["url", "type"];
    let mediaIsList = true;
    if (mediaField) {
      const info = unwrap(mediaField.type);
      mediaIsList = info.isList;
      if (info.name) {
        try {
          const sub = await gql<any>(`query M($n: String!) { __type(name: $n) { inputFields { name } } }`, { n: info.name });
          const names: string[] = (sub?.__type?.inputFields ?? []).map((f: any) => f.name);
          if (names.length) mediaObjectFields = names;
        } catch { /* keep defaults */ }
      }
    }

    const payloadFields: any[] = data?.payload?.fields ?? [];
    const names = payloadFields.map((f) => f.name);
    let payloadSelection = "__typename";
    if (names.includes("id")) payloadSelection = "id";
    else if (names.includes("post")) payloadSelection = "post { id }";
    else if (names.includes("postId")) payloadSelection = "postId";
    else if (names.length) {
      const scalar = payloadFields.find((f) => unwrap(f.type).kind === "SCALAR");
      payloadSelection = scalar ? scalar.name : "__typename";
    }

    const info: SchemaInfo = {
      shareModes: (data?.shareMode?.enumValues ?? []).map((v: any) => v.name),
      schedulingTypes: (data?.scheduling?.enumValues ?? []).map((v: any) => v.name),
      mediaField: mediaField?.name ?? null,
      mediaIsList,
      mediaObjectFields,
      payloadSelection,
    };
    if (!info.shareModes.length) info.shareModes = fallback.shareModes;
    if (!info.schedulingTypes.length) info.schedulingTypes = fallback.schedulingTypes;
    schemaCache.set(cacheKey, info);
    return info;
  } catch {
    return fallback;
  }
}

export function makeBufferClient(token: string, endpoint: string): BufferClient {
  const url = endpoint || "https://graphql.buffer.com";


  async function gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });
    const body = await res.text();
    if (!res.ok) throw new Error(`Buffer ${res.status}: ${body}`);
    const parsed = JSON.parse(body) as { data?: T; errors?: Array<{ message: string }> };
    if (parsed.errors?.length) throw new Error("Buffer error: " + parsed.errors.map((e) => e.message).join("; "));
    return parsed.data as T;
  }

  return {
    gql,
    async testConnection() {
      try {
        await gql<{ viewer: { id: string } }>(`query { viewer { id } }`);
        return { ok: true, message: "Connected" };
      } catch (e) {
        return { ok: false, message: e instanceof Error ? e.message : String(e) };
      }
    },
    async verifySchema() {
      try {
        const data = await gql<{ __schema: { mutationType: { fields: Array<{ name: string; args: Array<{ name: string; type: { name: string | null; ofType?: { name: string | null } } }> }> } } }>(
          `query { __schema { mutationType { fields { name args { name type { name ofType { name } } } } } } }`,
        );
        const fields = data.__schema?.mutationType?.fields ?? [];
        const candidates = ["createPost", "createUpdate", "publishPost", "schedulePost"];
        const found = fields.find((f) => candidates.includes(f.name));
        if (!found) {
          return { ok: false, hasCreatePost: false, mutationName: null, inputFields: [], message: `No publish mutation found. Available: ${fields.map((f) => f.name).slice(0, 15).join(", ")}` };
        }
        return { ok: true, hasCreatePost: true, mutationName: found.name, inputFields: found.args.map((a) => a.name), message: `Found mutation "${found.name}"` };
      } catch (e) {
        return { ok: false, hasCreatePost: false, mutationName: null, inputFields: [], message: e instanceof Error ? e.message : String(e) };
      }
    },
    async createPost({ channelId, text, mediaUrl, mode = "addToQueue", dueAt = null }) {
      const schema = await introspect(gql, url);

      // ShareMode is required by CreatePostInput. Map our mode onto the real enum values.
      const pickEnum = (values: string[], patterns: RegExp[], fallback?: string) => {
        for (const p of patterns) {
          const hit = values.find((v) => p.test(v));
          if (hit) return hit;
        }
        return fallback ?? values[0];
      };
      const shareMode =
        mode === "shareNow"
          ? pickEnum(schema.shareModes, [/now/i, /share/i])
          : mode === "customScheduled"
            ? pickEnum(schema.shareModes, [/custom/i, /schedul/i, /specific/i, /time/i])
            : pickEnum(schema.shareModes, [/queue/i, /next/i, /add/i]);

      const input: Record<string, unknown> = {
        channelId,
        text,
        mode: shareMode,
        // Always required by the schema.
        schedulingType: pickEnum(schema.schedulingTypes, [/^automatic$/i, /automatic/i, /auto/i]),
      };
      if (mode === "customScheduled" && dueAt) input.dueAt = new Date(dueAt).toISOString();

      // Media field name and shape vary between Buffer schema versions — detect it.
      if (schema.mediaField) {
        const isVideo = /\.(mp4|mov|m4v|webm)(\?|$)/i.test(mediaUrl) || /\/video\/upload\//i.test(mediaUrl);
        const fields = schema.mediaObjectFields;
        // Buffer's AssetInput is a OneOf union: { video: { url } } | { image: { url } }
        const oneOfKey = isVideo
          ? fields.find((f) => /^video$/i.test(f))
          : fields.find((f) => /^image$/i.test(f)) ?? fields.find((f) => /^photo$/i.test(f));

        let value: Record<string, unknown>;
        if (oneOfKey) {
          value = { [oneOfKey]: { url: mediaUrl } };
        } else {
          const mediaObj: Record<string, unknown> = {};
          for (const f of fields) {
            if (/^(url|mediaurl|videourl|source)$/i.test(f)) mediaObj[f] = mediaUrl;
            else if (/^(type|mediatype)$/i.test(f)) mediaObj[f] = isVideo ? "video" : "image";
            else if (/^(thumbnail|thumbnailurl|previewurl)$/i.test(f)) mediaObj[f] = mediaUrl;
          }
          value = Object.keys(mediaObj).length ? mediaObj : { url: mediaUrl };
        }
        input[schema.mediaField] = schema.mediaIsList ? [value] : value;
      }


      const data = await gql<Record<string, any>>(
        `mutation CreatePost($input: CreatePostInput!) {
          createPost(input: $input) { ${schema.payloadSelection} }
        }`,
        { input },
      );
      const payload = data?.createPost ?? {};
      const postId = String(payload.id ?? payload.post?.id ?? payload.postId ?? "");
      return { postId, raw: data };
    },
    async getPost(id) {
      try {
        const data = await gql<{ post: { id: string; analytics?: Record<string, number> } | null }>(
          `query Post($id: String!) { post(id: $id) { id analytics } }`,
          { id },
        );
        if (!data.post) return null;
        return { analytics: data.post.analytics ?? {}, raw: data.post };
      } catch {
        return null;
      }
    },
    async getChannelPostsMetrics(channelId, limit = 50) {
      try {
        const data = await gql<{
          posts: {
            nodes: Array<{
              id: string;
              text: string | null;
              sentAt: string | null;
              metricsUpdatedAt: string | null;
              metrics: Array<{ type?: string | null; name?: string | null; value: number | string | null; unit?: string | null }> | null;
            }>;
          };
        }>(
          `query GetChannelPostsMetrics($channelId: String!, $limit: Int!) {
            posts(input: { channelId: $channelId, status: SENT, limit: $limit }) {
              nodes {
                id
                text
                sentAt
                metricsUpdatedAt
                metrics { type name value unit }
              }
            }
          }`,
          { channelId, limit },
        );
        return (data.posts?.nodes ?? []).map((n) => ({
          id: n.id,
          text: n.text,
          sentAt: n.sentAt,
          metricsUpdatedAt: n.metricsUpdatedAt,
          metrics: normalizeBufferMetrics(n.metrics ?? []),
          raw: n,
        }));
      } catch {
        return [];
      }
    },
  };
}
