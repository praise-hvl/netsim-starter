"use client";
// Reads ?source= (and &cores=) in the browser, so /board stays a static page (GitHub Pages has no server).
import { useSearchParams } from "next/navigation";
import { MyBoard } from "@/board/student/board";
import { BUS_URL } from "@/app/_lib/bus-connection";
import { sourceFromQuery } from "@/board/feed/source";

export function BoardFromUrl() {
  const query = useSearchParams();
  return <MyBoard initialSource={sourceFromQuery(query, BUS_URL)} />;
}
