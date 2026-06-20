import { createFileRoute, Link } from "@tanstack/react-router";
import { LiveQueueBoard } from "@/components/live-queue-board";
import { Button } from "@/components/ui/button";
import { Hospital, Home } from "lucide-react";

export const Route = createFileRoute("/queue")({
  head: () => ({
    meta: [
      { title: "Live Queue – MediQueue" },
      { name: "description", content: "Watch the hospital queue update in real time across every department." },
    ],
  }),
  component: QueuePage,
});

function QueuePage() {
  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground"><Hospital className="h-4 w-4" /></div>
            <span className="font-bold">MediQueue</span>
          </Link>
          <Button asChild variant="outline" size="sm"><Link to="/"><Home className="mr-1 h-4 w-4" /> Home</Link></Button>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="text-3xl font-bold">Live Queue</h1>
        <p className="text-muted-foreground">Updates automatically — no refresh needed.</p>
        <div className="mt-6">
          <LiveQueueBoard />
        </div>
      </div>
    </div>
  );
}