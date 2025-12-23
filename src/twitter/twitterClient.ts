import { Scraper } from "@the-convocation/twitter-scraper";
import { env } from "../config/env";
import { X_PROFILE_BASE_URL } from "../config/constants";
import { FollowerProfile } from "../types";

const parseCookies = (value?: string): string[] => {
  if (!value) return [];
  const trimmed = value.trim();
  if (trimmed.startsWith("[")) {
    return JSON.parse(trimmed) as string[];
  }
  return trimmed
    .split(";")
    .map((cookie) => cookie.trim())
    .filter(Boolean);
};

export class TwitterScraperClient {
  private scraper = new Scraper();
  private initialized = false;

  private async init(): Promise<void> {
    if (this.initialized) return;

    const cookies = parseCookies(env.xScraperCookies);
    if (cookies.length > 0) {
      await this.scraper.setCookies(cookies);
      this.initialized = true;
      return;
    }

    if (env.xScraperUsername && env.xScraperPassword) {
      await this.scraper.login(
        env.xScraperUsername,
        env.xScraperPassword,
        env.xScraperEmail,
        env.xScraper2faSecret,
      );
      this.initialized = true;
      return;
    }

    this.initialized = true;
  }

  public async fetchFollowers(
    handle: string,
    limit: number,
  ): Promise<FollowerProfile[]> {
    await this.init();

    const loggedIn = await this.scraper.isLoggedIn();
    if (!loggedIn) {
      throw new Error(
        "Follower scraping requires an authenticated session. Provide X_SCRAPER_COOKIES or X_SCRAPER_USERNAME/PASSWORD.",
      );
    }

    const username = handle.replace(/^@/, "");
    const userId = await this.scraper.getUserIdByScreenName(username);

    const profiles: FollowerProfile[] = [];
    for await (const profile of this.scraper.getFollowers(userId, limit)) {
      if (!profile.username) continue;
      profiles.push({
        id: profile.userId,
        username: profile.username,
        displayName: profile.name,
        profileUrl: profile.url ?? `${X_PROFILE_BASE_URL}/${profile.username}`,
      });
    }

    return profiles;
  }
}
