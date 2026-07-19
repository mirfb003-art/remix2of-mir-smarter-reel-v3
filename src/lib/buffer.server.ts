// Buffer GraphQL client (server-only). Uses user's API token & endpoint.
export interface BufferClient {
  gql<T = unknown>(query: string, variables?: Record<string, unknown>): Promise<T>;
  testConnection(): Promise<{ ok: boolean; message: string }>;
  createPost(input: { channelId: string; text: string; mediaUrl: string }): Promise<{ postId: string; raw: unknown }>;
  getPost(id: string): Promise<{ analytics: Record<string, number>; raw: unknown } | null>;
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
