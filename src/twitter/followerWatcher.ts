import { EventEmitter } from "node:events";
import { env } from "../config/env";
import { FollowerProfile } from "../types";
import { TwitterScraperClient } from "./twitterClient";

type FollowerEvents = {
  followers: (followers: FollowerProfile[]) => void;
  error: (error: Error) => void;
};

export class FollowerWatcher extends EventEmitter {
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly client: TwitterScraperClient) {
    super();
  }

  start(): void {
    if (this.timer) return;
    this.poll();
    this.timer = setInterval(() => this.poll(), env.followerPollIntervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  on<U extends keyof FollowerEvents>(
    event: U,
    listener: FollowerEvents[U],
  ): this {
    return super.on(event, listener);
  }

  private async poll(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const followers = await this.client.fetchFollowers(
        env.cultTwitterHandle,
        env.followerFetchLimit,
      );
      this.emit("followers", followers);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.emit("error", err);
    } finally {
      this.running = false;
    }
  }
}
