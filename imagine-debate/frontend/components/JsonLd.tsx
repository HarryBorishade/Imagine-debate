// Renders a JSON-LD structured-data block. Server component by default.
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      // JSON.stringify output is safe to inline; there is no user HTML here.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
