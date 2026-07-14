import { FookieCloudMark } from "@/components/FookieCloudMark";

export function BrandSplash(props: {
  title: string;
  subtitle?: string;
  error?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex h-full min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-foreground animate-pulse">
        {props.title.charAt(0)}
      </div>
      <div className="space-y-1.5">
        <div className="text-lg font-semibold tracking-tight">{props.title}</div>
        <div className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
          <span>by</span>
          <FookieCloudMark size="md" />
        </div>
        {props.error ? (
          <p className="pt-2 text-sm text-destructive">{props.error}</p>
        ) : props.subtitle ? (
          <p className="pt-2 text-xs text-muted-foreground">{props.subtitle}</p>
        ) : null}
      </div>
      {props.onRetry ? (
        <button type="button" className="text-sm text-primary underline" onClick={props.onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}
