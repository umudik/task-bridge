import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BookOpen, FileText, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/hooks/useSession";
import {
  createLibrary,
  createLibraryDocument,
  deleteLibrary,
  deleteLibraryDocument,
  fetchLibraries,
  fetchLibrary,
  fetchLibraryDocument,
  saveLibrary,
  saveLibraryDocument,
  type LibraryDetail,
  type LibraryDocument,
  type LibraryDocumentSummary,
  type LibrarySummary,
} from "@/lib/api";
import { cn } from "@/lib/utils";

const UNTITLED_LIBRARY = "Untitled library";
const UNTITLED_DOCUMENT = "Untitled document";

export function LibraryPage() {
  const session = useSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const [libraries, setLibraries] = useState<LibrarySummary[]>([]);
  const [selectedLibraryId, setSelectedLibraryId] = useState<string | null>(null);
  const [libraryDetail, setLibraryDetail] = useState<LibraryDetail | null>(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [documentDetail, setDocumentDetail] = useState<LibraryDocument | null>(null);
  const [libraryTitle, setLibraryTitle] = useState("");
  const [libraryDescription, setLibraryDescription] = useState("");
  const [documentTitle, setDocumentTitle] = useState("");
  const [documentDescription, setDocumentDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creatingLibrary, setCreatingLibrary] = useState(false);
  const [creatingDocument, setCreatingDocument] = useState(false);

  const docFromUrl = searchParams.get("doc");

  const reloadLibraries = useCallback(async () => {
    if (!session) return;
    const items = await fetchLibraries(session);
    setLibraries(items);
    return items;
  }, [session]);

  const loadLibrary = useCallback(
    async (libraryId: string) => {
      if (!session) return;
      const detail = await fetchLibrary(session, libraryId);
      setLibraryDetail(detail);
      setLibraryTitle(detail.title);
      setLibraryDescription(detail.description);
      return detail;
    },
    [session],
  );

  const loadDocument = useCallback(
    async (documentId: string) => {
      if (!session) return;
      const detail = await fetchLibraryDocument(session, documentId);
      setDocumentDetail(detail);
      setDocumentTitle(detail.title);
      setDocumentDescription(detail.description);
      setSelectedLibraryId(detail.libraryId);
      setSelectedDocumentId(detail.id);
      return detail;
    },
    [session],
  );

  useEffect(() => {
    if (!session) return;
    let active = true;
    async function boot() {
      setLoading(true);
      try {
        const items = await reloadLibraries();
        if (!active) return;
        if (docFromUrl) {
          const doc = await loadDocument(docFromUrl);
          if (doc) await loadLibrary(doc.libraryId);
        } else if (items?.[0]) {
          setSelectedLibraryId(items[0].id);
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to load library");
      } finally {
        if (active) setLoading(false);
      }
    }
    void boot();
    return () => {
      active = false;
    };
  }, [session, docFromUrl, reloadLibraries, loadDocument, loadLibrary]);

  useEffect(() => {
    if (!session || !selectedLibraryId || docFromUrl) return;
    void loadLibrary(selectedLibraryId).catch((error) => {
      toast.error(error instanceof Error ? error.message : "Failed to load library");
    });
  }, [session, selectedLibraryId, docFromUrl, loadLibrary]);

  useEffect(() => {
    if (!session || !selectedDocumentId) {
      setDocumentDetail(null);
      return;
    }
    void loadDocument(selectedDocumentId).catch((error) => {
      toast.error(error instanceof Error ? error.message : "Failed to load document");
    });
  }, [session, selectedDocumentId, loadDocument]);

  const documents = useMemo<LibraryDocumentSummary[]>(
    () => libraryDetail?.documents ?? [],
    [libraryDetail?.documents],
  );

  const selectedLibrary = libraries.find((entry) => entry.id === selectedLibraryId) ?? null;

  function selectDocument(documentId: string) {
    setSelectedDocumentId(documentId);
    setSearchParams({ doc: documentId });
  }

  function selectLibrary(libraryId: string) {
    setSelectedLibraryId(libraryId);
    setSelectedDocumentId(null);
    setSearchParams({});
  }

  async function handleCreateLibrary() {
    if (!session) return;
    setCreatingLibrary(true);
    try {
      const created = await createLibrary(session, { title: UNTITLED_LIBRARY });
      await reloadLibraries();
      setSelectedLibraryId(created.id);
      setLibraryDetail(created);
      setLibraryTitle(created.title);
      setLibraryDescription(created.description);
      setSelectedDocumentId(null);
      setSearchParams({});
      toast.success("Library created");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create library");
    } finally {
      setCreatingLibrary(false);
    }
  }

  async function handleSaveLibrary() {
    if (!session || !selectedLibraryId) return;
    setSaving(true);
    try {
      const saved = await saveLibrary(session, selectedLibraryId, {
        title: libraryTitle,
        description: libraryDescription,
      });
      setLibraryDetail(saved);
      await reloadLibraries();
      toast.success("Library saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save library");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteLibrary() {
    if (!session || !selectedLibraryId) return;
    if (!window.confirm("Delete this library and all documents?")) return;
    try {
      await deleteLibrary(session, selectedLibraryId);
      const items = await reloadLibraries();
      setSelectedLibraryId(items?.[0]?.id ?? null);
      setSelectedDocumentId(null);
      setSearchParams({});
      toast.success("Library deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete library");
    }
  }

  async function handleCreateDocument() {
    if (!session || !selectedLibraryId) return;
    setCreatingDocument(true);
    try {
      const created = await createLibraryDocument(session, selectedLibraryId, {
        title: UNTITLED_DOCUMENT,
      });
      await loadLibrary(selectedLibraryId);
      selectDocument(created.id);
      toast.success("Document created");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create document");
    } finally {
      setCreatingDocument(false);
    }
  }

  async function handleSaveDocument() {
    if (!session || !selectedLibraryId || !selectedDocumentId) return;
    setSaving(true);
    try {
      await saveLibraryDocument(session, selectedLibraryId, selectedDocumentId, {
        title: documentTitle,
        description: documentDescription,
      });
      await loadLibrary(selectedLibraryId);
      toast.success("Document saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save document");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteDocument() {
    if (!session || !selectedLibraryId || !selectedDocumentId) return;
    if (!window.confirm("Delete this document?")) return;
    try {
      await deleteLibraryDocument(session, selectedLibraryId, selectedDocumentId);
      setSelectedDocumentId(null);
      setSearchParams({});
      await loadLibrary(selectedLibraryId);
      toast.success("Document deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete document");
    }
  }

  if (!session) return null;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <PageHeader
        title="Library"
        subtitle={
          loading
            ? "Loading…"
            : libraries.length > 0
              ? `${libraries.length} librar${libraries.length === 1 ? "y" : "ies"} · link docs to epics`
              : "Shared docs for epics"
        }
      />

      <div className="flex min-h-0 flex-1">
          <aside className="flex w-[240px] shrink-0 flex-col border-r border-white/[0.07] bg-black">
            <div className="flex items-center justify-between border-b border-white/[0.07] px-3 py-3">
              <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Libraries
              </p>
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-8 w-8 shrink-0"
                disabled={creatingLibrary}
                onClick={() => void handleCreateLibrary()}
              >
                {creatingLibrary ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              </Button>
            </div>
            <div className="flex-1 space-y-0.5 overflow-y-auto p-2">
              {loading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : libraries.length === 0 ? (
                <p className="px-3 py-4 text-xs text-muted-foreground">No libraries yet. Use + to add one.</p>
              ) : (
                libraries.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => selectLibrary(entry.id)}
                    className={cn(
                      "w-full rounded-lg px-3 py-2.5 text-left transition-colors",
                      selectedLibraryId === entry.id
                        ? "bg-white/[0.09] text-white"
                        : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
                    )}
                  >
                    <p className="truncate text-sm font-medium">{entry.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {entry.documentCount} document{entry.documentCount === 1 ? "" : "s"}
                    </p>
                  </button>
                ))
              )}
            </div>
          </aside>

          <aside
            className={cn(
              "flex w-[260px] shrink-0 flex-col border-r border-white/[0.07] bg-[#0a0a0a]",
              !selectedLibraryId && "opacity-60",
            )}
          >
            <div className="flex items-center justify-between border-b border-white/[0.07] px-3 py-3">
              <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Documents
              </p>
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-8 w-8 shrink-0"
                disabled={!selectedLibraryId || creatingDocument}
                onClick={() => void handleCreateDocument()}
              >
                {creatingDocument ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {!selectedLibraryId ? (
                <p className="px-3 py-4 text-xs text-muted-foreground">Select a library first.</p>
              ) : documents.length === 0 ? (
                <p className="px-3 py-4 text-xs text-muted-foreground">No documents yet. Use + to add one.</p>
              ) : (
                documents.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => selectDocument(entry.id)}
                    className={cn(
                      "mb-0.5 flex w-full items-start gap-2 rounded-lg px-3 py-2.5 text-left transition-colors",
                      selectedDocumentId === entry.id
                        ? "bg-primary/15 text-primary"
                        : "text-foreground hover:bg-white/[0.04]",
                    )}
                  >
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 opacity-70" />
                    <span className="min-w-0 truncate text-sm font-medium">{entry.title}</span>
                  </button>
                ))
              )}
            </div>
          </aside>

          <section className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[#080808]">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/[0.07] px-6 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {selectedDocumentId ? (
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <BookOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <h2 className="truncate text-base font-semibold tracking-tight text-white">
                    {selectedDocumentId
                      ? documentTitle || "Document"
                      : selectedLibrary
                        ? libraryTitle || selectedLibrary.title
                        : "Library"}
                  </h2>
                </div>
                {selectedDocumentId && documentDetail ? (
                  <p className="mt-0.5 truncate pl-6 text-xs text-muted-foreground">
                    {documentDetail.libraryTitle} · {documentDetail.linkCount} epic link
                    {documentDetail.linkCount === 1 ? "" : "s"}
                  </p>
                ) : selectedLibraryId ? (
                  <p className="mt-0.5 pl-6 text-xs text-muted-foreground">
                    {documents.length} document{documents.length === 1 ? "" : "s"} in this library
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {selectedDocumentId ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void handleDeleteDocument()}
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </Button>
                    <Button type="button" size="sm" disabled={saving} onClick={() => void handleSaveDocument()}>
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Save
                    </Button>
                  </>
                ) : selectedLibraryId ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void handleDeleteLibrary()}
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </Button>
                    <Button type="button" size="sm" disabled={saving} onClick={() => void handleSaveLibrary()}>
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Save
                    </Button>
                  </>
                ) : null}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {selectedDocumentId ? (
                <div className="mx-auto max-w-2xl space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Title</label>
                    <Input
                      value={documentTitle}
                      onChange={(event) => setDocumentTitle(event.target.value)}
                      className="border-white/[0.1] bg-[#111111]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Content</label>
                    <Textarea
                      value={documentDescription}
                      onChange={(event) => setDocumentDescription(event.target.value)}
                      rows={18}
                      className="min-h-[360px] resize-y rounded-xl border-white/[0.1] bg-[#111111]"
                      placeholder="Notes, specs, links, acceptance criteria…"
                    />
                  </div>
                </div>
              ) : selectedLibraryId ? (
                <div className="mx-auto max-w-2xl space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Title</label>
                    <Input
                      value={libraryTitle}
                      onChange={(event) => setLibraryTitle(event.target.value)}
                      className="border-white/[0.10] bg-[#111111]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Description</label>
                    <Textarea
                      value={libraryDescription}
                      onChange={(event) => setLibraryDescription(event.target.value)}
                      rows={8}
                      className="resize-y rounded-xl border-white/[0.10] bg-[#111111]"
                      placeholder="What this library is for"
                    />
                  </div>
                  {documents.length === 0 ? (
                    <div className="panel-card flex flex-col items-center px-6 py-10 text-center">
                      <FileText className="mb-3 h-8 w-8 text-muted-foreground/50" />
                      <p className="text-sm text-muted-foreground">
                        Add a document with +, then link it from an epic detail page.
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Select a document from the list or create a new one with +.
                    </p>
                  )}
                </div>
              ) : (
                <div className="panel-card mx-auto flex max-w-md flex-col items-center px-8 py-14 text-center">
                  <BookOpen className="mb-4 h-10 w-10 text-muted-foreground/50" />
                  <p className="text-sm font-medium text-white">Create your first library</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Press + in the sidebar, then name it in the editor.
                  </p>
                </div>
              )}
            </div>
          </section>
      </div>
    </div>
  );
}
