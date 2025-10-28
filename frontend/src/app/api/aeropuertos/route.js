const UPSTREAM = "https://1inf54-981-5e.inf.pucp.edu.pe/api/aeropuertos/obtenerTodos";

let cache = null;
let cacheTs = 0;
const TTL = 5 * 60 * 1000; // 5 minutos para actualizar

export async function GET() {
  const now = Date.now();

  if (cache && now - cacheTs < TTL) {
    return new Response(JSON.stringify(cache), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const res = await fetch(UPSTREAM);
    if (!res.ok) {
      if (cache) {
        return new Response(JSON.stringify(cache), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "Upstream error", status: res.status }), { status: 502 });
    }
    const data = await res.json();
    cache = data;
    cacheTs = Date.now();
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Proxy aeropuertos error:", err);
    if (cache) {
      return new Response(JSON.stringify(cache), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: "Fetch failed" }), { status: 500 });
  }
}
