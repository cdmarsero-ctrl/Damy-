import { redirect } from "next/navigation";

/** Track slugs deep-link to the paths index, which already renders every unit
 *  and lesson inline. Kept so lesson breadcrumbs resolve rather than 404. */
export default async function TrackPage({ params }: { params: Promise<{ slug: string }> }) {
  await params;
  redirect("/path");
}
