export default function HomePage() {
  return (
    <main style={{ fontFamily: "sans-serif", padding: 24 }}>
      <h1>manji-standard-server-ts-next</h1>
      <p>Next.js + DDD scaffold.</p>
      <h2>API</h2>
      <ul>
        <li>
          <code>POST /api/users</code> — create user
        </li>
        <li>
          <code>GET /api/users/[id]</code> — get user
        </li>
        <li>
          <code>GET /api/health</code> — health check
        </li>
      </ul>
    </main>
  );
}
