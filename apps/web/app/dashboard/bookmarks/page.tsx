import type { Metadata } from "next";
import React from "react";
import Bookmarks from "@/components/dashboard/bookmarks/Bookmarks";
import LifeOSGraphBookmarks from "@/components/dashboard/bookmarks/LifeOSGraphBookmarks";
import { useTranslation } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return {
    title: `${t("common.home")} | Karakeep`,
  };
}

export default async function BookmarksPage() {
  // The existing native Karakeep bookmarks route, never an iframe or shadow app.
  // Fail closed by default until OAuth/read/write/asset regression has passed.
  if (process.env.LIFEOS_GRAPH_MODE_ENABLED === "true") return <LifeOSGraphBookmarks />;
  return (
    <div>
      <Bookmarks query={{ archived: false }} showEditorCard={true} />
    </div>
  );
}
