import {
  DynamoDBClient,
  type DynamoDBClientConfig
} from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import type { Optional } from "../types.js";

/**
 * The contract dyna-record needs from a DynamoDB document client: the ability
 * to send a command.
 *
 * Deliberately structural rather than the SDK's `DynamoDBDocumentClient`. That
 * class extends smithy's `Client`, which declares a private member, so
 * TypeScript compares it nominally — a client built from a second installation
 * of the AWS SDK would fail to satisfy it even when the two interoperate
 * perfectly at runtime. The `never` parameters are what make every copy's
 * overloaded `send` assignable here without introducing `any`, and they are
 * also what make a hand written test double assignable with no cast.
 *
 * A supplied client governs more than transport: the AWS SDK passes the
 * *sending* client's config to every command, and lib-dynamodb reads
 * `translateConfig` from it, so a client's marshalling options apply to
 * dyna-record's own commands. Supply one built with the SDK's defaults — a
 * client with `unmarshallOptions.wrapNumbers` enabled is rejected where the
 * table is declared, since every number attribute would otherwise hydrate as a
 * wrapper object and fail its schema on the first read.
 */
export interface DynaRecordDocumentClient {
  send: (command: never, options?: never) => Promise<unknown>;
}

/**
 * How a table reaches DynamoDB.
 *
 * Supply neither option and dyna-record constructs a client with the AWS SDK's
 * default resolution: region from `AWS_REGION` / `AWS_DEFAULT_REGION` or the
 * shared config profile, credentials from the provider chain, and endpoint from
 * `AWS_ENDPOINT_URL_DYNAMODB` / `AWS_ENDPOINT_URL` — which is all a local
 * DynamoDB needs.
 *
 * The two options are mutually exclusive: `clientConfig` configures the client
 * dyna-record constructs, `client` replaces it.
 * @example Pointing one table at another region
 * ```typescript
 * @Table({ name: "storefront", clientConfig: { region: "us-east-1" } })
 * abstract class Storefront extends DynaRecord {}
 * ```
 * @example Supplying an instrumented or shared client
 * ```typescript
 * @Table({
 *   name: "storefront",
 *   client: DynamoDBDocumentClient.from(new DynamoDBClient({ region: "us-east-1" }))
 * })
 * abstract class Storefront extends DynaRecord {}
 * ```
 * @example Binding late, when the client cannot exist where the table is declared
 *
 * Decorators evaluate at module load, before application bootstrap runs, so a
 * client built during startup is not available here. Delegate to it instead:
 * ```typescript
 * @Table({
 *   name: "storefront",
 *   client: { send: command => getClient().send(command) }
 * })
 * abstract class Storefront extends DynaRecord {}
 * ```
 */
export type TableClientOptions =
  | { client?: DynaRecordDocumentClient; clientConfig?: never }
  | { client?: never; clientConfig?: DynamoDBClientConfig };

/**
 * The process-wide client for tables that configure none. Held here rather than
 * constructed at import so that importing dyna-record has no side effect and so
 * that the environment is read at first use, not at module evaluation
 */
let defaultClient: Optional<DynaRecordDocumentClient>;

/**
 * Whether a value can send commands. A user defined type predicate rather than
 * an assertion, so the narrowing is checked rather than asserted
 * @param client - The value to test
 * @returns Whether the value satisfies {@link DynaRecordDocumentClient}
 */
const canSend = (client: unknown): client is DynaRecordDocumentClient =>
  typeof client === "object" &&
  client !== null &&
  "send" in client &&
  typeof client.send === "function";

/**
 * Returns a client that can send commands, or throws naming the table class.
 *
 * This is the check the type system cannot make: the public option is
 * structural by necessity (see {@link DynaRecordDocumentClient}), so a value
 * that cannot send commands reaches here rather than failing to compile. It
 * runs where the table is declared, so the failure reads as configuration
 * rather than as an error from inside an operation
 * @param client - The value supplied through the `client` option
 * @param tableClassName - Name of the table class the value was declared on
 * @returns The value, narrowed
 */
export const assertCanSend = (
  client: unknown,
  tableClassName: string
): DynaRecordDocumentClient => {
  if (!canSend(client)) {
    throw new Error(
      `Table ${tableClassName} was given a client that cannot send commands. The client option takes a DynamoDBDocumentClient`
    );
  }

  return client;
};

/**
 * Whether a client is configured to unmarshall numbers as wrapper objects.
 *
 * Walked defensively rather than typed: {@link DynaRecordDocumentClient} only
 * promises `send`, so every level here may be absent — a test double has no
 * config at all, and that is not an error
 * @param client - The client supplied through the `client` option
 * @returns Whether `unmarshallOptions.wrapNumbers` is enabled on it
 */
const unmarshallsWrappedNumbers = (
  client: DynaRecordDocumentClient
): boolean => {
  if (!("config" in client)) return false;
  const { config } = client;

  if (typeof config !== "object" || config === null) return false;
  if (!("translateConfig" in config)) return false;
  const { translateConfig } = config;

  if (typeof translateConfig !== "object" || translateConfig === null)
    return false;
  if (!("unmarshallOptions" in translateConfig)) return false;
  const { unmarshallOptions } = translateConfig;

  if (typeof unmarshallOptions !== "object" || unmarshallOptions === null)
    return false;

  return (
    "wrapNumbers" in unmarshallOptions && unmarshallOptions.wrapNumbers === true
  );
};

/**
 * Throws if a supplied client would marshall in a way dyna-record cannot read
 * back.
 *
 * The AWS SDK hands every command the *sending* client's config, and
 * lib-dynamodb reads `translateConfig` from it, so an injected client's
 * marshalling applies to dyna-record's own commands. `wrapNumbers` is the
 * setting that breaks silently: every number attribute would arrive as a
 * wrapper object and fail its attribute schema on the first read, far from the
 * declaration that caused it
 * @param client - The client supplied through the `client` option
 * @param tableClassName - Name of the table class the client was declared on
 */
const assertMarshallingSupported = (
  client: DynaRecordDocumentClient,
  tableClassName: string
): void => {
  if (unmarshallsWrappedNumbers(client)) {
    throw new Error(
      `Table ${tableClassName} was given a client with unmarshallOptions.wrapNumbers enabled, which dyna-record cannot read number attributes back from. Give dyna-record its own client through clientConfig, or supply one built with the SDK's default marshalling`
    );
  }
};

/**
 * Returns the shared client used by every table that configures none,
 * constructing it on first use.
 *
 * The empty config is the point: passing no region is what lets the SDK resolve
 * region, credentials and endpoint from the environment, the shared config
 * profile and the credential chain
 * @returns The process-wide default client
 */
export const getDefaultClient = (): DynaRecordDocumentClient => {
  defaultClient ??= DynamoDBDocumentClient.from(new DynamoDBClient({}));
  return defaultClient;
};

/**
 * Drops the memoized default client so the next caller constructs a new one.
 *
 * Internal, for tests that assert on client construction. Deliberately absent
 * from the package entry point — a consumer has no reason to discard a client
 * dyna-record is using
 */
export const resetDefaultClient = (): void => {
  defaultClient = undefined;
};

/**
 * Checks the client options a table was declared with and returns them, so
 * that a misconfigured table fails where it is declared rather than on its
 * first query.
 *
 * The exclusivity check reads the options through a widened view on purpose.
 * {@link TableClientOptions} already forbids declaring both, so against the
 * declared type the check is unreachable — and unreachable is the point: a
 * JavaScript caller gets no compile error, and this is the check they get
 * instead
 * @param options - The client options passed to the Table decorator
 * @param tableClassName - Name of the table class being declared
 * @returns The options, with any supplied client proven able to send commands
 */
export const normalizeClientOptions = (
  options: TableClientOptions,
  tableClassName: string
): TableClientOptions => {
  const declared: { client?: unknown; clientConfig?: unknown } = options;

  if (declared.client !== undefined && declared.clientConfig !== undefined) {
    throw new Error(
      `Table ${tableClassName} declares both client and clientConfig. Declare one: clientConfig configures the client dyna-record builds, client replaces it`
    );
  }

  const { client, clientConfig } = options;

  if (client !== undefined) {
    const checked = assertCanSend(client, tableClassName);
    assertMarshallingSupported(checked, tableClassName);
    return { client: checked };
  }

  if (clientConfig !== undefined) {
    return { clientConfig };
  }

  return {};
};

/**
 * Resolves the client a table sends through: its own client, a client built
 * from its config, or the shared default, in that order.
 *
 * Takes options already checked by {@link normalizeClientOptions}, so it does
 * not re-validate. Pure with respect to the table — the result is memoized per
 * table by {@link TableMetadata}, so a table builds at most one client
 * @param options - The table's normalized client options
 * @returns The client for this table
 */
export const resolveClient = (
  options: TableClientOptions
): DynaRecordDocumentClient => {
  const { client, clientConfig } = options;

  if (client !== undefined) {
    return client;
  }

  if (clientConfig !== undefined) {
    return DynamoDBDocumentClient.from(new DynamoDBClient(clientConfig));
  }

  return getDefaultClient();
};
