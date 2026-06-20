import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, ExternalLink, Link2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Session } from "@/lib/session";
import {
  fetchLibraries,
  fetchLibrary,
  linkLibraryDocument,
  type LibraryDetail,
  type LibraryDocumentLink,
  type LibrarySummary,
  unlinkLibraryDocument,
} from "@/lib/api";

type TaskLibraryLinksProps = {
  session: Session;
  taskId: number;
  links: LibraryDocumentLink[];
  onChange: (links: LibraryDocumentLink[]) => void;
};

export function TaskLibraryLinks({ session, taskId, links, onChange }: TaskLibraryLinksProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [libraries, setLibraries] = useState<LibrarySummary[]>([]);
  const [selectedLibraryId, setSelectedLibraryId] = useState<string | null>(null);
  const [libraryDetail, setLibraryDetail] = useState<LibraryDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [linking, setLinking] = useState(false);
  const [search, setSearch] = useState("");

  const loadLibraries = useCallback(async () => {
    setLoading(true);
    try {
      const items = await fetchLibraries(session);
      setLibraries(items);
      if (!selectedLibraryId && items[0]) setSelectedLibraryId(items[0].id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load libraries");
    } finally {
      setLoading(false);
    }
  }, [session, selectedLibraryId]);

  useEffect(() => {
    if (!pickerOpen) return;
    void loadLibraries();
  }, [pickerOpen, loadLibraries]);

  useEffect(() => {
    if (!pickerOpen || !selectedLibraryId) {
      setLibraryDetail(null);
      return;
    }
    let active = true;
    void fetchLibrary(session, selectedLibraryId).then((detail) => {
      if (active) setLibraryDetail(detail);
    });
    return () => {
      active = false;
    };
  }, [pickerOpen, selectedLibraryId, session]);

  const linkedIds = useMemo(() => new Set(links.map((entry) => entry.documentId)), [links]);

  const visibleDocuments = useMemo(() => {
    const docs = libraryDetail !== null ? libraryDetail.documents : [];
    const query = search.trim().toLowerCase();
    if (!query) return docs;
    return docs.filter(
      (entry) =>
        entry.title.toLowerCase().includes(query) ||
        entry.description.toLowerCase().includes(query),
    );
  }, [libraryDetail, search]);

  async function handleLink(documentId: string) {
    setLinking(true);
    try {
      const next = await linkLibraryDocument(session, documentId, taskId);
      onChange(next);
      setPickerOpen(false);
      toast.success("Document linked");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to link document");
    } finally {
      setLinking(false);
    }
  }

  async function handleUnlink(documentId: string) {
    try {
      await unlinkLibraryDocument(session, documentId, taskId);
      onChange(links.filter((entry) => entry.documentId !== documentId));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to unlink document");
    }
  }

  return (
    <section className="panel-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-white">Linked documents</h2>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => setPickerOpen(true)}>
          <Plus className="h-4 w-4" />
          Link document
        </Button>
      </div>

      {links.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No linked documents yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {links.map((entry) => (
            <li
              key={entry.documentId}
              className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-[#111111] px-3 py-2"
            >
              <div className="min-w-0">
                <Link
                  to={`/library?doc=${entry.documentId}`}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                >
                  <Link2 className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{entry.documentTitle}</span>
                  <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
                </Link>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{entry.libraryTitle}</p>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => void handleUnlink(entry.documentId)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-lg border-white/10 bg-[#111111]">
          <DialogHeader>
            <DialogTitle>Link a library document</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="library-select">Library</Label>
              <select
                id="library-select"
                value={selectedLibraryId !== null ? selectedLibraryId : ""}
                onChange={(event) => setSelectedLibraryId(event.target.value || null)}
                className="h-10 w-full rounded-md border border-white/10 bg-[#0d0d0d] px-3 text-sm"
                disabled={loading}
              >
                {libraries.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="doc-search">Search documents</Label>
              <Input
                id="doc-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Filter by title"
              />
            </div>
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {visibleDocuments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No documents in this library.</p>
              ) : (
                visibleDocuments.map((entry) => {
                  const alreadyLinked = linkedIds.has(entry.id);
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      disabled={alreadyLinked || linking}
                      onClick={() => void handleLink(entry.id)}
                      className="flex w-full items-start justify-between gap-3 rounded-lg border border-white/[0.08] px-3 py-2 text-left transition-colors hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span>
                        <span className="block text-sm font-medium text-white">{entry.title}</span>
                        {entry.description ? (
                          <span className="mt-0.5 block line-clamp-2 text-xs text-muted-foreground">
                            {entry.description}
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {alreadyLinked ? "Linked" : "Add"}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
