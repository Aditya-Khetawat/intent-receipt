// A script the browser runs while parsing the server HTML, before first paint.
// On the client it renders as text/plain so React neither runs it nor warns (Next.js
// "Preventing flash before hydration" guide).
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
