/**
 * API data configuration
 * 
 * NOTE: The internal Twitter GraphQL endpoints are not supported in Twitter API v2.
 * This file is kept for backward compatibility but these endpoints should not be used.
 * Please use the official Twitter API v2 endpoints through the TwitterAuth class.
 */

import stringify from "json-stable-stringify";

/**
 * @deprecated Internal Twitter GraphQL endpoints are not supported in Twitter API v2
 */
const endpoints = {} as const;

export interface EndpointFieldInfo {
  /**
   * Request variables, used for providing arguments such as user IDs or result counts.
   */
  variables: Record<string, unknown>;

  /**
   * Request features, used for encoding feature flags into the request. These may either be
   * boolean values or numerically-encoded booleans (1 or 0). It is possible this may change
   * to include other representations of booleans as Twitter's backend evolves.
   */
  features: Record<string, unknown>;

  /**
   * Request field toggles, used for limiting how returned fields are represented. This is
   * rarely used.
   */
  fieldToggles: Record<string, unknown>;
}

type SomePartial<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

type EndpointVersion = string;
type EndpointName = string;
type EncodedVariables = string;
type EncodedFeatures = string;
type EncodedFieldToggles = string;

// TODO: Set up field-level Intellisense for the QraphQL parameters in these?
type EndpointFields<EndpointUrl> =
  EndpointUrl extends `https://twitter.com/i/api/graphql/${EndpointVersion}/${EndpointName}?variables=${EncodedVariables}&features=${EncodedFeatures}&fieldToggles=${EncodedFieldToggles}`
    ? EndpointFieldInfo
    : EndpointUrl extends `https://twitter.com/i/api/graphql/${EndpointVersion}/${EndpointName}?variables=${EncodedVariables}&features=${EncodedFeatures}`
      ? SomePartial<EndpointFieldInfo, "fieldToggles">
      : EndpointUrl extends `https://twitter.com/i/api/graphql/${EndpointVersion}/${EndpointName}?variables=${EncodedVariables}`
        ? SomePartial<EndpointFieldInfo, "features" | "fieldToggles">
        : Partial<EndpointFieldInfo>;

export type ApiRequestInfo<EndpointUrl> = EndpointFields<EndpointUrl> & {
  /**
   * The URL, without any GraphQL query parameters.
   */
  url: string;

  /**
   * Converts the request back into a URL to be sent to the Twitter API.
   */
  toRequestUrl(): string;
};

/** Wrapper class for API request information. */
class ApiRequest<EndpointUrl> {
  url: string;
  variables?: Record<string, unknown> | undefined;
  features?: Record<string, unknown> | undefined;
  fieldToggles?: Record<string, unknown> | undefined;

  constructor(info: Omit<ApiRequestInfo<EndpointUrl>, "toRequestUrl">) {
    this.url = info.url;
    this.variables = info.variables;
    this.features = info.features;
    this.fieldToggles = info.fieldToggles;
  }

  toRequestUrl(): string {
    const params = new URLSearchParams();

    // Only include query parameters with values
    if (this.variables) {
      // Stringify with the query keys in sorted order like the Go package
      params.set("variables", stringify(this.variables) ?? "");
    }

    if (this.features) {
      params.set("features", stringify(this.features) ?? "");
    }

    if (this.fieldToggles) {
      params.set("fieldToggles", stringify(this.fieldToggles) ?? "");
    }

    return `${this.url}?${params.toString()}`;
  }
}

/**
 * Parses information from a Twitter API endpoint using an example request
 * URL against that endpoint. This can be used to extract GraphQL parameters
 * in order to easily reuse and/or override them later.
 * @param example An example of the endpoint to analyze.
 * @returns The parsed endpoint information.
 */
function parseEndpointExample<
  Endpoints,
  Endpoint extends string & keyof Endpoints,
>(example: Endpoint): ApiRequestInfo<Endpoints[Endpoint]> {
  const { protocol, host, pathname, searchParams: query } = new URL(example);

  const base = `${protocol}//${host}${pathname}`;
  const variables = query.get("variables");
  const features = query.get("features");
  const fieldToggles = query.get("fieldToggles");

  return new ApiRequest<Endpoints[Endpoint]>({
    url: base,
    variables: variables ? JSON.parse(variables) : undefined,
    features: features ? JSON.parse(features) : undefined,
    fieldToggles: fieldToggles ? JSON.parse(fieldToggles) : undefined,
  } as Omit<
    ApiRequestInfo<Endpoints[Endpoint]>,
    "toRequestUrl"
  >) as ApiRequestInfo<Endpoints[Endpoint]>;
}

type ApiRequestFactory<Endpoints> = {
  [Endpoint in keyof Endpoints as `create${string & Endpoint}Request`]: () => ApiRequestInfo<
    Endpoints[Endpoint]
  >;
};

function createApiRequestFactory<Endpoints extends Record<string, string>>(
  endpoints: Endpoints
): ApiRequestFactory<Endpoints> {
  type UntypedApiRequestFactory = ApiRequestFactory<Record<string, string>>;

  return Object.entries(endpoints)
    .map<UntypedApiRequestFactory>(([endpointName, endpointExample]) => {
      // Create a partial factory for only one endpoint
      return {
        [`create${endpointName}Request`]: () => {
          // Create a new instance on each invocation so that we can safely
          // mutate requests before sending them off
          return parseEndpointExample<Endpoints, any>(endpointExample);
        },
      };
    })
    .reduce((agg, next) => {
      // Merge all of our factories into one that includes every endpoint
      return Object.assign(agg, next);
    }) as ApiRequestFactory<Endpoints>;
}

/**
 * @deprecated Use Twitter API v2 instead
 */
export const apiRequestFactory = {
  createUserTweetsRequest: () => {
    throw new Error("GraphQL endpoints not supported. Use Twitter API v2 instead.");
  },
  createUserTweetsAndRepliesRequest: () => {
    throw new Error("GraphQL endpoints not supported. Use Twitter API v2 instead.");
  },
  createUserLikedTweetsRequest: () => {
    throw new Error("GraphQL endpoints not supported. Use Twitter API v2 instead.");
  },
  createTweetDetailRequest: () => {
    throw new Error("GraphQL endpoints not supported. Use Twitter API v2 instead.");
  },
  createTweetDetailArticleRequest: () => {
    throw new Error("GraphQL endpoints not supported. Use Twitter API v2 instead.");
  },
  createTweetResultByRestIdRequest: () => {
    throw new Error("GraphQL endpoints not supported. Use Twitter API v2 instead.");
  },
  createListTweetsRequest: () => {
    throw new Error("GraphQL endpoints not supported. Use Twitter API v2 instead.");
  },
};
