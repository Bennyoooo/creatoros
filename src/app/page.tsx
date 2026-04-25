export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center max-w-md px-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-3">CreatorOS</h1>
        <p className="text-gray-600 mb-6">
          AI-powered chat widgets that turn fan questions into product recommendations.
        </p>
        <a
          href="/demo"
          className="inline-block rounded-xl bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          Try Demo →
        </a>
      </div>
    </main>
  );
}
