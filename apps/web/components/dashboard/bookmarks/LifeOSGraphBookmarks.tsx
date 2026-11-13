"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type GraphGroup = { id: string; code: string; title: string; type: "project" | "resource" };
type GraphLink = {
  id: string; code: string; title: string; url: string | null; updatedAt: string;
  groups: { relationCode: string; predicate: string; entityCode: string; name: string; type: string }[];
};
type GraphPage = { source: string; bookmarks: GraphLink[]; hasMore: boolean; error?: string };
type GroupPage = { source: string; groups: GraphGroup[]; truncated: boolean; error?: string };

const API = "/api/lifeos-graph/bookmarks";
const LABEL = "Life OS Graph";

/**
 * Native Karakeep dashboard bookmark surface, backed by Life OS Graph only.
 * No client-side Karakeep SQLite writes, no polling, no tag-name grouping:
 * the small group labels shown here come from real reviewed Graph relations.
 */
export default function LifeOSGraphBookmarks() {
  const [items, setItems] = useState<GraphLink[]>([]);
  const [groups, setGroups] = useState<GraphGroup[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [groupId, setGroupId] = useState("");
  const [filter, setFilter] = useState("");

  const load = useCallback(async (pageNumber = 0) => {
    setLoading(true); setError("");
    try {
      const response = await fetch(API + "?page=" + pageNumber, {
        credentials: "same-origin", cache: "no-store",
      });
      const data = await response.json() as GraphPage;
      if (!response.ok || !Array.isArray(data.bookmarks) || data.source !== "lifeos_graph")
        throw Error(data.error ?? "Life OS Graph is niet beschikbaar");
      setItems(previous => pageNumber
        ? [...previous, ...data.bookmarks.filter(item => !previous.some(old => old.id === item.id))]
        : data.bookmarks);
      setPage(pageNumber);
      setHasMore(data.hasMore);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Graph lezen mislukt");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const controller = new AbortController();
    void fetch(API + "?kind=groups", {
      credentials: "same-origin", cache: "no-store", signal: controller.signal,
    }).then(async response => {
      const data = await response.json() as GroupPage;
      if (response.ok && data.source === "lifeos_graph" && Array.isArray(data.groups))
        setGroups(data.groups);
    }).catch(() => {});
    return () => controller.abort();
  }, [load]);

  async function createBookmark(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !url.trim()) return;
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch(API, {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.trim(), title: title.trim(),
          ...(groupId ? { groupId } : {}),
          operationId: crypto.randomUUID(),
        }),
      });
      const result = await response.json() as { status?: string; error?: string };
      if (!response.ok || !["created", "existing", "linked"].includes(result.status ?? ""))
        throw Error(result.error ?? "Bewaren in Graph is mislukt");
      setMessage(result.status === "existing"
        ? "Deze bookmark bestaat al in Life OS Graph"
        : "Bookmark en eventuele projectrelatie opgeslagen in Life OS Graph");
      setUrl(""); setTitle(""); setGroupId("");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Graph write mislukt");
    } finally {
      setSaving(false);
    }
  }

  const visible = items.filter(item => {
    const needle = filter.trim().toLowerCase();
    return !needle || [item.title, item.url ?? "", item.code,
      ...item.groups.map(group => group.name)].join(" ").toLowerCase().includes(needle);
  });

  return (
    <section className="flex min-h-0 w-full flex-col gap-5 p-4 sm:p-6"
      aria-label="Graph-backed Karakeep bookmarks">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Bookmarks</h1>
          <p className="text-sm text-muted-foreground">{LABEL} · canonieke entities en relaties</p>
        </div>
        <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}
          className="min-h-11 gap-2"><RefreshCw size={16}/><span>Vernieuwen</span></Button>
      </header>

      <form onSubmit={event => void createBookmark(event)}
        className="grid gap-3 rounded-xl border border-border bg-card p-4">
        <h2 className="flex items-center gap-2 font-medium"><Plus size={17}/> Bookmark bewaren</h2>
        <Input required type="url" placeholder="https://example.com" aria-label="URL"
          value={url} onChange={event => setUrl(event.target.value)}
          maxLength={2048} className="min-h-11"/>
        <Input type="text" placeholder="Titel (optioneel)" aria-label="Titel"
          value={title} onChange={event => setTitle(event.target.value)}
          maxLength={240} className="min-h-11"/>
        <label className="grid gap-1 text-sm">
          Project of Resource Card (optioneel)
          <select className="min-h-11 rounded-md border border-input bg-background px-3"
            value={groupId} onChange={event => setGroupId(event.target.value)}>
            <option value="">Geen koppeling</option>
            {groups.map(group => <option key={group.id} value={group.id}>
              {group.type === "project" ? "Project" : "Resource"} · {group.title}
            </option>)}
          </select>
        </label>
        <Button disabled={saving || !url.trim()} type="submit" className="min-h-11">
          {saving ? "Bewaren…" : "Bewaar rechtstreeks in Graph"}
        </Button>
      </form>

      <Input type="search" placeholder="Zoeken in geladen Graph-bookmarks"
        aria-label="Zoeken" value={filter}
        onChange={event => setFilter(event.target.value)} className="min-h-11"/>
      {message && <p role="status" className="text-sm text-green-600">{message}</p>}
      {error && <p role="alert" className="rounded-md border border-destructive p-3 text-sm text-destructive">{error}</p>}
      {loading && <p role="status" className="text-sm text-muted-foreground">Graph laden…</p>}
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map(item => <li key={item.id}
          className="min-w-0 rounded-xl border border-border bg-card p-4">
          <div className="flex flex-col gap-2">
            {item.url
              ? <a href={item.url} rel="noopener noreferrer" target="_blank"
                  className="flex items-start gap-2 break-words font-semibold hover:underline">
                  {item.title} <ExternalLink size={15} className="mt-1 shrink-0"/>
                </a>
              : <strong className="break-words">{item.title}</strong>}
            <span className="break-all text-xs text-muted-foreground">{item.code}</span>
            {item.url
              ? <span className="truncate text-xs text-muted-foreground">{item.url}</span>
              : <span className="text-xs text-muted-foreground">URL ontbreekt in de Graph-observaties</span>}
            <div className="flex flex-wrap gap-1">
              {item.groups.map(group => <span key={group.relationCode}
                className="rounded-md border border-border px-2 py-1 text-xs"
                title={group.entityCode + " · " + group.relationCode}>
                {group.type === "project" ? "Project" : "Resource"}: {group.name}
              </span>)}
            </div>
          </div>
        </li>)}
      </ul>
      {!loading && !visible.length && !error &&
        <p className="text-sm text-muted-foreground">Geen Graph-bookmarks gevonden.</p>}
      {hasMore && <Button type="button" variant="outline" disabled={loading}
        onClick={() => void load(page + 1)} className="min-h-11 self-center">
        Meer Graph-bookmarks laden
      </Button>}
    </section>
  );
}
