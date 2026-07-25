// Buffer GraphQL client (server-only). Uses user's API token & endpoint.
export interface BufferPostMetrics {
  id: string;
  text: string | null;
  sentAt: string | null;
  metricsUpdatedAt: string | null;
  metrics: Record<string, number>;
  raw: unknown;
}
export interface BufferClient {
  gql<T = unknown>(query: string, variables?: Record<string, unknown>): Promise<T>;
  testConnection(): Promise<{ ok: boolean; message: string }>;
  verifySchema(): Promise<{ ok: boolean; hasCreatePost: boolean; mutationName: string | null; inputFields: string[]; message: string }>;
  createPost(input: { channelId: string; text: string; mediaUrl: string }): Promise<{ postId: string; raw: unknown }>;
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
    async createPost({ channelId, text, mediaUrl }) {
      // Standard Buffer publish mutation. Users on different Buffer versions can adjust their endpoint.
      const data = await gql<{ createPost: { id: string } }>(
        `mutation CreatePost($organizationId: String, $channels: [String!]!, $text: String!, $media: [MediaInput!]) {
          createPost(input: { channels: $channels, text: $text, media: $media, schedulingType: NOW }) {
            id
          }
        }`,
        {
          channels: [channelId],
          text,
          media: [{ url: mediaUrl, type: "VIDEO" }],
        },
      );
      return { postId: data.createPost.id, raw: data };
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
  };
}
