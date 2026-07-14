import { FookieCloudMark } from "@/components/FookieCloudMark";
import { useSession } from "@/hooks/useSession";

export function AppTopBar() {
  const session = useSession();
  return (
    <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-white/[0.07] bg-black/90 px-6 backdrop-blur-md">
      <FookieCloudMark size="md" />
      {session ? (
        <span className="max-w-[16rem] truncate text-xs font-medium tracking-tight text-muted-foreground">
          {session.userName}
        </span>
      ) : null}
    </div>
  );
}
