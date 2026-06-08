export type PlaceSuggestion = {
  provider: string;
  providerPlaceId: string;
  name: string;
  address: string;
  city?: string;
  latitude?: number;
  longitude?: number;
};

export interface MapsProvider {
  search(query: string): Promise<PlaceSuggestion[]>;
  details(providerPlaceId: string): Promise<PlaceSuggestion | null>;
}

export class MockMapsProvider implements MapsProvider {
  async search(query: string) {
    if (!query.trim()) return [];
    return [{
      provider: "mock",
      providerPlaceId: `mock-${query.toLowerCase().replaceAll(" ", "-")}`,
      name: query,
      address: `${query}, Barcelona, Espana`,
      city: "Barcelona",
      latitude: 41.3874,
      longitude: 2.1686
    }];
  }

  async details(providerPlaceId: string) {
    return {
      provider: "mock",
      providerPlaceId,
      name: providerPlaceId.replace("mock-", "").replaceAll("-", " "),
      address: "Direccion editable manualmente",
      city: "Barcelona",
      latitude: 41.3874,
      longitude: 2.1686
    };
  }
}
