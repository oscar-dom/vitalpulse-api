import { randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import { resourceUrl } from "./http.js";
import type { SearchParams } from "./search.js";
import type { Bundle, BundleLink, Resource } from "./types.js";

interface SearchsetInput {
  resourceType: string;
  // The parameters the search really used: they are repeated in every link.
  params: SearchParams;
  page: number;
  count: number;
  total: number;
  matches: Resource[];
  // Resources added by _include, listed after the matches.
  includes?: Resource[];
}

const searchUrl = (resourceType: string, params: SearchParams, page: number, count: number) => {
  const query = new URLSearchParams();
  for (const [name, values] of params) {
    if (name === "_page" || name === "_count") continue;
    for (const value of values) query.append(name, value);
  }
  query.set("_count", String(count));
  query.set("_page", String(page));
  return `${env.FHIR_BASE_URL}/${resourceType}?${query.toString()}`;
};

/**
 * The result of a search: a Bundle of type searchset with the total number of matches
 * and links to the other pages. A client never builds URLs: it follows "next" until
 * there is none.
 */
export const searchsetBundle = ({
  resourceType,
  params,
  page,
  count,
  total,
  matches,
  includes = [],
}: SearchsetInput): Bundle => {
  // _count=0 only asks for the total, so there are no pages to link.
  const lastPage = count === 0 ? 1 : Math.max(1, Math.ceil(total / count));
  const link = (relation: string, target: number): BundleLink => ({
    relation,
    url: searchUrl(resourceType, params, target, count),
  });

  const links: BundleLink[] = [link("self", page)];
  if (count > 0) {
    links.push(link("first", 1));
    if (page > 1) links.push(link("previous", Math.min(page - 1, lastPage)));
    if (page < lastPage) links.push(link("next", page + 1));
    links.push(link("last", lastPage));
  }

  const entry = (mode: "match" | "include") => (resource: Resource) => ({
    fullUrl: resourceUrl(resource.resourceType, resource.id ?? ""),
    resource,
    search: { mode },
  });

  return {
    resourceType: "Bundle",
    id: randomUUID(),
    meta: { lastUpdated: new Date().toISOString() },
    type: "searchset",
    total,
    link: links,
    entry: [...matches.map(entry("match")), ...includes.map(entry("include"))],
  };
};
