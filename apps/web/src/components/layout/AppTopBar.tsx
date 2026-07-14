import { FookieCloudMark } from "@/components/FookieCloudMark";
import { useSession } from "@/hooks/useSession";

const FOOKIE_CLOUD = "https://fookiecloud.com";

export function AppTopBar() {
  const session = useSession();
  return (
    <div className="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-white/[0.07] bg-black/90 px-4 backdrop-blur-md">
      <a
        href={FOOKIE_CLOUD}
        className="text-xs font-medium tracking-tight text-muted-foreground transition-colors hover:text-foreground"
      >
        Apps
      </a>
      {session ? (
        <span className="max-w-[16rem] truncate text-xs font-medium tracking-tight text-muted-foreground">
          {session.userName}
        </span>
      ) : null}
    </div>
  );
}
