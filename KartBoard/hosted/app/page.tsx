export default function Home() {
  return (
    <main className="launch-shell">
      <section className="launch-card">
        <div className="launch-mark" aria-hidden="true">K</div>
        <p className="launch-eyebrow">Hosted demonstration</p>
        <h1>Kart Board</h1>
        <p className="launch-copy">Keep drivers, families and officials aligned with one live practice running order—wherever they are.</p>
        <div className="launch-actions">
          <a className="launch-primary" href="/board.html">Open public board</a>
          <a className="launch-secondary" href="/control.html">Open controller</a>
        </div>
        <p className="launch-note">The public board is view-only. Controller updates require an access code.</p>
      </section>
    </main>
  );
}
