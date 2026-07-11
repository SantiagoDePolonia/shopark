import { NextResponse } from "next/server";
import { getSearch } from "@/lib/search/store";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = getSearch(id);
  if (!result) {
    return NextResponse.json({ error: "Search not found" }, { status: 404 });
  }
  return NextResponse.json(result);
}
