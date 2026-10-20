type ScanPageProps = PageProps<"/scans/[scanId]">;

export const instant = false;

export default async function ScanPage({ params }: ScanPageProps) {
  const { scanId } = await params;

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Scan</h1>
      <p className="mt-3 text-zinc-600">Scan ID: {scanId}</p>
    </main>
  );
}
