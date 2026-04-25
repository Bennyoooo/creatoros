import { ChatWidget } from "@/components/ChatWidget";
import { getCreatorConfig } from "@/lib/creators";
import { notFound } from "next/navigation";

interface HostedPageProps {
  params: Promise<{ slug: string }>;
}

export default async function HostedPage({ params }: HostedPageProps) {
  const { slug } = await params;
  const config = getCreatorConfig(slug);

  if (!config) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-lg h-screen flex flex-col">
        <ChatWidget
          creatorSlug={config.slug}
          creatorName={config.name}
          creatorBio={config.bio}
        />
      </div>
    </main>
  );
}
