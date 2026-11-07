// Shown instantly while a server-rendered page (receipt, console, dispute) loads.
export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8" role="status" aria-label="Loading page">
      <div className="skeleton h-8 w-64" />
      <div className="skeleton h-4 w-96 max-w-full mt-3" />
      <div className="grid md:grid-cols-3 gap-4 mt-8">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card p-5 space-y-3">
            <div className="skeleton h-4 w-1/2" />
            <div className="skeleton h-3 w-full" />
            <div className="skeleton h-3 w-4/5" />
          </div>
        ))}
      </div>
      <div className="card p-5 mt-4 space-y-3">
        <div className="skeleton h-4 w-1/3" />
        <div className="skeleton h-24 w-full" />
      </div>
    </div>
  );
}
