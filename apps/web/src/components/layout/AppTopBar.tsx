import { FookieCloudMark } from "@/components/FookieCloudMark";
import { useSession } from "@/hooks/useSession";

export function AppTopBar() {
  const session = useSession();
  return (
    <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-white/[0.07] bg-black/80 px-4 backdrop-blur-md">
      <FookieCloudMark size="md" />
      {session ? (
        <span className="truncate text-xs font-medium tracking-tight text-muted-foreground max-w-[16rem]">
          {session.userName}
        </span>
      ) : null}
    </div>
  );
}
