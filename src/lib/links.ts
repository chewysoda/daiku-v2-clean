/** A link pasted anywhere becomes a source: its address, the site it's from, and a readable title. */

/** A single web address and nothing else. */
export const isWebAddress = (text: string) => /^https?:\/\/\S+$/i.test(text.trim());

/**
 * What can be said about a page from its address alone, with no request made: the site (which counts as
 * its credit until someone adds an author) and a title from the last part of the path.
 */
export function linkDetails(url: string): { title: string; site: string } | null {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  const site = u.hostname.replace(/^www\./, "");
  const last = decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() ?? "")
    .replace(/\.(html?|php|aspx?)$/i, "")
    .replace(/[-_+]+/g, " ")
    .trim();
  const title = last ? last.charAt(0).toUpperCase() + last.slice(1) : site;
  return { title, site };
}
