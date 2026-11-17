declare global {
  interface Window {
    google?: {
      maps: {
        places: {
          Autocomplete: new (
            inputField: HTMLInputElement,
            options?: {
              componentRestrictions?: { country: string | string[] };
              fields?: string[];
              types?: string[];
            }
          ) => {
            addListener: (event: string, callback: () => void) => void;
            getPlace: () => {
              formatted_address?: string;
              address_components?: Array<{
                types: string[];
                long_name: string;
                short_name: string;
              }>;
              geometry?: unknown;
            };
          };
          PlacesServiceStatus: {
            OK: string;
            ZERO_RESULTS: string;
          };
        };
        event: {
          clearInstanceListeners: (instance: unknown) => void;
        };
      };
    };
  }
}

export {};

