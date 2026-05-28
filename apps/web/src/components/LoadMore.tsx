import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LoadMore({
  loaded,
  total,
  hasMore,
  loading,
  onLoadMore,
}: {
  loaded: number;
  total: number;
  hasMore: boolean;
  loading?: boolean;
  onLoadMore: () => void;
}) {
  if (total === 0) return null;

  return (
    <div className="flex flex-col items-center gap-2 pt-2">
      <p className="text-xs text-muted-foreground">
        Showing {loaded} of {total}
      </p>
      {hasMore ? (
        <Button variant="outline" size="sm" disabled={loading} onClick={onLoadMore}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Load more
        </Button>
      ) : loaded > 0 ? (
        <p className="text-xs text-muted-foreground">End of list</p>
      ) : null}
    </div>
  );
}
