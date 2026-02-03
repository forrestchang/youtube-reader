import { DEFAULT_API_URL, fetchTranscripts as fetchFromApi } from "../api";
import { extractTranscriptItems } from "../normalize";
import type { TranscriptProvider, TranscriptResult } from "./index";

export class ApiProvider implements TranscriptProvider {
  name = "api";
  private token: string;
  private apiUrl: string;

  constructor(token: string, apiUrl: string = DEFAULT_API_URL) {
    this.token = token;
    this.apiUrl = apiUrl;
  }

  async available(): Promise<boolean> {
    return Boolean(this.token);
  }

  async fetch(videoId: string): Promise<TranscriptResult | null> {
    const response = await fetchFromApi([videoId], this.token, this.apiUrl);
    const items = extractTranscriptItems(response);

    if (!items.length || !items[0].text) {
      return null;
    }

    const item = items[0];
    return {
      text: item.text,
      title: item.title,
      source: "api"
    };
  }
}
