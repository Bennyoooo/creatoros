import { ChatWidget } from "@/components/ChatWidget";
import { getCreatorConfig } from "@/lib/creators";
import { notFound } from "next/navigation";

interface ChatPageProps {
  params: Promise<{ slug: string }>;
}

export default async function ChatPage({ params }: ChatPageProps) {
  const { slug } = await params;
  const config = getCreatorConfig(slug);

  if (!config) {
    notFound();
  }

  return (
    <div className="h-screen w-full">
      <ChatWidget
        creatorSlug={config.slug}
        creatorName={config.name}
        creatorBio={config.bio}
      />
    </div>
  );
}
