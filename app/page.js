export default function Page() {
  return (
    <main style={{fontFamily:'sans-serif',padding:24}}>
      <h1>Research Internet Bridge</h1>
      <p>Server-side fetch bridge is online.</p>
      <p>Use /api/fetch?url=https%3A%2F%2Fexample.com&amp;mode=head for metadata, or omit mode to stream the response.</p>
    </main>
  );
}
